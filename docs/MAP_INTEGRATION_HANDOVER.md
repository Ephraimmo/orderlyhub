# Map Integration Handover — ForkFleet Platform

**Audience:** the AI agents building the **Super Admin app**, the **Driver app**, and the **Customer app**.
**Goal:** every app shows a working map exactly like the Restaurant Admin app does today, and any "map not showing / blank / grey box" bug can be fixed by following this document.

---

## 1. What the Restaurant Admin app actually uses (the reference implementation)

Important, read this first: the Restaurant Admin map is **NOT** the Google Maps JavaScript SDK.
It is a **keyless OpenStreetMap embed inside a plain `<iframe>`**. There is no API key, no npm package, no script loader, no billing account. That is exactly why it always renders.

If your app currently shows a blank map because a Google Maps API key is missing, invalid, referrer-restricted, or unbilled — **switch to this implementation**. It is the platform standard.

### 1.1 The exact code (copy this)

```ts
/** Build an OpenStreetMap embed URL centred on a coordinate with a pin. */
const mapSrc = (lat: number, lng: number) => {
  const d = 0.01; // ~1.1 km half-span. Smaller = more zoomed in.
  const bbox = [lng - d, lat - d, lng + d, lat + d].join("%2C");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
};
```

```tsx
{coords ? (
  <iframe
    title="Location map"
    src={mapSrc(coords.lat, coords.lng)}
    className="h-[320px] w-full border-0"
    loading="lazy"
  />
) : (
  <div className="flex h-[320px] flex-col items-center justify-center gap-2 px-6 text-center">
    <MapPin className="h-8 w-8 text-muted-foreground" />
    <p className="text-sm text-muted-foreground">
      Add latitude and longitude to preview the pin.
    </p>
  </div>
)}
```

### 1.2 Coordinate guard (never pass junk to the map)

```ts
const numberOrNull = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const coords = useMemo(() => {
  const lat = numberOrNull(form.latitude);
  const lng = numberOrNull(form.longitude);
  if (lat == null || lng == null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}, [form.latitude, form.longitude]);
```

Validation rules enforced before saving:
- latitude must be between **-90 and 90**
- longitude must be between **-180 and 180**
- empty string is allowed and means "no location set" — render the fallback panel, never an iframe

### 1.3 "Use my current location" button

```ts
if (!navigator.geolocation) { toast.error("Geolocation is not supported"); return; }
navigator.geolocation.getCurrentPosition(
  (pos) => setForm((f) => ({
    ...f,
    latitude: pos.coords.latitude.toFixed(6),
    longitude: pos.coords.longitude.toFixed(6),
  })),
  () => toast.error("Could not get your location. Allow location access and retry."),
  { enableHighAccuracy: true, timeout: 10000 },
);
```
Geolocation only works over **HTTPS or localhost**. On plain `http://` it silently fails — that is a common cause of "the locate button does nothing".

---

## 2. Where the coordinates come from (shared Firestore contract)

All three apps read the **same** Firestore data. Do not invent new fields or new collections.

| Data | Firestore path | Fields |
|---|---|---|
| Restaurant primary location | `restaurants/{restaurantId}` | `address`, `city`, `latitude`, `longitude` |
| Branch locations | `restaurantBranches/{restaurantId}` — one document, each **field key is a branch id** | per branch: `id`, `name`, `address`, `city`, `latitude`, `longitude`, `is_main`, `is_active`, `delivery_radius_km` |
| Driver live position | `drivers/{driverId}` | `latitude`, `longitude`, `status`, `updated_at` |
| Order delivery target | order document | customer `latitude` / `longitude` (fall back to the branch coords if absent) |

Notes:
- **Branches are NOT a subcollection.** `restaurantBranches/{restaurantId}` is a single document whose fields are branch ids. Reading it as a subcollection returns nothing and the map ends up with no coordinates → blank map.
- `latitude` / `longitude` are stored as **numbers or null**, never strings. Always coerce with `Number(...)` and check `Number.isFinite(...)` before rendering.
- Exactly one branch has `is_main: true`.

---

## 3. Per-app instructions

### 3.1 Super Admin app
Show a map wherever a restaurant, a branch, or a driver is inspected.
1. Add a shared `MapPreview` component containing the `mapSrc` + `<iframe>` code in section 1.1.
2. Restaurant detail page → pass `restaurants/{id}.latitude/longitude`.
3. Branch list → when a branch row is selected, pass that branch's coords; the map heading should name the branch.
4. Fleet view → for multiple pins use section 4 (multi-marker), not the single-pin embed.
5. Never let an admin save a restaurant/branch with out-of-range coordinates; reuse the validation in 1.2.

### 3.2 Driver app
1. Job card → map centred on the **pickup branch** coords, then on the **customer drop-off** coords after pickup.
2. Live position: write `drivers/{driverId}.latitude/longitude` from `navigator.geolocation.watchPosition` (HTTPS required) and update `updated_at` on each write.
3. For turn-by-turn navigation do **not** embed a routing SDK — open the device's map app:
   ```ts
   const nav = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
   window.open(nav, "_blank", "noopener");
   ```
   This needs no API key and works on Android and iOS.

### 3.3 Customer app
1. Restaurant page → map of the selected branch coords.
2. Order tracking → show the branch pin; if the driver's coords exist, use the multi-marker approach in section 4.
3. Address picker → let the customer drop a pin, then persist `latitude` / `longitude` as numbers on the order. Never store only a text address; dispatch needs the coordinates.

