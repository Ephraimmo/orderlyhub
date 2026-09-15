import { useEffect, useState } from "react";
import { db } from "@/lib/firestore";
import { ref, onValue, update } from "@/lib/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { belongsToRestaurant } from "@/lib/restaurant-scope";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Eye, Search, Filter } from "lucide-react";
import TableSkeleton from "@/components/TableSkeleton";

const Customers = () => {
  const { restaurantId, canManage } = useAuth();
  const readOnly = !canManage("customers");
  const [customers, setCustomers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const toAmount = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };

  const getOrderTotal = (order: any) => {
    const explicitTotal = toAmount(order?.total);
    if (explicitTotal > 0) return explicitTotal;
    const subtotal = toAmount(order?.subtotal);
    const deliveryFee = toAmount(order?.deliveryFee);
    const serviceFee = toAmount(order?.serviceFee);
    const discount = toAmount(order?.discount);
    if (subtotal > 0) return Math.max(0, subtotal + deliveryFee + serviceFee - discount);
    const itemsTotal = order?.items
      ? Object.values(order.items).reduce<number>((sum, item: any) => {
          const lineTotal = toAmount(item?.total) || toAmount(item?.lineTotal);
          if (lineTotal > 0) return sum + lineTotal;
          return sum + (toAmount(item?.price) * Math.max(1, toAmount(item?.quantity)));
        }, 0)
      : 0;
    return Math.max(0, itemsTotal + deliveryFee + serviceFee - discount);
  };

  useEffect(() => {
    if (!restaurantId) return;
    let loaded = { c: false, o: false };
    const checkDone = () => { if (loaded.c && loaded.o) setLoading(false); };
    const unsub1 = onValue(ref(db, "customers"), (snap) => {
      if (!snap.exists()) { setCustomers([]); } else { setCustomers(Object.entries(snap.val()).map(([id, val]: any) => ({ id, ...val }))); }
      loaded.c = true; checkDone();
    });
    const unsub2 = onValue(ref(db, "orders"), (snap) => {
      if (!snap.exists()) { setOrders([]); }
      else {
        setOrders(
          Object.entries(snap.val())
            .map(([id, val]: any) => ({ id, ...val }))
            .filter((o) => belongsToRestaurant(o, restaurantId)),
        );
      }
      loaded.o = true; checkDone();
    });
    return () => { unsub1(); unsub2(); };
  }, [restaurantId]);

  const getCustomerOrders = (customerId: string) =>
    orders.filter((o) => o.customerId === customerId || o.customer_id === customerId);
  const getCustomerSpent = (customerId: string) => getCustomerOrders(customerId).reduce((sum, o) => sum + getOrderTotal(o), 0);

  const toggleActive = async (customer: any) => {
    await update(ref(db, `customers/${customer.id}`), { active: !(customer.active !== false) });
  };

  const filtered = customers
    .filter(c => statusFilter === "all" || (statusFilter === "active" ? c.active !== false : c.active === false))
    .filter(c => {
      const q = search.toLowerCase();
      return !q || (c.name || "").toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q) || (c.phone || "").includes(q);
    });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Customers</h1>
        <p className="text-sm text-muted-foreground">{customers.length} customers</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search customers..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
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

      {loading ? <TableSkeleton columns={6} /> : (
      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Orders</TableHead>
              <TableHead>Total Spent</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No customers found</TableCell></TableRow>
            ) : filtered.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <div>
                    <p className="font-medium">{c.name || "Unknown"}</p>
                    <p className="text-xs text-muted-foreground">{c.email || "—"}</p>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{c.phone || "—"}</TableCell>
                <TableCell>{getCustomerOrders(c.id).length}</TableCell>
                <TableCell className="font-medium">R{getCustomerSpent(c.id).toFixed(2)}</TableCell>
                <TableCell><Switch checked={c.active !== false} onCheckedChange={() => toggleActive(c)} /></TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => setSelectedCustomer(c)}>
                    <Eye className="h-3 w-3 mr-1" />View
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      )}

      <Dialog open={!!selectedCustomer} onOpenChange={(v) => !v && setSelectedCustomer(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{selectedCustomer?.name || "Customer"}</DialogTitle></DialogHeader>
          {selectedCustomer && (
            <div className="space-y-4 py-2 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-muted-foreground text-xs">Email</p><p className="font-medium">{selectedCustomer.email || "—"}</p></div>
                <div><p className="text-muted-foreground text-xs">Phone</p><p className="font-medium">{selectedCustomer.phone || "—"}</p></div>
                <div><p className="text-muted-foreground text-xs">Total Orders</p><p className="font-medium">{getCustomerOrders(selectedCustomer.id).length}</p></div>
                <div><p className="text-muted-foreground text-xs">Total Spent</p><p className="font-medium">R{getCustomerSpent(selectedCustomer.id).toFixed(2)}</p></div>
                {selectedCustomer.address && (
                  <div className="col-span-2"><p className="text-muted-foreground text-xs">Address</p><p className="font-medium">{typeof selectedCustomer.address === "string" ? selectedCustomer.address : selectedCustomer.address?.label || selectedCustomer.address?.street || "—"}</p></div>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2">Order History</p>
                <div className="space-y-2">
                  {getCustomerOrders(selectedCustomer.id).slice(-10).reverse().map((o: any) => (
                    <div key={o.id} className="py-2 border-b border-border/50">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium">#{o.id.slice(-6)}</p>
                          <p className="text-xs text-muted-foreground capitalize">{(o.status || "pending").replace(/_/g, " ")}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">R{getOrderTotal(o).toFixed(2)}</p>
                          <p className="text-xs text-muted-foreground capitalize">{o.paymentMethod || "—"}</p>
                        </div>
                      </div>
                      <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                        <span>Type: <span className="capitalize">{o.type || "delivery"}</span></span>
                        <span>Payment: <span className={`capitalize ${(o.paymentStatus || "pending") === "approved" ? "text-success" : (o.paymentStatus || "pending") === "rejected" ? "text-destructive" : "text-warning"}`}>{o.paymentStatus || "pending"}</span></span>
                        {o.createdAt && <span>{new Date(o.createdAt).toLocaleDateString()}</span>}
                      </div>
                    </div>
                  ))}
                  {getCustomerOrders(selectedCustomer.id).length === 0 && (
                    <p className="text-muted-foreground text-center py-4">No orders yet</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Customers;
