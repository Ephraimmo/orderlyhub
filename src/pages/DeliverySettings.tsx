import { useEffect, useState } from "react";
import { db } from "@/lib/firestore";
import { restaurantPath } from "@/lib/restaurant-scope";
import { ref, onValue, update } from "@/lib/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";

const DeliverySettings = () => {
  const { restaurantId, restaurant, canManage } = useAuth();
  const readOnly = !canManage("delivery");
  const [settings, setSettings] = useState({
    delivery_enabled: true,
    pickup_enabled: true,
    delivery_radius_km: 10,
  });
  const [tiers, setTiers] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!restaurantId) return;
    const unsub = onValue(ref(db, restaurantPath(restaurantId)), (snap) => {
      if (!snap.exists()) return;
      const val = snap.val();
      setSettings({
        delivery_enabled: val.delivery_enabled !== false,
        pickup_enabled: val.pickup_enabled !== false,
        delivery_radius_km: Number(val.delivery_radius_km ?? 10),
      });
      setTiers(Array.isArray(val.delivery_tiers) ? val.delivery_tiers : []);
    });
    return unsub;
  }, [restaurantId]);

  const handleSave = async () => {
    if (!restaurantId || readOnly) return;
    setSaving(true);
    try {
      await update(ref(db, restaurantPath(restaurantId)), {
        delivery_enabled: settings.delivery_enabled,
        pickup_enabled: settings.pickup_enabled,
        delivery_radius_km: Number(settings.delivery_radius_km),
        delivery_tiers: tiers,
      });
      toast.success("Delivery settings saved");
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Delivery Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure delivery for {restaurant?.name ?? "your restaurant"} (managed in Super Admin / shared RTDB)
        </p>
      </div>

      <div className="glass-card p-6 max-w-2xl space-y-6">
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
          <div>
            <Label>Delivery enabled</Label>
            <p className="text-xs text-muted-foreground">Offer delivery to customers</p>
          </div>
          <Switch
            checked={settings.delivery_enabled}
            onCheckedChange={(v) => setSettings({ ...settings, delivery_enabled: v })}
            disabled={readOnly}
          />
        </div>
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
          <div>
            <Label>Pickup enabled</Label>
            <p className="text-xs text-muted-foreground">Allow customer pickup orders</p>
          </div>
          <Switch
            checked={settings.pickup_enabled}
            onCheckedChange={(v) => setSettings({ ...settings, pickup_enabled: v })}
            disabled={readOnly}
          />
        </div>
        <div className="space-y-2">
          <Label>Max delivery radius (km)</Label>
          <Input
            type="number"
            value={settings.delivery_radius_km}
            onChange={(e) => setSettings({ ...settings, delivery_radius_km: Number(e.target.value) })}
            disabled={readOnly}
          />
        </div>
        <Button onClick={handleSave} disabled={saving || readOnly}>
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Save Settings
        </Button>
      </div>

      <div className="glass-card p-6 max-w-2xl space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />Delivery fee tiers
        </h3>
        {tiers.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No delivery tiers configured. Super Admin can set tiers on the restaurant record.
          </p>
        ) : (
          <div className="space-y-2">
            {tiers.map((t) => (
              <div key={t.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
                <div>
                  <p className="text-sm font-medium">{t.label ?? `Up to ${t.up_to_km} km`}</p>
                  <p className="text-xs text-muted-foreground">Fee: R{Number(t.fee).toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DeliverySettings;
