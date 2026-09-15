# Handover: Media (Cloudinary) — Orderly Hub Admin

This document describes how **Media (Cloudinary)** works in this admin app, and includes a **copy-paste AI prompt** to implement the same pattern in another admin system.

---

## Summary (how it works here)

| Concern | Approach |
|--------|----------|
| Upload style | **Unsigned** browser uploads only (no API secret in the client) |
| Credentials | Per-business: `cloudinaryCloudName` + `cloudinaryUploadPreset` in business settings |
| Fallback | Optional `.env` (`VITE_CLOUDINARY_*`) for local/dev when settings are empty |
| Storage of binary | Cloudinary hosts the image; app stores only the returned `secure_url` |
| Audit trail | Optional Firebase RTDB log at `uploads/images` (URL + metadata, not the file) |
| Used by | Products, Categories, Business logo (Settings) |

**Never** put Cloudinary API Key / API Secret in `VITE_*` env vars or in the admin UI — they would ship to the browser.

---

## Architecture

```
┌─────────────────────┐     unsigned POST multipart
│  Admin UI (browser) │ ──────────────────────────► Cloudinary
│  uploadToCloudinary │                              /v1_1/{cloud}/image/upload
└─────────┬───────────┘
          │ secure_url
          ▼
┌─────────────────────┐
│ App data store      │  product.imageUrls / category.imageUrl / settings.logoUrl
│ (+ optional audit)  │  uploads/images/{pushId}
└─────────────────────┘

Config resolution (priority):
  1. Business settings fields (Firebase)
  2. VITE_CLOUDINARY_CLOUD_NAME / VITE_CLOUDINARY_UPLOAD_PRESET
  3. upload preset default: "ml_default" if still empty
```

---

## Source map (this repo)

| File | Role |
|------|------|
| `src/lib/cloudinary.ts` | Resolve options, upload, optional RTDB audit |
| `src/lib/businessSettingsPath.ts` | Tenant settings path: `settings/business` or `settings/businesses/{id}` |
| `src/hooks/useBusinessSettings.ts` | Live subscribe to business settings for upload pages |
| `src/pages/Settings.tsx` | UI: **Media (Cloudinary)** + logo upload; saves cloud name + preset |
| `src/pages/Products.tsx` | Multi-image upload → `imageUrls[]` (+ legacy `imageUrl`) |
| `src/pages/Categories.tsx` | Single image upload → `imageUrl` |
| `src/contexts/AuthContext.tsx` | Loads `businessId` from `admins/{uid}` for tenant settings |
| `.env.example` | Documents optional Vite fallbacks |
| `src/vite-env.d.ts` | Types for `VITE_CLOUDINARY_*` |

---

## Config fields (business settings document)

Stored on the business settings node (path from `getBusinessSettingsPath(businessId)`):

```json
{
  "cloudinaryCloudName": "your_cloud_name",
  "cloudinaryUploadPreset": "your_unsigned_preset"
}
```

**Cloudinary dashboard setup (operator):**

1. Create/open a Cloudinary cloud → note **Cloud name**.
2. Settings → Upload → **Upload presets** → create/edit a preset with **Signing mode: Unsigned**.
3. Paste cloud name + preset name into Admin → Business Settings → **Media (Cloudinary)** → Save.

---

## Upload API contract

```http
POST https://api.cloudinary.com/v1_1/{cloudName}/image/upload
Content-Type: multipart/form-data

file: <binary>
upload_preset: <unsigned preset name>
```

Success: JSON with `secure_url` (HTTPS CDN URL). Persist that string on the entity; do not re-upload unless replacing the image.

---

## Resolution logic (must preserve)

```ts
// Pseudocode matching src/lib/cloudinary.ts
cloudName = trim(overrides.cloudName) || trim(env.VITE_CLOUDINARY_CLOUD_NAME)
uploadPreset =
  trim(overrides.uploadPreset)
  || trim(env.VITE_CLOUDINARY_UPLOAD_PRESET)
  || "ml_default"

if (!cloudName) throw clear error pointing to Settings → Media (Cloudinary) or .env
```

---

## Call sites pattern

1. Load business settings for current admin’s `businessId`.
2. On file input: `url = await uploadToCloudinary(file, { cloudName, uploadPreset })`.
3. Optionally `saveImageUploadToRtdb(url, { context, userId })`.
4. Put `url` into form state / entity fields; save entity to your DB as usual.

Contexts used here: `"product" | "category" | "settings_logo"`.

---

## Security notes

- Unsigned presets are intentional for client-side uploads; lock them down in Cloudinary (allowed formats, max size, folder, etc.).
- Do not add API secret to the admin SPA.
- If the target admin later needs signed uploads, use a **backend** signing endpoint — do not copy secrets into frontend env.

---

## Acceptance checklist

