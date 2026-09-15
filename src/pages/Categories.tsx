import { useEffect, useState } from "react";
import { db } from "@/lib/firestore";
import { uploadToCloudinary, saveImageUploadToRtdb } from "@/lib/cloudinary";
import {
  categoriesPath,
  mapCategoryFromRtdb,
  mapCategoryToRtdb,
  newMenuId,
} from "@/lib/menus";
import { ref, onValue, set, update, remove } from "@/lib/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { useBusinessSettings } from "@/hooks/useBusinessSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Loader2, FolderOpen, Image, Search, Filter } from "lucide-react";
import { toast } from "sonner";
import TableSkeleton from "@/components/TableSkeleton";
import { Label } from "@/components/ui/label";

const Categories = () => {
  const { canManage, restaurantId, user } = useAuth();
  const readOnly = !canManage("menu");
  const { businessSettings } = useBusinessSettings(restaurantId);
  const [categories, setCategories] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    if (!restaurantId) return;
    const unsub = onValue(ref(db, categoriesPath(restaurantId)), (snap) => {
      if (!snap.exists()) { setCategories([]); }
      else {
        setCategories(
          Object.entries(snap.val()).map(([id, val]: [string, any]) =>
            mapCategoryFromRtdb(id, val),
          ),
        );
      }
      setLoading(false);
    });
    return unsub;
  }, [restaurantId]);

  const handleImageUpload = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadToCloudinary(file, {
        cloudName: businessSettings?.cloudinaryCloudName as string | undefined,
        uploadPreset: businessSettings?.cloudinaryUploadPreset as string | undefined,
      });
      await saveImageUploadToRtdb(url, { context: "category", userId: user?.uid ?? null });
      setImageUrl(url);
      toast.success("Image uploaded");
    } catch (err: any) {
      toast.error(err?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!restaurantId) return;
    if (!name.trim()) { toast.error("Name required"); return; }
    setSaving(true);
    try {
      const id = editing?.id ?? newMenuId("cat");
      const data = mapCategoryToRtdb(restaurantId, {
        id,
        name: name.trim(),
        imageUrl,
        active,
        sort_order: editing?.sort_order ?? categories.length,
      });
      await set(ref(db, `${categoriesPath(restaurantId)}/${id}`), data);
      toast.success(editing ? "Category updated" : "Category added");
      resetForm();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const resetForm = () => { setOpen(false); setEditing(null); setName(""); setImageUrl(""); setActive(true); };

  const handleDelete = async (id: string) => {
    if (!restaurantId || readOnly) return;
    if (!confirm("Delete this category?")) return;
    await remove(ref(db, `${categoriesPath(restaurantId)}/${id}`));
    toast.success("Deleted");
  };

  const toggleActive = async (c: any) => {
    if (!restaurantId || readOnly) return;
    const nextActive = c.active === false;
    await update(ref(db, `${categoriesPath(restaurantId)}/${c.id}`), { is_available: nextActive, active: nextActive });
  };

  const filtered = categories
    .filter(c => statusFilter === "all" || (statusFilter === "active" ? c.active !== false : c.active === false))
    .filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Categories</h1>
          <p className="text-sm text-muted-foreground">{categories.length} categories</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          {!readOnly && (
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" />Add Category</Button>
          </DialogTrigger>
          )}
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} Category</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Category Name</Label>
                <Input placeholder="Category name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Category Image</Label>
                <div className="flex items-center gap-4">
                  {imageUrl && <img src={imageUrl} alt="" className="w-14 h-14 rounded-lg object-cover border border-border" />}
                  <label className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm cursor-pointer hover:bg-secondary/80 transition-colors">
                    <Image className="h-4 w-4" />{uploading ? "Uploading..." : "Upload"}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])} />
                  </label>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
                <Label>Active</Label>
                <Switch checked={active} onCheckedChange={setActive} />
              </div>
              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {editing ? "Update" : "Add"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search categories..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><Filter className="h-3 w-3 mr-1" /><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? <TableSkeleton columns={4} /> : (
      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Image</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No categories found</TableCell></TableRow>
            ) : filtered.map((c) => (
              <TableRow key={c.id} className={c.active === false ? "opacity-60" : ""}>
                <TableCell>
                  {c.imageUrl ? <img src={c.imageUrl} alt={c.name} className="w-10 h-10 rounded object-cover" /> : <div className="w-10 h-10 rounded bg-muted flex items-center justify-center"><FolderOpen className="h-4 w-4 text-muted-foreground" /></div>}
                </TableCell>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>
                  <Switch checked={c.active !== false} onCheckedChange={() => toggleActive(c)} disabled={readOnly} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {!readOnly && (
                    <Button variant="ghost" size="sm" onClick={() => { setEditing(c); setName(c.name); setImageUrl(c.imageUrl || ""); setActive(c.active !== false); setOpen(true); }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    )}
                    {!readOnly && <Button variant="ghost" size="sm" onClick={() => handleDelete(c.id)} className="text-destructive"><Trash2 className="h-3 w-3" /></Button>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      )}
    </div>
  );
};

export default Categories;
