import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firestore";
import { uploadToCloudinary, saveImageUploadToRtdb } from "@/lib/cloudinary";
import {
  addonsForItem,
  addonsPath,
  categoriesPath,
  itemsPath,
  mapAddonFromRtdb,
  mapAddonToRtdb,
  mapCategoryFromRtdb,
  mapModifierFromRtdb,
  mapProductFromRtdb,
  mapProductToRtdb,
  mapVariantFromRtdb,
  mapVariantToRtdb,
  modifiersPath,
  newMenuId,
  type UiAddon,
  type UiCategory,
  type UiModifier,
  type UiProduct,
  type UiVariant,
  variantsForItem,
  variantsPath,
} from "@/lib/menus";
import { ref, onValue, set, update, remove } from "@/lib/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { useBusinessSettings } from "@/hooks/useBusinessSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus, Pencil, Trash2, Loader2, Image, SlidersHorizontal, ShoppingBag,
  Search, Filter, X, Star,
} from "lucide-react";
import { toast } from "sonner";
import TableSkeleton from "@/components/TableSkeleton";

const emptyProduct = (): Omit<UiProduct, "id"> => ({
  name: "",
  description: "",
  price: 0,
  discountPrice: null,
  category: "",
  category_id: null,
  categoryName: "",
  imageUrls: [],
  imageUrl: "",
  prepTime: 15,
  pointsValue: 5,
  available: true,
  isFeatured: false,
  allergens: [],
  modifierIds: [],
  modifierConfig: {},
  extrasProducts: [],
});

const normalizeProductImages = (p: { imageUrls?: unknown; imageUrl?: string }): string[] => {
  if (Array.isArray(p.imageUrls) && p.imageUrls.length) {
    return (p.imageUrls as string[]).filter(Boolean);
  }
  if (p.imageUrl) return [p.imageUrl];
  return [];
};

const primaryProductImage = (p: { imageUrls?: unknown; imageUrl?: string }) =>
  normalizeProductImages(p)[0];