- [ ] Settings UI section **Media (Cloudinary)** with cloud name + unsigned preset; saved per business/tenant
- [ ] Product / category / logo (or equivalent) uploads use that config with env fallback
- [ ] Only `secure_url` stored on entities
- [ ] No API secret in client or `VITE_*`
- [ ] Clear error when cloud name missing
- [ ] Optional upload audit log (URL + context + userId)

---

## AI implementation prompt (copy-paste)

Use the block below with another AI (and attach or open the target admin codebase). Replace bracketed placeholders if needed.

```
You are implementing Media (Cloudinary) image uploads in another admin system so it matches the Orderly Hub pattern described below. Adapt to the target stack (routing, forms, DB), but preserve the security and config model exactly.

## Goal
Add unsigned Cloudinary image uploads for admin media (products, categories, business logo / equivalent), configured per business/tenant in settings, with optional env fallback for local dev. Never put Cloudinary API Key or API Secret in the browser or VITE_* / public env vars.

## Required behavior

### 1. Settings UI — “Media (Cloudinary)”
In Business / Admin Settings, add a section titled **Media (Cloudinary)** with:
- Short copy: images upload to Cloudinary via an **unsigned** upload preset; API secret is not stored and not used in the browser.
- Fields:
  - `cloudinaryCloudName` (label: Cloud name)
  - `cloudinaryUploadPreset` (label: Upload preset (unsigned))
- Persist these on the **per-tenant / per-business settings** document (same place other business profile fields live).
- Note under the fields: if empty, fall back to public env vars for local development only.

### 2. Config resolution (priority)
When uploading:
1. Prefer settings: `cloudinaryCloudName`, `cloudinaryUploadPreset` (trimmed).
2. Else env: e.g. `VITE_CLOUDINARY_CLOUD_NAME` / `VITE_CLOUDINARY_UPLOAD_PRESET` (or the target framework’s public env equivalents).
3. If preset still empty, default to `"ml_default"`.
4. If cloud name still empty, throw a clear user-facing error telling them to fill Settings → Media (Cloudinary) or set the env fallback.

### 3. Upload helper
Implement a shared helper equivalent to:

- POST `https://api.cloudinary.com/v1_1/{cloudName}/image/upload`
- multipart: `file` + `upload_preset`
- return `data.secure_url`; error if missing
- Do not send API secret

Optional: after success, append an audit record `{ url, createdAt, context, userId }` to a log collection/path (e.g. `uploads/images`) — log metadata only, not the binary. Failures to log should not fail the upload UX (console.error is fine).

### 4. Wire upload into admin screens
Wherever images are edited:
- Products (or menu items): upload file(s) → store URL string(s) on the entity (array + primary URL if the schema needs both).
- Categories: single image URL.
- Settings logo: upload → set `logoUrl` (or equivalent) in local state; save with settings.

Always pass cloud name + preset from the current tenant’s business settings into the upload helper.

### 5. Env / types
- Document optional public env fallbacks in `.env.example`.
- Add TypeScript env typings if the project uses them.
- Comment explicitly: never put API Key/Secret in public env.

### 6. Multi-tenant note (if applicable)
If admins have a `businessId`, resolve settings from that tenant’s settings path. Example from Orderly Hub:
- default → `settings/business`
- else → `settings/businesses/{businessId}`
Adapt to the target DB layout, but keep Cloudinary config **per business**, not global-only.

## Non-goals
- Do not implement signed uploads or server-side signing unless the target already has a secure backend for it.
- Do not store image binaries in Firebase / primary DB — only Cloudinary URLs.
- Do not redesign unrelated settings (payments, etc.).

## Deliverables
1. Shared upload + resolve helper module.
2. Settings UI section + save fields.
3. Product/category/logo (or equivalent) upload wiring.
4. `.env.example` notes.
5. Brief note in PR/summary of where config lives and how to create an unsigned preset in Cloudinary.

## Reference implementation (Orderly Hub)
- `src/lib/cloudinary.ts` — resolve + upload + optional RTDB audit
- `src/pages/Settings.tsx` — Media (Cloudinary) UI + logo upload
- `src/pages/Products.tsx` / `src/pages/Categories.tsx` — call sites using `useBusinessSettings`
- `src/hooks/useBusinessSettings.ts` + `src/lib/businessSettingsPath.ts` — tenant settings
- `.env.example` — VITE_CLOUDINARY_* fallbacks

Match this behavior; map names/paths to the target admin codebase conventions.
```

---

## Operator quick start (target system)

1. Cloudinary → unsigned upload preset.
2. Admin → Settings → Media (Cloudinary) → cloud name + preset → Save.
3. Upload a product/category/logo image and confirm the entity stores an `https://res.cloudinary.com/...` URL.
4. (Dev only) Leave settings blank and set public env fallbacks to verify fallback path.
