import { useEffect, useState } from "react";
import { db } from "@/lib/firestore";
import { uploadToCloudinary, saveImageUploadToRtdb } from "@/lib/cloudinary";
import { restaurantPath, restaurantPaymentConfigPath } from "@/lib/restaurant-scope";
import { ref, onValue, update, set } from "@/lib/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Image, CreditCard, Banknote, Receipt, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

const Settings = () => {
  const { user, restaurantId, restaurant, canManage } = useAuth();
  const readOnly = !canManage("settings") && !canManage("profile");
  const [settings, setSettings] = useState<any>({
    businessName: "", logoUrl: "", phone: "", email: "", address: "",
    workingHours: "", prepTime: 15, taxPercent: 0, serviceFee: 0,
    cloudinaryCloudName: "",
    cloudinaryUploadPreset: "",
    paymentMethods: {
      cash: { enabled: true },
      card: { enabled: true, stripePublishableKey: "", stripeSecretKey: "" },
      proofOfPayment: { enabled: false },
    },
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);

  const settingsPath = restaurantId ? restaurantPath(restaurantId) : "";

  useEffect(() => {
    if (!restaurantId) return;
    const unsubRestaurant = onValue(ref(db, settingsPath), (snap) => {
      if (!snap.exists()) return;
      const val = snap.val();
      setSettings((s: any) => ({
        ...s,
        businessName: val.name ?? s.businessName,
        logoUrl: val.image_url ?? val.logoUrl ?? s.logoUrl,
        phone: val.phone ?? s.phone,
        email: val.email ?? s.email,
        address: val.address ?? s.address,
        workingHours: val.opens_at && val.closes_at ? `${val.opens_at} – ${val.closes_at}` : s.workingHours,
        prepTime: val.prep_time_minutes ?? s.prepTime,
        cloudinaryCloudName: val.cloudinaryCloudName ?? "",
        cloudinaryUploadPreset: val.cloudinaryUploadPreset ?? "",
      }));
    });
    const unsubPayments = onValue(ref(db, restaurantPaymentConfigPath(restaurantId)), (snap) => {
      if (!snap.exists()) return;
      const val = snap.val();
      const methods = val.methods ?? {};
      setSettings((s: any) => ({
        ...s,
        paymentMethods: {
          cash: { enabled: methods.cash_on_delivery?.enabled ?? methods.cash_on_pickup?.enabled ?? s.paymentMethods.cash.enabled },
          card: { enabled: methods.card?.enabled ?? s.paymentMethods.card.enabled, stripePublishableKey: "", stripeSecretKey: "" },
          proofOfPayment: { enabled: methods.eft?.enabled ?? s.paymentMethods.proofOfPayment.enabled },
        },
      }));
    });
    return () => { unsubRestaurant(); unsubPayments(); };
  }, [restaurantId, settingsPath]);

  const handleLogoUpload = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadToCloudinary(file, {
        cloudName: settings.cloudinaryCloudName,
        uploadPreset: settings.cloudinaryUploadPreset,
      });
      await saveImageUploadToRtdb(url, { context: "settings_logo", userId: user?.uid ?? null });
      setSettings((s: any) => ({ ...s, logoUrl: url }));
      toast.success("Logo uploaded");
    } catch (err: any) {
      toast.error(err?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!restaurantId || readOnly) return;
    setSaving(true);
    try {
      const [opensAt, closesAt] = settings.workingHours?.includes("–")
        ? settings.workingHours.split("–").map((s: string) => s.trim())
        : [restaurant?.opens_at ?? "09:00", restaurant?.closes_at ?? "22:00"];
      await update(ref(db, settingsPath), {
        name: settings.businessName,
        image_url: settings.logoUrl || null,
        phone: settings.phone || null,
        email: settings.email || null,
        address: settings.address || null,
        prep_time_minutes: Number(settings.prepTime),
        opens_at: opensAt,
        closes_at: closesAt,
        cloudinaryCloudName: (settings.cloudinaryCloudName || "").trim(),
        cloudinaryUploadPreset: (settings.cloudinaryUploadPreset || "").trim(),
      });
      await set(ref(db, restaurantPaymentConfigPath(restaurantId)), {
        restaurant_id: restaurantId,
        methods: {
          card: { enabled: settings.paymentMethods?.card?.enabled !== false, instructions: null },
          cash_on_delivery: { enabled: settings.paymentMethods?.cash?.enabled !== false, instructions: null },
          cash_on_pickup: { enabled: settings.paymentMethods?.cash?.enabled !== false, instructions: null },
          eft: { enabled: settings.paymentMethods?.proofOfPayment?.enabled === true, instructions: null },
        },
        updated_at: new Date().toISOString(),
        updated_by: user?.email ?? null,
      });
      toast.success("Settings saved");
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const updateField = (field: string, value: any) => setSettings({ ...settings, [field]: value });
  const togglePaymentMethod = (method: string) => {
    setSettings({
      ...settings,
      paymentMethods: {
        ...settings.paymentMethods,
        [method]: { ...settings.paymentMethods[method], enabled: !settings.paymentMethods[method]?.enabled },
      },
    });
  };
  const updatePaymentField = (method: string, field: string, value: string) => {
    setSettings({
      ...settings,
      paymentMethods: {
        ...settings.paymentMethods,
        [method]: { ...settings.paymentMethods[method], [field]: value },
      },
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Business Settings</h1>
        <p className="text-sm text-muted-foreground">Configure your business profile</p>
        <p className="mt-2 text-xs text-muted-foreground rounded-lg border border-border bg-muted/30 px-3 py-2">
          <span className="font-medium text-foreground">Assigned restaurant:</span> {restaurant?.name ?? restaurantId ?? "—"}
          <span className="mx-2 text-border">·</span>
          <span className="font-mono text-[11px]">{settingsPath}</span>
        </p>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* Business Info */}
        <div className="glass-card p-6 space-y-6">
          <h2 className="text-lg font-semibold">Business Information</h2>
          <div className="space-y-2">
            <Label>Business Logo</Label>
            <div className="flex items-center gap-4">
              {settings.logoUrl && <img src={settings.logoUrl} alt="Logo" className="w-16 h-16 rounded-lg object-cover border border-border" />}
              <label className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm cursor-pointer hover:bg-secondary/80 transition-colors">
                <Image className="h-4 w-4" />{uploading ? "Uploading..." : "Upload Logo"}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleLogoUpload(e.target.files[0])} />
              </label>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Business Name</Label><Input value={settings.businessName} onChange={(e) => updateField("businessName", e.target.value)} /></div>
            <div className="space-y-2"><Label>Phone Number</Label><Input value={settings.phone} onChange={(e) => updateField("phone", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Email</Label><Input type="email" value={settings.email} onChange={(e) => updateField("email", e.target.value)} /></div>
            <div className="space-y-2"><Label>Address</Label><Input value={settings.address} onChange={(e) => updateField("address", e.target.value)} /></div>
          </div>
          <div className="space-y-2">
            <Label>Opening Hours</Label>
            <Input placeholder="Mon-Fri: 9AM-10PM, Sat-Sun: 10AM-11PM" value={settings.workingHours} onChange={(e) => updateField("workingHours", e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2"><Label>Prep Time (min)</Label><Input type="number" value={settings.prepTime} onChange={(e) => updateField("prepTime", e.target.value)} /></div>
            <div className="space-y-2"><Label>Tax Rate (%)</Label><Input type="number" step="0.1" value={settings.taxPercent} onChange={(e) => updateField("taxPercent", e.target.value)} /></div>
            <div className="space-y-2"><Label>Service Fee (R)</Label><Input type="number" step="0.01" value={settings.serviceFee} onChange={(e) => updateField("serviceFee", e.target.value)} /></div>
          </div>
        </div>

        {/* Cloudinary — per-business; no API secret (unsigned uploads) */}
        <div className="glass-card p-6 space-y-4">
          <h2 className="text-lg font-semibold">Media (Cloudinary)</h2>
          <p className="text-sm text-muted-foreground">
            Images for products, categories, and this logo upload go to Cloudinary. Create an <strong>unsigned</strong> upload preset in Cloudinary and enter its name below. The API secret is not stored here and is not used in the browser.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Cloud name</Label>
              <Input
                placeholder="e.g. dnmcti0xs"
                value={settings.cloudinaryCloudName ?? ""}
                onChange={(e) => updateField("cloudinaryCloudName", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Upload preset (unsigned)</Label>
              <Input
                placeholder="e.g. ml_default or my_app_uploads"
                value={settings.cloudinaryUploadPreset ?? ""}
                onChange={(e) => updateField("cloudinaryUploadPreset", e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            If these are empty, the app falls back to <code className="rounded bg-muted px-1">VITE_CLOUDINARY_*</code> in <code className="rounded bg-muted px-1">.env</code> for local development only.
          </p>
        </div>

        {/* Payment Methods */}
        <div className="glass-card p-6 space-y-4">
          <h2 className="text-lg font-semibold">Payment Methods</h2>
          <p className="text-sm text-muted-foreground">Choose which payment methods customers can use</p>
          
          <div className="space-y-3">
            {/* Cash */}
            <div className="rounded-lg border border-border bg-muted/30">
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center">
                    <Banknote className="h-5 w-5 text-success" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Cash on Delivery</p>
                    <p className="text-xs text-muted-foreground">Customers pay with cash upon delivery or pickup</p>
                  </div>
                </div>
                <Switch checked={settings.paymentMethods?.cash?.enabled !== false} onCheckedChange={() => togglePaymentMethod("cash")} />
              </div>
            </div>

            {/* Card / Stripe */}
            <div className="rounded-lg border border-border bg-muted/30">
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <CreditCard className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Card Payment (Stripe)</p>
                    <p className="text-xs text-muted-foreground">Customers pay via Stripe checkout</p>
                  </div>
                </div>
                <Switch checked={settings.paymentMethods?.card?.enabled !== false} onCheckedChange={() => togglePaymentMethod("card")} />
              </div>
              {settings.paymentMethods?.card?.enabled !== false && (
                <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Stripe Publishable Key</Label>
                    <Input
                      placeholder="pk_live_... or pk_test_..."
                      value={settings.paymentMethods?.card?.stripePublishableKey || ""}
                      onChange={(e) => updatePaymentField("card", "stripePublishableKey", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Stripe Secret Key</Label>
                    <div className="relative">
                      <Input
                        type={showSecretKey ? "text" : "password"}
                        placeholder="sk_live_... or sk_test_..."
                        value={settings.paymentMethods?.card?.stripeSecretKey || ""}
                        onChange={(e) => updatePaymentField("card", "stripeSecretKey", e.target.value)}
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowSecretKey(!showSecretKey)}
                      >
                        {showSecretKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">Keys are saved to Firebase and used by the customer app for Stripe checkout</p>
                  </div>
                </div>
              )}
            </div>

            {/* Proof of Payment */}
            <div className="rounded-lg border border-border bg-muted/30">
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center">
                    <Receipt className="h-5 w-5 text-warning" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Upload Proof of Payment</p>
                    <p className="text-xs text-muted-foreground">Customers upload a receipt or screenshot for admin verification</p>
                  </div>
                </div>
                <Switch checked={settings.paymentMethods?.proofOfPayment?.enabled === true} onCheckedChange={() => togglePaymentMethod("proofOfPayment")} />
              </div>
            </div>
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving || readOnly} className="w-full">
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Save All Settings
        </Button>
      </div>
    </div>
  );
};

export default Settings;