---

## 4. When you need multiple pins or a draggable pin

The OSM `export/embed.html` iframe supports **one** marker and is not interactive beyond pan/zoom. For multiple markers, a draggable pin, or live driver movement, use **Leaflet + OpenStreetMap tiles** — still keyless and free.

```bash
npm install leaflet react-leaflet
```

```tsx
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";

<MapContainer center={[lat, lng]} zoom={15} style={{ height: 320, width: "100%" }}>
  <TileLayer
    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
    attribution='&copy; OpenStreetMap contributors'
  />
  {pins.map((p) => (
    <Marker key={p.id} position={[p.lat, p.lng]}><Popup>{p.label}</Popup></Marker>
  ))}
</MapContainer>
```

Two mandatory gotchas:
- **`leaflet/dist/leaflet.css` must be imported** or the map renders as a broken pile of tiles.
- The container needs an **explicit height**. A Leaflet map inside a height-less flex parent collapses to 0px and looks "not showing". Use `h-[320px]` or an inline height.
- Default marker icons 404 under bundlers. Fix once:
  ```ts
  import L from "leaflet";
  import icon from "leaflet/dist/images/marker-icon.png";
  import shadow from "leaflet/dist/images/marker-shadow.png";
  L.Marker.prototype.options.icon = L.icon({ iconUrl: icon, shadowUrl: shadow, iconAnchor: [12, 41] });
  ```

---

## 5. If you must use Google Maps instead

Only do this if the product explicitly requires Google imagery/Places. It requires an API key and a billing-enabled Google Cloud project; otherwise the map renders grey or blank with a console error.

Requirements:
1. A Google Cloud project with **billing enabled**.
2. **Maps JavaScript API** enabled (plus Places / Geocoding / Routes if used).
3. A browser API key whose **HTTP referrer allowlist includes every domain you deploy to**, both `https://example.com/*` **and** `https://*.example.com/*`. Custom domains need their own entries.
4. Load the script asynchronously with a callback:
   ```html
   https://maps.googleapis.com/maps/api/js?key=YOUR_KEY&loading=async&callback=initMap
   ```
   With `loading=async`, `google.maps.Map` is **not** available at script `onload` — you must use the `callback` parameter.
5. Use `google.maps.Marker`. Do **not** use `AdvancedMarkerElement` and do **not** set `mapId` — both require console configuration that is usually missing and cause the whole map to fail to load.
6. Never call Geocoding / Routes / Places-server APIs with the browser key from the client — those return `REQUEST_DENIED`. Route them through a server function.

Simple keyed embed (no SDK):
```html
<iframe src="https://www.google.com/maps/embed/v1/view?key=KEY&center=LAT,LNG&zoom=15" />
```

---

## 6. Troubleshooting: "the map is not showing"

Work through this list in order. Each item is a real cause seen on this platform.

| Symptom | Cause | Fix |
|---|---|---|
| Empty area / fallback text where the map should be | `latitude`/`longitude` are `null`, `undefined`, `""`, or `NaN` | Log the coords. Set them on `restaurants/{id}` or the branch record. Keep the fallback panel — never render an iframe with `NaN` in the URL. |
| Map box has **zero height** | Parent flex/grid gives no height | Put an explicit `h-[320px]` (or inline `height`) on the iframe / `MapContainer`. |
| Branch map always blank | Read `restaurantBranches` as a **subcollection** | It is a single document keyed by branch id. Read the document and iterate its fields. |
| Coordinates saved as strings | Firestore write did not coerce | `Number(value)` on write; `Number.isFinite` on read. |
| Pin is in the wrong place / ocean | lat and lng swapped | Order is `lat, lng` for markers, but the OSM `bbox` param is `lng,lat,lng,lat`. Follow 1.1 exactly. |
| Blank grey Google map + console error | Missing/invalid key, no billing, or referrer not allowlisted | Section 5, items 1–3. Or switch to the OSM implementation. |
| `RefererNotAllowedMapError` on the custom domain | Key allowlist only covers the preview domain | Add `https://yourdomain.com/*` and `https://*.yourdomain.com/*`. |
| Locate button does nothing | Page served over `http://`, or permission denied | Serve over HTTPS; handle the geolocation error callback with a toast. |
| Leaflet tiles scrambled | `leaflet/dist/leaflet.css` not imported | Import it once at app entry. |
| Iframe blocked in console (CSP) | `frame-src` too strict | Allow `https://www.openstreetmap.org` (and `https://www.google.com` if using Google embeds). |
| Map renders but never updates | Coordinates not in the effect/memo deps | Include `lat` and `lng` in the `useMemo`/`useEffect` dependency array; for Leaflet call `map.setView([lat, lng])`. |

---

## 7. Acceptance checklist for each app

- [ ] A shared `MapPreview` component exists and is reused everywhere a map appears.
- [ ] It renders a friendly fallback when coordinates are missing — never a broken iframe.
- [ ] Latitude/longitude are validated on input and stored as numbers in Firestore.
- [ ] Coordinates are read from the shared paths in section 2 — no new collections.
- [ ] The map container has an explicit height and renders at mobile width.
- [ ] "Use my current location" works over HTTPS and shows an error toast on denial.
- [ ] Selecting a different branch/driver/order re-centres the map.
- [ ] No API key is required (OSM path), or every item in section 5 is satisfied (Google path).
