import { useEffect, useState } from "react";
import { db } from "@/lib/firestore";
import { ref, onValue, set, remove } from "@/lib/firestore";
import { useAuth } from "@/contexts/AuthContext";
import {
  mapModifierFromRtdb,
  mapModifierToRtdb,
  modifiersPath,
  newMenuId,
  type UiModifier,
} from "@/lib/menus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Loader2, SlidersHorizontal, GripVertical, Search, Filter } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import TableSkeleton from "@/components/TableSkeleton";

const defaultModifier = {
  name: "",
  type: "option" as "option" | "extra",
  required: true,
  includePricing: false,
  minSelections: 1,
  maxSelections: 1,
  choices: [{ label: "", price: 0 }],
};

const Modifiers = () => {
  const { canManage, restaurantId } = useAuth();
  const readOnly = !canManage("menu");
  const [modifiers, setModifiers] = useState<UiModifier[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UiModifier | null>(null);
  const [form, setForm] = useState(defaultModifier);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  useEffect(() => {
    if (!restaurantId) return;
    const unsub = onValue(ref(db, modifiersPath(restaurantId)), (snap) => {
      if (!snap.exists()) {
        setModifiers([]);
      } else {
        setModifiers(
          Object.entries(snap.val())
            .map(([id, val]) => mapModifierFromRtdb(id, val as Record<string, unknown>, restaurantId))
            .sort((a, b) => a.sortOrder - b.sortOrder),
        );
      }
      setLoading(false);
    });
    return unsub;
  }, [restaurantId]);

  const handleTypeChange = (type: "option" | "extra") => {
    if (type === "option") {
      setForm({ ...form, type, required: true, minSelections: 1, maxSelections: 1 });
    } else {
      setForm({ ...form, type, required: false, minSelections: 0, maxSelections: 3 });
    }
  };

  const handleSave = async () => {
    if (!restaurantId) return;
    if (!form.name.trim()) {
      toast.error("Name required");
      return;
    }
    if (!form.choices?.length || !form.choices[0]?.label) {
      toast.error("Add at least one choice");
      return;
    }
    setSaving(true);
    try {
      const id = editing?.id ?? newMenuId("mod");
      const ui: UiModifier = {
        id,
        restaurantId,
        name: form.name.trim(),
        type: form.type,
        required: form.type === "option" ? true : !!form.required,
        includePricing: !!form.includePricing,
        minSelections: Number(form.minSelections),
        maxSelections: Number(form.maxSelections),
        choices: form.choices.map((c) => ({
          label: c.label,
          price: form.includePricing ? Number(c.price) : 0,
        })),
        sortOrder: editing?.sortOrder ?? modifiers.length,
        isAvailable: editing?.isAvailable !== false,
      };
      await set(ref(db, `${modifiersPath(restaurantId)}/${id}`), mapModifierToRtdb(restaurantId, ui));
      toast.success(editing ? "Modifier updated" : "Modifier created");
      setOpen(false);
      setEditing(null);
      setForm(defaultModifier);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!restaurantId || readOnly) return;
    if (!confirm("Delete this modifier?")) return;
    await remove(ref(db, `${modifiersPath(restaurantId)}/${id}`));
    toast.success("Deleted");
  };

  const addChoice = () => {
    setForm({ ...form, choices: [...(form.choices || []), { label: "", price: 0 }] });
  };
  const updateChoice = (idx: number, field: string, value: unknown) => {
    const choices = [...(form.choices || [])];
    choices[idx] = {
      ...choices[idx],
      [field]: field === "price" ? Number(value) : value,
    };
    setForm({ ...form, choices });
  };
  const removeChoice = (idx: number) => {
    const choices = [...(form.choices || [])];
    choices.splice(idx, 1);
    setForm({ ...form, choices });
  };

  const openEdit = (m: UiModifier) => {
    setEditing(m);
    setForm({
      name: m.name,
      type: m.type,
      required: m.required,
      includePricing: m.includePricing,
      minSelections: m.minSelections,
      maxSelections: m.maxSelections,
      choices: m.choices.length ? m.choices.map((c) => ({ ...c })) : [{ label: "", price: 0 }],
    });
    setOpen(true);
  };

  const filtered = modifiers
    .filter((m) => typeFilter === "all" || m.type === typeFilter)
    .filter((m) => !search || m.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Modifiers</h1>
          <p className="text-sm text-muted-foreground">{modifiers.length} modifier groups</p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) {
              setEditing(null);
              setForm(defaultModifier);
            }
          }}
        >
          {!readOnly && (
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Add Modifier
              </Button>
            </DialogTrigger>
          )}
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit" : "Add"} Modifier Group</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Modifier Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Size, Add-ons"
                />
              </div>
              <div className="space-y-2">
                <Label>Modifier Type</Label>
                <Select value={form.type} onValueChange={(v: "option" | "extra") => handleTypeChange(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="option">Option (Required, Single Choice)</SelectItem>
                    <SelectItem value="extra">Extra (Optional, Multiple Choices)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Min Selections</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.minSelections}
                    onChange={(e) => setForm({ ...form, minSelections: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Selections</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.maxSelections}
                    onChange={(e) => setForm({ ...form, maxSelections: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                <Checkbox
                  id="includePricing"
                  checked={form.includePricing || false}
                  onCheckedChange={(v) => setForm({ ...form, includePricing: !!v })}
                />
                <div>
                  <Label htmlFor="includePricing" className="cursor-pointer">
                    Include Pricing
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Enable to set a price adjustment for each choice
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Choices</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addChoice}>
                    <Plus className="h-3 w-3 mr-1" />
                    Add Choice
                  </Button>
                </div>
                {(form.choices || []).map((ch, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Input
                      placeholder="Choice name"
                      value={ch.label}
                      onChange={(e) => updateChoice(i, "label", e.target.value)}
                    />
                    {form.includePricing && (
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Price"
                        className="w-24"
                        value={ch.price}
                        onChange={(e) => updateChoice(i, "price", e.target.value)}
                      />
                    )}
                    {(form.choices || []).length > 1 && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeChoice(i)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {editing ? "Update" : "Create"} Modifier
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search modifiers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40">
            <Filter className="h-3 w-3 mr-1" />
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="option">Options</SelectItem>
            <SelectItem value="extra">Extras</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <TableSkeleton columns={6} />
      ) : (
        <div className="glass-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Choices</TableHead>
                <TableHead>Pricing</TableHead>
                <TableHead>Selections</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No modifiers found
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <SlidersHorizontal
                          className={`h-4 w-4 ${m.type === "option" ? "text-primary" : "text-success"}`}
                        />
                        <span className="font-medium text-sm">{m.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase ${
                          m.type === "option" ? "bg-primary/10 text-primary" : "bg-success/10 text-success"
                        }`}
                      >
                        {m.type}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {(m.choices || []).map((c) => c.label).join(", ")}
                    </TableCell>
                    <TableCell className="text-sm">
                      {m.includePricing
                        ? (m.choices || [])
                            .map((c) => (c.price > 0 ? `+R${c.price.toFixed(2)}` : "Included"))
                            .join(", ")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {m.minSelections}–{m.maxSelections}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(m)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        {!readOnly && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(m.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};

export default Modifiers;