const Products = () => {
  const { canManage, restaurantId, user } = useAuth();
  const readOnly = !canManage("menu");
  const { businessSettings } = useBusinessSettings(restaurantId);
  const [products, setProducts] = useState<UiProduct[]>([]);
  const [categories, setCategories] = useState<UiCategory[]>([]);
  const [variants, setVariants] = useState<UiVariant[]>([]);
  const [addons, setAddons] = useState<UiAddon[]>([]);
  const [modifiers, setModifiers] = useState<UiModifier[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UiProduct | null>(null);
  const [form, setForm] = useState<Omit<UiProduct, "id"> & { id?: string }>(emptyProduct());
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");
  const [allergensInput, setAllergensInput] = useState("");

  // Inline variant / addon editors (tied to open product dialog)
  const [variantForm, setVariantForm] = useState({ name: "", priceDelta: 0, isDefault: false, isAvailable: true });
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [addonForm, setAddonForm] = useState({ name: "", price: 0, maxQuantity: 3, isAvailable: true });
  const [editingAddonId, setEditingAddonId] = useState<string | null>(null);
  const [customSaving, setCustomSaving] = useState(false);

  useEffect(() => {
    if (!restaurantId) return;
    let loaded = { p: false, c: false, v: false, a: false, m: false };
    const checkDone = () => {
      if (loaded.p && loaded.c && loaded.v && loaded.a && loaded.m) setLoading(false);
    };

    const unsub1 = onValue(ref(db, itemsPath(restaurantId)), (snap) => {
      if (!snap.exists()) setProducts([]);
      else {
        setProducts(
          Object.entries(snap.val()).map(([id, val]) =>
            mapProductFromRtdb(id, val as Record<string, unknown>),
          ),
        );
      }
      loaded.p = true;
      checkDone();
    });
    const unsub2 = onValue(ref(db, categoriesPath(restaurantId)), (snap) => {
      if (!snap.exists()) setCategories([]);
      else {
        setCategories(
          Object.entries(snap.val()).map(([id, val]) =>
            mapCategoryFromRtdb(id, val as Record<string, unknown>),
          ),
        );
      }
      loaded.c = true;
      checkDone();
    });
    const unsub3 = onValue(ref(db, variantsPath(restaurantId)), (snap) => {
      if (!snap.exists()) setVariants([]);
      else {
        setVariants(
          Object.entries(snap.val()).map(([id, val]) =>
            mapVariantFromRtdb(id, val as Record<string, unknown>),
          ),
        );
      }
      loaded.v = true;
      checkDone();
    });
    const unsub4 = onValue(ref(db, addonsPath(restaurantId)), (snap) => {
      if (!snap.exists()) setAddons([]);
      else {
        setAddons(
          Object.entries(snap.val()).map(([id, val]) =>
            mapAddonFromRtdb(id, val as Record<string, unknown>),
          ),
        );
      }
      loaded.a = true;
      checkDone();
    });
    const unsub5 = onValue(ref(db, modifiersPath(restaurantId)), (snap) => {
      if (!snap.exists()) setModifiers([]);
      else {
        setModifiers(
          Object.entries(snap.val())
            .map(([id, val]) => mapModifierFromRtdb(id, val as Record<string, unknown>, restaurantId))
            .sort((a, b) => a.sortOrder - b.sortOrder),
        );
      }
      loaded.m = true;
      checkDone();
    });

    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
      unsub5();
    };
  }, [restaurantId]);

  const productId = editing?.id ?? form.id ?? null;

  const productVariants = useMemo(
    () => (productId ? variantsForItem(variants, productId) : []),
    [variants, productId],
  );
  const productAddons = useMemo(
    () => (productId ? addonsForItem(addons, productId) : []),
    [addons, productId],
  );

  const handleImagesUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const list = Array.from(files);
      for (const file of list) {
        const url = await uploadToCloudinary(file, {
          cloudName: businessSettings?.cloudinaryCloudName as string | undefined,
          uploadPreset: businessSettings?.cloudinaryUploadPreset as string | undefined,
        });
        await saveImageUploadToRtdb(url, { context: "product", userId: user?.uid ?? null });
        setForm((f) => ({ ...f, imageUrls: [...(f.imageUrls || []), url] }));
      }
      toast.success(list.length > 1 ? `${list.length} images uploaded` : "Image uploaded");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const removeProductImage = (index: number) => {
    setForm((f) => ({
      ...f,
      imageUrls: (f.imageUrls || []).filter((_, i) => i !== index),
    }));
  };

  const handleSave = async () => {
    if (!restaurantId) return;
    if (!form.name || !form.price) {
      toast.error("Name and price required");
      return;
    }
    setSaving(true);
    try {
      const imageUrls = Array.isArray(form.imageUrls) ? form.imageUrls.filter(Boolean) : [];
      const id = editing?.id ?? form.id ?? newMenuId("itm");
      const categoryName = categories.find((c) => c.id === form.category)?.name ?? form.categoryName ?? "";
      const allergens = allergensInput
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);
      const data = mapProductToRtdb(
        restaurantId,
        {
          ...form,
          id,
          price: Number(form.price),
          discountPrice:
            form.discountPrice === null || form.discountPrice === ("" as unknown)
              ? null
              : Number(form.discountPrice),
          prepTime: Number(form.prepTime || 15),
          pointsValue: Math.max(0, Math.round(Number(form.pointsValue ?? 5))),
          allergens,
          imageUrls,
          imageUrl: imageUrls[0] || "",
          category_id: form.category || null,
          categoryName,
        },
        categoryName,
      );
      await set(ref(db, `${itemsPath(restaurantId)}/${id}`), data);
      toast.success(editing ? "Product updated" : "Product added");
      setOpen(false);
      setEditing(null);
      setForm(emptyProduct());
      setAllergensInput("");
      resetCustomForms();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!restaurantId || readOnly) return;
    if (!confirm("Delete this product and its variants/add-ons?")) return;
    const linkedVariants = variantsForItem(variants, id);
    const linkedAddons = addonsForItem(addons, id);
    await Promise.all([
      ...linkedVariants.map((v) => remove(ref(db, `${variantsPath(restaurantId)}/${v.id}`))),
      ...linkedAddons.map((a) => remove(ref(db, `${addonsPath(restaurantId)}/${a.id}`))),
      remove(ref(db, `${itemsPath(restaurantId)}/${id}`)),
    ]);
    toast.success("Product deleted");
  };

  const toggleAvailability = async (product: UiProduct) => {
    if (!restaurantId || readOnly) return;
    const available = product.available !== false;
    await update(ref(db, `${itemsPath(restaurantId)}/${product.id}`), {
      is_available: !available,
      available: !available,
      isAvailable: !available,
    });
    toast.success(available ? "Product disabled" : "Product enabled");
  };

  const resetCustomForms = () => {
    setVariantForm({ name: "", priceDelta: 0, isDefault: false, isAvailable: true });
    setEditingVariantId(null);
    setAddonForm({ name: "", price: 0, maxQuantity: 3, isAvailable: true });
    setEditingAddonId(null);
  };

  const openEdit = (p: UiProduct) => {
    setEditing(p);
    const imageUrls = normalizeProductImages(p);
    setForm({
      ...emptyProduct(),
      ...p,
      imageUrls,
      imageUrl: imageUrls[0] || "",
      modifierIds: p.modifierIds || [],
      modifierConfig: p.modifierConfig || {},
      extrasProducts: p.extrasProducts || [],
    });
    setAllergensInput((p.allergens || []).join(", "));
    resetCustomForms();
    setOpen(true);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyProduct());
    setAllergensInput("");
    resetCustomForms();
  };

  const ensureProductId = async (): Promise<string | null> => {
    if (!restaurantId) return null;
    if (editing?.id) return editing.id;
    if (form.id) return form.id;
    if (!form.name || !form.price) {
      toast.error("Save product name and price first, or fill them before adding variants");
      return null;
    }
    const id = newMenuId("itm");
    const categoryName = categories.find((c) => c.id === form.category)?.name ?? "";
    const imageUrls = Array.isArray(form.imageUrls) ? form.imageUrls.filter(Boolean) : [];
    const allergens = allergensInput
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);
    const product: UiProduct = {
      ...form,
      id,
      price: Number(form.price),
      discountPrice:
        form.discountPrice == null || Number.isNaN(Number(form.discountPrice))
          ? null
          : Number(form.discountPrice),
      prepTime: Number(form.prepTime || 15),
      pointsValue: Math.max(0, Math.round(Number(form.pointsValue ?? 5))),
      allergens,
      imageUrls,
      imageUrl: imageUrls[0] || "",
      category_id: form.category || null,
      categoryName,
    };
    await set(ref(db, `${itemsPath(restaurantId)}/${id}`), mapProductToRtdb(restaurantId, product, categoryName));
    setEditing(product);
    setForm({ ...product });
    toast.success("Product created — you can now add variants and add-ons");
    return id;
  };

  const saveVariant = async () => {
    if (!restaurantId || readOnly) return;
    if (!variantForm.name.trim()) {
      toast.error("Variant name required");
      return;
    }
    setCustomSaving(true);
    try {
      const itemId = await ensureProductId();
      if (!itemId) return;
      const id = editingVariantId ?? newMenuId("var");
      const ui: UiVariant = {
        id,
        menuItemId: itemId,
        name: variantForm.name.trim(),
        priceDelta: Number(variantForm.priceDelta) || 0,
        isDefault: variantForm.isDefault,
        isAvailable: variantForm.isAvailable !== false,
        sortOrder: editingVariantId
          ? productVariants.find((v) => v.id === editingVariantId)?.sortOrder ?? productVariants.length
          : productVariants.length,
      };
      await set(ref(db, `${variantsPath(restaurantId)}/${id}`), mapVariantToRtdb(ui));
      toast.success(editingVariantId ? "Variant updated" : "Variant added");
      setVariantForm({ name: "", priceDelta: 0, isDefault: false, isAvailable: true });
      setEditingVariantId(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save variant");
    } finally {
      setCustomSaving(false);
    }
  };

  const deleteVariant = async (id: string) => {
    if (!restaurantId || readOnly) return;
    if (!confirm("Delete this variant?")) return;
    await remove(ref(db, `${variantsPath(restaurantId)}/${id}`));
    toast.success("Variant deleted");
  };

  const saveAddon = async () => {
    if (!restaurantId || readOnly) return;
    if (!addonForm.name.trim()) {
      toast.error("Add-on name required");
      return;
    }
    setCustomSaving(true);
    try {
      const itemId = await ensureProductId();
      if (!itemId) return;
      const id = editingAddonId ?? newMenuId("add");
      const ui: UiAddon = {
        id,
        menuItemId: itemId,
        name: addonForm.name.trim(),
        price: Number(addonForm.price) || 0,
        maxQuantity: Math.max(1, Number(addonForm.maxQuantity) || 3),
        isAvailable: addonForm.isAvailable !== false,
      };
      await set(ref(db, `${addonsPath(restaurantId)}/${id}`), mapAddonToRtdb(ui));
      toast.success(editingAddonId ? "Add-on updated" : "Add-on added");
      setAddonForm({ name: "", price: 0, maxQuantity: 3, isAvailable: true });
      setEditingAddonId(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save add-on");
    } finally {
      setCustomSaving(false);
    }
  };

  const deleteAddon = async (id: string) => {
    if (!restaurantId || readOnly) return;
    if (!confirm("Delete this add-on?")) return;
    await remove(ref(db, `${addonsPath(restaurantId)}/${id}`));
    toast.success("Add-on deleted");
  };

  const toggleChoiceForProduct = (modId: string, choiceIdx: number, modifier: UiModifier) => {
    const config = { ...(form.modifierConfig || {}) };
    const modConfig = { ...(config[modId] || {}) };
    const key = String(choiceIdx);
    const current = modConfig[key];
    if (current?.selected) {
      modConfig[key] = { selected: false, price: 0 };
    } else {
      const originalPrice = modifier.choices?.[choiceIdx]?.price || 0;
      modConfig[key] = { selected: true, price: originalPrice };
    }
    config[modId] = modConfig;
    const modifierIds = Object.keys(config).filter((mid) =>
      Object.values(config[mid] || {}).some((c) => c.selected),
    );
    setForm({ ...form, modifierConfig: config, modifierIds });
  };

  const updateChoicePriceForProduct = (modId: string, choiceIdx: number, price: number) => {
    const config = { ...(form.modifierConfig || {}) };
    const modConfig = { ...(config[modId] || {}) };
    const key = String(choiceIdx);
    modConfig[key] = { ...(modConfig[key] || { selected: true }), price };
    config[modId] = modConfig;
    setForm({ ...form, modifierConfig: config });
  };

  const toggleExtraProduct = (prodId: string) => {
    const ids = form.extrasProducts || [];
    setForm({
      ...form,
      extrasProducts: ids.includes(prodId) ? ids.filter((id) => id !== prodId) : [...ids, prodId],
    });
  };

  const getCategoryName = (id: string, fallback = "") =>
    categories.find((c) => c.id === id)?.name || fallback || "—";

  const filtered = products
    .filter((p) => categoryFilter === "all" || p.category === categoryFilter)
    .filter((p) =>
      availabilityFilter === "all"
        ? true
        : availabilityFilter === "available"
          ? p.available !== false
          : p.available === false,
    )
    .filter((p) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return p.name.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q);
    });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="text-sm text-muted-foreground">{products.length} products</p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) {
              setEditing(null);
              setForm(emptyProduct());
              setAllergensInput("");
              resetCustomForms();
            } else if (!editing) {
              openCreate();
            }
          }}
        >
          {!readOnly && (
            <DialogTrigger asChild>
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1" />
                Add Product
              </Button>
            </DialogTrigger>
          )}
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Product" : "Add Product"}</DialogTitle>
            </DialogHeader>
            <Tabs defaultValue="details" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="variants">Variants ({productVariants.length})</TabsTrigger>
                <TabsTrigger value="addons">Add-ons ({productAddons.length})</TabsTrigger>
                <TabsTrigger value="modifiers">Modifiers</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Base Price (R)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.price}
                      onChange={(e) => setForm({ ...form, price: e.target.value as unknown as number })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Sale price (R)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Optional"
                      value={form.discountPrice ?? ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          discountPrice: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Loyalty points</Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.pointsValue}
                      onChange={(e) => setForm({ ...form, pointsValue: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories
                          .filter((c) => c.active !== false)
                          .map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Prep Time (min)</Label>
                    <Input
                      type="number"
                      value={form.prepTime}
                      onChange={(e) => setForm({ ...form, prepTime: e.target.value as unknown as number })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Allergens</Label>
                  <Input
                    placeholder="e.g. dairy, gluten, nuts (comma-separated)"
                    value={allergensInput}
                    onChange={(e) => setAllergensInput(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Product images</Label>
                  <p className="text-xs text-muted-foreground">
                    Add multiple photos; the first is used as the main thumbnail.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(form.imageUrls || []).map((url, idx) => (
                      <div key={`${url}-${idx}`} className="relative group">
                        <img src={url} alt="" className="h-20 w-20 rounded-lg object-cover border border-border" />
                        <button
                          type="button"
                          onClick={() => removeProductImage(idx)}
                          className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-md opacity-90 hover:opacity-100"
                          aria-label="Remove image"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                        {idx === 0 && (
                          <span className="absolute bottom-1 left-1 rounded bg-background/90 px-1.5 py-0.5 text-[9px] font-medium text-foreground">
                            Main
                          </span>
                        )}
                      </div>
                    ))}
                    <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-muted/30 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground">
                      <Image className="h-5 w-5" />
                      <span className="text-[10px]">{uploading ? "…" : "Add"}</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        disabled={uploading}
                        onChange={(e) => {
                          handleImagesUpload(e.target.files);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
                  <div>
                    <Label>Available</Label>
                    <p className="text-xs text-muted-foreground">Toggle product availability</p>
                  </div>
                  <Switch
                    checked={form.available !== false}
                    onCheckedChange={(v) => setForm({ ...form, available: v })}
                  />
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
                  <div>
                    <Label className="flex items-center gap-1.5">
                      <Star className="h-3.5 w-3.5" /> Featured
                    </Label>
                    <p className="text-xs text-muted-foreground">Highlight on the customer menu</p>
                  </div>
                  <Switch
                    checked={form.isFeatured === true}
                    onCheckedChange={(v) => setForm({ ...form, isFeatured: v })}
                  />
                </div>
                {editing?.id && (
                  <p className="text-[11px] text-muted-foreground font-mono">ID: {editing.id}</p>
                )}
                <Button onClick={handleSave} disabled={saving || readOnly} className="w-full">
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {editing ? "Update Product" : "Add Product"}
                </Button>
              </TabsContent>

              <TabsContent value="variants" className="space-y-4 py-2">
                <p className="text-xs text-muted-foreground">
                  Sizes / versions linked to this product (e.g. Small, Large). Price is an extra on top of base.
                </p>
                {!readOnly && (
                  <div className="space-y-3 rounded-lg border border-border p-3 bg-muted/20">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Name</Label>
                        <Input
                          value={variantForm.name}
                          onChange={(e) => setVariantForm({ ...variantForm, name: e.target.value })}
                          placeholder="e.g. Large"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Price delta (R)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={variantForm.priceDelta}
                          onChange={(e) =>
                            setVariantForm({ ...variantForm, priceDelta: Number(e.target.value) })
                          }
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <label className="flex items-center gap-2 text-sm">
                        <Switch
                          checked={variantForm.isDefault}
                          onCheckedChange={(v) => setVariantForm({ ...variantForm, isDefault: v })}
                        />
                        Default
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <Switch
                          checked={variantForm.isAvailable !== false}
                          onCheckedChange={(v) => setVariantForm({ ...variantForm, isAvailable: v })}
                        />
                        Available
                      </label>
                      <Button size="sm" onClick={saveVariant} disabled={customSaving}>
                        {customSaving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                        {editingVariantId ? "Update" : "Add"} variant
                      </Button>
                      {editingVariantId && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingVariantId(null);
                            setVariantForm({ name: "", priceDelta: 0, isDefault: false, isAvailable: true });
                          }}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                )}
                {productVariants.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No variants yet</p>
                ) : (
                  <div className="space-y-2">
                    {productVariants.map((v) => (
                      <div
                        key={v.id}
                        className={`flex items-center justify-between p-3 rounded-lg border ${
                          v.isAvailable === false ? "opacity-60 border-border" : "border-border bg-muted/30"
                        }`}
                      >
                        <div>
                          <p className="text-sm font-medium">
                            {v.name}
                            {v.isDefault && (
                              <Badge variant="secondary" className="ml-2 text-[10px]">
                                Default
                              </Badge>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {v.priceDelta >= 0 ? "+" : ""}R{Number(v.priceDelta).toFixed(2)}
                            {v.isAvailable === false ? " · Unavailable" : ""}
                          </p>
                        </div>
                        {!readOnly && (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingVariantId(v.id);
                                setVariantForm({
                                  name: v.name,
                                  priceDelta: v.priceDelta,
                                  isDefault: v.isDefault,
                                  isAvailable: v.isAvailable,
                                });
                              }}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() => deleteVariant(v.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="addons" className="space-y-4 py-2">
                <p className="text-xs text-muted-foreground">
                  Optional extras linked to this product (e.g. Extra cheese).
                </p>
                {!readOnly && (
                  <div className="space-y-3 rounded-lg border border-border p-3 bg-muted/20">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Name</Label>
                        <Input
                          value={addonForm.name}
                          onChange={(e) => setAddonForm({ ...addonForm, name: e.target.value })}
                          placeholder="e.g. Extra cheese"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Price (R)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={addonForm.price}
                          onChange={(e) => setAddonForm({ ...addonForm, price: Number(e.target.value) })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Max qty</Label>
                        <Input
                          type="number"
                          min={1}
                          value={addonForm.maxQuantity}
                          onChange={(e) =>
                            setAddonForm({ ...addonForm, maxQuantity: Number(e.target.value) })
                          }
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <label className="flex items-center gap-2 text-sm">
                        <Switch
                          checked={addonForm.isAvailable !== false}
                          onCheckedChange={(v) => setAddonForm({ ...addonForm, isAvailable: v })}
                        />
                        Available
                      </label>
                      <Button size="sm" onClick={saveAddon} disabled={customSaving}>
                        {customSaving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                        {editingAddonId ? "Update" : "Add"} add-on
                      </Button>
                      {editingAddonId && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingAddonId(null);
                            setAddonForm({ name: "", price: 0, maxQuantity: 3, isAvailable: true });
                          }}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                )}
                {productAddons.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No add-ons yet</p>
                ) : (
                  <div className="space-y-2">
                    {productAddons.map((a) => (
                      <div
                        key={a.id}
                        className={`flex items-center justify-between p-3 rounded-lg border ${
                          a.isAvailable === false ? "opacity-60 border-border" : "border-border bg-muted/30"
                        }`}
                      >
                        <div>
                          <p className="text-sm font-medium">{a.name}</p>
                          <p className="text-xs text-muted-foreground">
                            +R{Number(a.price).toFixed(2)} · max {a.maxQuantity}
                            {a.isAvailable === false ? " · Unavailable" : ""}
                          </p>
                        </div>
                        {!readOnly && (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingAddonId(a.id);
                                setAddonForm({
                                  name: a.name,
                                  price: a.price,
                                  maxQuantity: a.maxQuantity,
                                  isAvailable: a.isAvailable,
                                });
                              }}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() => deleteAddon(a.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="modifiers" className="space-y-4 py-2">
                {modifiers.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No modifier groups yet. Create them under Modifiers first.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Select choices to assign modifier groups to this product
                    </p>
                    {modifiers.map((m) => {
                      const config = form.modifierConfig?.[m.id] || {};
                      const hasSelected = Object.values(config).some((c) => c.selected);
                      return (
                        <div
                          key={m.id}
                          className={`rounded-lg border transition-colors ${
                            hasSelected ? "border-primary/50 bg-primary/5" : "border-border bg-muted/30"
                          }`}
                        >
                          <div className="p-3">
                            <div className="flex items-center gap-3 mb-2">
                              <SlidersHorizontal
                                className={`h-4 w-4 ${hasSelected ? "text-primary" : "text-muted-foreground"}`}
                              />
                              <div>
                                <p className="text-sm font-medium">{m.name}</p>
                                <p className="text-[10px] text-muted-foreground uppercase">
                                  {m.type === "option"
                                    ? "Option • Required"
                                    : `Extra • Max ${m.maxSelections || "∞"}`}
                                  {m.includePricing ? " • Has Pricing" : ""}
                                </p>
                              </div>
                            </div>
                            {m.choices?.length > 0 && (
                              <div className="space-y-1.5 pl-7">
                                {m.choices.map((c, i) => {
                                  const choiceConfig = config[String(i)];
                                  const isChecked = choiceConfig?.selected || false;
                                  return (
                                    <div key={i} className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        disabled={readOnly}
                                        onChange={() => toggleChoiceForProduct(m.id, i, m)}
                                        className="h-4 w-4 rounded border-primary accent-primary cursor-pointer"
                                      />
                                      <span className="text-sm flex-1">{c.label}</span>
                                      {m.includePricing && isChecked && (
                                        <div className="flex items-center gap-1">
                                          <span className="text-xs text-muted-foreground">R</span>
                                          <Input
                                            type="number"
                                            step="0.01"
                                            className="w-20 h-7 text-xs"
                                            disabled={readOnly}
                                            value={choiceConfig?.price ?? c.price ?? 0}
                                            onChange={(e) =>
                                              updateChoicePriceForProduct(m.id, i, Number(e.target.value))
                                            }
                                          />
                                        </div>
                                      )}
                                      {m.includePricing && !isChecked && c.price > 0 && (
                                        <span className="text-xs text-muted-foreground">
                                          +R{Number(c.price).toFixed(2)}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {products.filter((p) => !editing || p.id !== editing.id).length > 0 && (
                  <div className="space-y-3 pt-2 border-t border-border">
                    <Label>Extra Products</Label>
                    <p className="text-xs text-muted-foreground">Select products to offer as extras</p>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {products
                        .filter((p) => !editing || p.id !== editing.id)
                        .map((p) => {
                          const thumb = primaryProductImage(p);
                          return (
                            <div
                              key={p.id}
                              onClick={() => !readOnly && toggleExtraProduct(p.id)}
                              className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                                (form.extrasProducts || []).includes(p.id)
                                  ? "border-primary/50 bg-primary/5"
                                  : "border-border bg-muted/30 hover:bg-muted/50"
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                {thumb ? (
                                  <img src={thumb} alt="" className="w-8 h-8 rounded object-cover" />
                                ) : (
                                  <div className="w-8 h-8 rounded bg-muted flex items-center justify-center">
                                    <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                                  </div>
                                )}
                                <div>
                                  <p className="text-sm font-medium">{p.name}</p>
                                  <p className="text-[10px] text-muted-foreground">
                                    +R{Number(p.price).toFixed(2)}
                                  </p>
                                </div>
                              </div>
                              <div
                                className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                                  (form.extrasProducts || []).includes(p.id)
                                    ? "border-primary bg-primary"
                                    : "border-muted-foreground"
                                }`}
                              >
                                {(form.extrasProducts || []).includes(p.id) && (
                                  <svg
                                    className="w-3 h-3 text-primary-foreground"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={3}
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
                <Button onClick={handleSave} disabled={saving || readOnly} className="w-full">
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Save modifier assignment
                </Button>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-44">
            <Filter className="h-3 w-3 mr-1" />
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={availabilityFilter} onValueChange={setAvailabilityFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Availability" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="available">Available</SelectItem>
            <SelectItem value="unavailable">Unavailable</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <TableSkeleton columns={8} />
      ) : (
        <div className="glass-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Image</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No products found
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((p) => {
                  const imgs = normalizeProductImages(p);
                  const thumb = imgs[0];
                  const vCount = variantsForItem(variants, p.id).length;
                  const aCount = addonsForItem(addons, p.id).length;
                  const mCount = p.modifierIds?.length ?? 0;
                  const hasSale =
                    p.discountPrice != null && p.discountPrice > 0 && p.discountPrice < p.price;
                  return (
                    <TableRow key={p.id} className={p.available === false ? "opacity-60" : ""}>
                      <TableCell>
                        <div className="relative inline-block">
                          {thumb ? (
                            <img src={thumb} alt={p.name} className="w-10 h-10 rounded object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                              <Image className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                          {imgs.length > 1 && (
                            <span className="absolute -bottom-1 -right-1 rounded bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
                              +{imgs.length - 1}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm flex items-center gap-1.5">
                            {p.name}
                            {p.isFeatured && <Star className="h-3 w-3 text-amber-500 fill-amber-500" />}
                          </p>
                          <p className="text-xs text-muted-foreground line-clamp-1">{p.description}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {vCount} variants · {aCount} add-ons · {mCount} modifiers · {p.prepTime || 15}{" "}
                            min prep
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {getCategoryName(p.category, p.categoryName)}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">
                          {hasSale ? (
                            <>
                              <span className="text-destructive">R{Number(p.discountPrice).toFixed(2)}</span>
                              <span className="ml-1.5 text-xs text-muted-foreground line-through">
                                R{Number(p.price).toFixed(2)}
                              </span>
                              <Badge variant="secondary" className="ml-1.5 text-[9px]">
                                Sale
                              </Badge>
                            </>
                          ) : (
                            <>R{Number(p.price).toFixed(2)}</>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground">{p.pointsValue ?? 5} pts</p>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {(p.allergens || []).length > 0 ? (
                          <span className="line-clamp-2">{p.allergens.join(", ")}</span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={p.available !== false}
                          onCheckedChange={() => toggleAvailability(p)}
                          disabled={readOnly}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          {!readOnly && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(p.id)}
                              className="text-destructive"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};

export default Products;
