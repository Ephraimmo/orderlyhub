import { useEffect, useMemo, useState } from "react";
import { fsUpdate } from "@/lib/firestore";
import { restaurantPath } from "@/lib/restaurant-scope";
import { useAuth } from "@/contexts/AuthContext";
import {
  deleteBranch,
  makeBranchId,
  nowIso,
  saveBranch,
  subscribeBranches,
  type RestaurantBranch,
} from "@/lib/branches.firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Building2,
  Crosshair,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Store,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

interface LocationForm {
  address: string;
  city: string;
  latitude: string;
  longitude: string;
}

const emptyBranch = (restaurantId: string): RestaurantBranch => ({
  id: "",
  restaurant_id: restaurantId,
  name: "",
  code: "",
  address: "",
  city: "",
  phone: "",
  latitude: null,
  longitude: null,
  delivery_radius_km: 10,
  is_main: false,
  is_active: true,
  opens_at: "09:00",
  closes_at: "21:00",
  created_at: "",
  updated_at: "",
});

const numberOrNull = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const mapSrc = (lat: number, lng: number) => {
  const d = 0.01;
  const bbox = [lng - d, lat - d, lng + d, lat + d].join("%2C");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
};

const LocationPage = () => {
  const { restaurantId, restaurant, can } = useAuth();
  const canManageLocation = can("rm.profile.manage");
  const canManageBranches = can("rm.settings.manage") || can("rm.profile.manage");

  const [form, setForm] = useState<LocationForm>({ address: "", city: "", latitude: "", longitude: "" });
  const [savingLocation, setSavingLocation] = useState(false);
  const [locating, setLocating] = useState(false);

  const [branches, setBranches] = useState<RestaurantBranch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [editing, setEditing] = useState<RestaurantBranch | null>(null);
  const [savingBranch, setSavingBranch] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<RestaurantBranch | null>(null);
  // "primary" = restaurant-level location; otherwise a branch id
  const [selectedId, setSelectedId] = useState<string>("primary");

  const selectedBranch = useMemo(
    () => branches.find((b) => b.id === selectedId) ?? null,
    [branches, selectedId],
  );

  useEffect(() => {
    if (selectedBranch) {
      setForm({
        address: String(selectedBranch.address ?? ""),
        city: String(selectedBranch.city ?? ""),
        latitude: selectedBranch.latitude == null ? "" : String(selectedBranch.latitude),
        longitude: selectedBranch.longitude == null ? "" : String(selectedBranch.longitude),
      });
      return;
    }
    if (selectedId !== "primary" && !branchesLoading) setSelectedId("primary");
    if (!restaurant) return;
    setForm({
      address: String(restaurant.address ?? ""),
      city: String(restaurant.city ?? ""),
      latitude: restaurant.latitude == null ? "" : String(restaurant.latitude),
      longitude: restaurant.longitude == null ? "" : String(restaurant.longitude),
    });
  }, [
    selectedBranch,
    selectedId,
    branchesLoading,
    restaurant?.id,
    restaurant?.address,
    restaurant?.city,
    restaurant?.latitude,
    restaurant?.longitude,
  ]);

  useEffect(() => {
    if (!restaurantId) return;
    setBranchesLoading(true);
    return subscribeBranches(restaurantId, (list) => {
      setBranches(list);
      setBranchesLoading(false);
    });
  }, [restaurantId]);

  const coords = useMemo(() => {
    const lat = numberOrNull(form.latitude);
    const lng = numberOrNull(form.longitude);
    return lat != null && lng != null ? { lat, lng } : null;
  }, [form.latitude, form.longitude]);

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not available in this browser");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({
          ...f,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }));
        setLocating(false);
        toast.success("Coordinates captured from your device");
      },
      () => {
        setLocating(false);
        toast.error("Could not read your current position");
      },
    );
  };

  const handleSaveLocation = async () => {
    if (!restaurantId || !canManageLocation) return;
    const latitude = numberOrNull(form.latitude);
    const longitude = numberOrNull(form.longitude);
    if ((form.latitude.trim() && latitude == null) || (form.longitude.trim() && longitude == null)) {
      toast.error("Latitude and longitude must be decimal numbers");
      return;
    }
    if (latitude != null && (latitude < -90 || latitude > 90)) {
      toast.error("Latitude must be between -90 and 90");
      return;
    }
    if (longitude != null && (longitude < -180 || longitude > 180)) {
      toast.error("Longitude must be between -180 and 180");
      return;
    }

    setSavingLocation(true);
    try {
      if (selectedBranch) {
        await saveBranch(
          restaurantId,
          {
            ...selectedBranch,
            address: form.address.trim() || null,
            city: form.city.trim() || null,
            latitude,
            longitude,
            updated_at: nowIso(),
          },
          { existing: branches },
        );
        toast.success(`Location saved for ${selectedBranch.name}`);
        return;
      }
      await fsUpdate(restaurantPath(restaurantId), {
        address: form.address.trim() || null,
        city: form.city.trim(),
        latitude,
        longitude,
        updated_at: nowIso(),
      });

      // A restaurant with no branches is single-location: bind a main branch for dispatch.
      if (!branches.length) {
        const id = makeBranchId(restaurant?.name ?? "main");
        await saveBranch(restaurantId, {
          ...emptyBranch(restaurantId),
          id,
          name: restaurant?.name ? `${restaurant.name} (Main)` : "Main branch",
          address: form.address.trim() || null,
          city: form.city.trim() || null,
          phone: (restaurant?.phone as string | null) ?? null,
          latitude,
          longitude,
          delivery_radius_km: Number(restaurant?.delivery_radius_km ?? 10),
          is_main: true,
          is_active: true,
          created_at: nowIso(),
          updated_at: nowIso(),
        });
      }
      toast.success("Location saved and synced to Super Admin");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save location");
    } finally {
      setSavingLocation(false);
    }
  };

  const handleSaveBranch = async () => {
    if (!restaurantId || !editing || !canManageBranches) return;
    if (!editing.name.trim()) {
      toast.error("Branch name is required");
      return;
    }
    setSavingBranch(true);
    try {
      const isNew = !editing.id;
      const branch: RestaurantBranch = {
        ...editing,
        id: editing.id || makeBranchId(editing.name),
        restaurant_id: restaurantId,
        name: editing.name.trim(),
        code: editing.code?.trim() || null,
        address: editing.address?.trim() || null,
        city: editing.city?.trim() || null,
        phone: editing.phone?.trim() || null,
        delivery_radius_km: Number(editing.delivery_radius_km ?? 10),
        is_main: Boolean(editing.is_main) || branches.length === 0,
        is_active: editing.is_active !== false,
        created_at: editing.created_at || nowIso(),
        updated_at: nowIso(),
      };
      await saveBranch(restaurantId, branch, { existing: branches });
      toast.success(isNew ? "Branch added" : "Branch updated");
      setEditing(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save branch");
    } finally {
      setSavingBranch(false);
    }
  };

  const handleDelete = async () => {
    if (!restaurantId || !pendingDelete) return;
    try {
      await deleteBranch(restaurantId, pendingDelete.id);
      toast.success("Branch removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove branch");
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Location & Branches</h1>
          <p className="text-sm text-muted-foreground">
            Manage where {restaurant?.name ?? "your restaurant"} operates. Changes sync live with the Super
            Admin console, dispatch and the customer app.
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5">
          <Building2 className="h-3.5 w-3.5" />
          {branches.length} branch{branches.length === 1 ? "" : "es"}
        </Badge>
      </header>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="glass-card space-y-5 p-6 lg:col-span-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold uppercase tracking-wide">
                {selectedBranch ? `${selectedBranch.name} location` : "Primary location"}
              </h2>
            </div>
            {selectedBranch && (
              <Badge variant="outline" className="gap-1.5 text-[10px]">
                <Store className="h-3 w-3" />
                Editing branch
              </Badge>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Editing location for</Label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedId("primary")}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  selectedId === "primary"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {restaurant?.name ?? "Restaurant"} (Primary)
              </button>
              {branches.map((branch) => (
                <button
                  key={branch.id}
                  type="button"
                  onClick={() => setSelectedId(branch.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                    selectedId === branch.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  <Store className="h-3 w-3" />
                  {branch.name}
                  {branch.is_main && <span className="opacity-70">· Main</span>}
                </button>
              ))}
            </div>
          </div>


          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="address">Street address</Label>
              <Input
                id="address"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="12 Rivonia Road, Sandton"
                disabled={!canManageLocation}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="Johannesburg"
                disabled={!canManageLocation}
              />
            </div>
            <div className="space-y-2">
              <Label>Coordinates</Label>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={useMyLocation}
                disabled={!canManageLocation || locating}
              >
                {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
                Use my current position
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="latitude">Latitude</Label>
              <Input
                id="latitude"
                inputMode="decimal"
                value={form.latitude}
                onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                placeholder="-26.166200"
                disabled={!canManageLocation}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="longitude">Longitude</Label>
              <Input
                id="longitude"
                inputMode="decimal"
                value={form.longitude}
                onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                placeholder="28.042600"
                disabled={!canManageLocation}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              {selectedBranch
                ? "Changes apply to this branch and sync to dispatch immediately."
                : "Status, commission and ratings stay under Super Admin control."}
            </p>
            <Button onClick={handleSaveLocation} disabled={!canManageLocation || savingLocation}>
              {savingLocation && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {selectedBranch ? `Save ${selectedBranch.name}` : "Save location"}
            </Button>
          </div>
        </section>

        <section className="glass-card overflow-hidden p-0 lg:col-span-2">
          <div className="flex items-center gap-2 border-b border-border px-5 py-4">
            <Store className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-wide">
              Map preview{selectedBranch ? ` — ${selectedBranch.name}` : ""}
            </h2>
          </div>
          {coords ? (
            <iframe
              title="Restaurant location map"
              src={mapSrc(coords.lat, coords.lng)}
              className="h-[320px] w-full border-0"
              loading="lazy"
            />
          ) : (
            <div className="flex h-[320px] flex-col items-center justify-center gap-2 px-6 text-center">
              <MapPin className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Add latitude and longitude to preview the pin used by dispatch.
              </p>
            </div>
          )}
        </section>
      </div>

      <section className="glass-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide">Branches</h2>
            <p className="text-xs text-muted-foreground">
              Each branch is visible to dispatch and driver assignment in real time.
            </p>
          </div>
          <Button
            onClick={() => setEditing(emptyBranch(restaurantId ?? ""))}
            disabled={!canManageBranches || !restaurantId}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Add branch
          </Button>
        </div>

        {branchesLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : branches.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-12 text-center">
            <Building2 className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">No branches yet</p>
            <p className="text-xs text-muted-foreground">
              Save your location to create a main branch, or add one manually.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {branches.map((branch) => (
              <article
                key={branch.id}
                className="rounded-xl border border-border bg-card/60 p-4 transition-colors hover:border-primary/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold">{branch.name}</h3>
                    <p className="truncate text-xs text-muted-foreground">
                      {branch.address || "No address"}
                      {branch.city ? `, ${branch.city}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setEditing(branch)}
                      disabled={!canManageBranches}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setPendingDelete(branch)}
                      disabled={!canManageBranches}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {branch.is_main && <Badge className="text-[10px]">Main</Badge>}
                  <Badge variant={branch.is_active === false ? "secondary" : "outline"} className="text-[10px]">
                    {branch.is_active === false ? "Inactive" : "Active"}
                  </Badge>
                  {branch.code && (
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {branch.code}
                    </Badge>
                  )}
                </div>

                <dl className="mt-3 space-y-1 text-[11px] text-muted-foreground">
                  <div className="flex justify-between gap-2">
                    <dt>Hours</dt>
                    <dd>{branch.opens_at || "—"} – {branch.closes_at || "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Radius</dt>
                    <dd>{branch.delivery_radius_km ?? "—"} km</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Coordinates</dt>
                    <dd className="font-mono">
                      {branch.latitude != null && branch.longitude != null
                        ? `${Number(branch.latitude).toFixed(4)}, ${Number(branch.longitude).toFixed(4)}`
                        : "not set"}
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit branch" : "Add branch"}</DialogTitle>
            <DialogDescription>
              Branch details are shared with the Super Admin dispatch board immediately.
            </DialogDescription>
          </DialogHeader>

          {editing && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="b-name">Branch name</Label>
                <Input
                  id="b-name"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="Sandton City"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="b-code">Branch code</Label>
                <Input
                  id="b-code"
                  value={editing.code ?? ""}
                  onChange={(e) => setEditing({ ...editing, code: e.target.value })}
                  placeholder="SC-01"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="b-phone">Phone</Label>
                <Input
                  id="b-phone"
                  value={editing.phone ?? ""}
                  onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                  placeholder="+27 11 000 0000"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="b-address">Address</Label>
                <Input
                  id="b-address"
                  value={editing.address ?? ""}
                  onChange={(e) => setEditing({ ...editing, address: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="b-city">City</Label>
                <Input
                  id="b-city"
                  value={editing.city ?? ""}
                  onChange={(e) => setEditing({ ...editing, city: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="b-radius">Delivery radius (km)</Label>
                <Input
                  id="b-radius"
                  type="number"
                  min={0}
                  value={editing.delivery_radius_km ?? 0}
                  onChange={(e) =>
                    setEditing({ ...editing, delivery_radius_km: Number(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="b-lat">Latitude</Label>
                <Input
                  id="b-lat"
                  inputMode="decimal"
                  value={editing.latitude == null ? "" : String(editing.latitude)}
                  onChange={(e) => setEditing({ ...editing, latitude: numberOrNull(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="b-lng">Longitude</Label>
                <Input
                  id="b-lng"
                  inputMode="decimal"
                  value={editing.longitude == null ? "" : String(editing.longitude)}
                  onChange={(e) => setEditing({ ...editing, longitude: numberOrNull(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="b-open">Opens at</Label>
                <Input
                  id="b-open"
                  type="time"
                  value={editing.opens_at ?? ""}
                  onChange={(e) => setEditing({ ...editing, opens_at: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="b-close">Closes at</Label>
                <Input
                  id="b-close"
                  type="time"
                  value={editing.closes_at ?? ""}
                  onChange={(e) => setEditing({ ...editing, closes_at: e.target.value })}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2 sm:col-span-2">
                <div>
                  <Label>Main branch</Label>
                  <p className="text-xs text-muted-foreground">Only one branch can be the main location.</p>
                </div>
                <Switch
                  checked={Boolean(editing.is_main)}
                  onCheckedChange={(v) => setEditing({ ...editing, is_main: v })}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2 sm:col-span-2">
                <div>
                  <Label>Active</Label>
                  <p className="text-xs text-muted-foreground">Inactive branches are hidden from dispatch.</p>
                </div>
                <Switch
                  checked={editing.is_active !== false}
                  onCheckedChange={(v) => setEditing({ ...editing, is_active: v })}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveBranch} disabled={savingBranch}>
              {savingBranch && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save branch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {pendingDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the branch for the Super Admin console too. If past orders reference it, mark it
              inactive instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete branch</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default LocationPage;
