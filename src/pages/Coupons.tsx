import { useEffect, useState } from "react";
import { db } from "@/lib/firestore";
import { ref, onValue, push, update, remove } from "@/lib/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Loader2, Ticket, Search, Filter } from "lucide-react";
import { toast } from "sonner";
import TableSkeleton from "@/components/TableSkeleton";

const defaultCoupon = { code: "", discountType: "percentage", discountValue: 0, expiryDate: "", usageLimit: 0, usedCount: 0, active: true };

const Coupons = () => {
  const { canManage } = useAuth();
  const readOnly = !canManage("promotions");
  const [coupons, setCoupons] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>(defaultCoupon);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  useEffect(() => {
    const unsub = onValue(ref(db, "coupons"), (snap) => {
      if (!snap.exists()) { setCoupons([]); } else { setCoupons(Object.entries(snap.val()).map(([id, val]: any) => ({ id, ...val }))); }
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleSave = async () => {
    if (!form.code.trim()) { toast.error("Coupon code required"); return; }
    setSaving(true);
    try {
      const data = { ...form, discountValue: Number(form.discountValue), usageLimit: Number(form.usageLimit) };
      delete data.id;
      if (editing) { await update(ref(db, `coupons/${editing.id}`), data); toast.success("Coupon updated"); }
      else { await push(ref(db, "coupons"), data); toast.success("Coupon created"); }
      setOpen(false); setEditing(null); setForm(defaultCoupon);
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this coupon?")) return;
    await remove(ref(db, `coupons/${id}`)); toast.success("Deleted");
  };

  const isExpired = (date: string) => date && new Date(date) < new Date();

  const filtered = coupons
    .filter(c => statusFilter === "all" || (statusFilter === "active" ? !isExpired(c.expiryDate) : isExpired(c.expiryDate)))
    .filter(c => typeFilter === "all" || c.discountType === typeFilter)
    .filter(c => !search || c.code.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Coupons</h1>
          <p className="text-sm text-muted-foreground">{coupons.length} coupons</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditing(null); setForm(defaultCoupon); } }}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Add Coupon</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} Coupon</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2"><Label>Coupon Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="e.g. SAVE20" /></div>
              <div className="space-y-2">
                <Label>Discount Type</Label>
                <Select value={form.discountType} onValueChange={(v) => setForm({ ...form, discountType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="fixed">Fixed Amount (R)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Discount Value</Label><Input type="number" step="0.01" value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: e.target.value })} /></div>
                <div className="space-y-2"><Label>Usage Limit</Label><Input type="number" value={form.usageLimit} onChange={(e) => setForm({ ...form, usageLimit: e.target.value })} placeholder="0 = unlimited" /></div>
              </div>
              <div className="space-y-2"><Label>Expiry Date</Label><Input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} /></div>
              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}{editing ? "Update" : "Create"} Coupon
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search coupon codes..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><Filter className="h-3 w-3 mr-1" /><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Discount Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="percentage">Percentage</SelectItem>
            <SelectItem value="fixed">Fixed Amount</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? <TableSkeleton columns={6} /> : (
      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Discount</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead>Expiry</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No coupons found</TableCell></TableRow>
            ) : filtered.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Ticket className="h-4 w-4 text-primary" />
                    <span className="font-mono font-bold text-sm">{c.code}</span>
                  </div>
                </TableCell>
                <TableCell className="text-sm">{c.discountType === "percentage" ? `${c.discountValue}%` : `R${Number(c.discountValue).toFixed(2)}`}</TableCell>
                <TableCell className="text-sm">{c.usedCount || 0}{c.usageLimit ? ` / ${c.usageLimit}` : " (∞)"}</TableCell>
                <TableCell className="text-sm">{c.expiryDate ? new Date(c.expiryDate).toLocaleDateString() : "—"}</TableCell>
                <TableCell>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${isExpired(c.expiryDate) ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"}`}>
                    {isExpired(c.expiryDate) ? "Expired" : "Active"}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => { setEditing(c); setForm({ ...c }); setOpen(true); }}><Pencil className="h-3 w-3" /></Button>
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

export default Coupons;
