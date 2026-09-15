import { useEffect, useState } from "react";
import { db } from "@/lib/firestore";
import { ref, onValue, update } from "@/lib/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { belongsToRestaurant } from "@/lib/restaurant-scope";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreditCard, CheckCircle, XCircle, Eye, Image, Search, Filter } from "lucide-react";
import { toast } from "sonner";
import TableSkeleton from "@/components/TableSkeleton";

const Payments = () => {
  const { restaurantId, canManage } = useAuth();
  const readOnly = !canManage("payments");
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
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
    const unsub = onValue(ref(db, "orders"), (snap) => {
      if (!snap.exists()) { setOrders([]); }
      else {
        const all = Object.entries(snap.val())
          .map(([id, val]: any) => ({ id, ...val }))
          .filter((o) => belongsToRestaurant(o, restaurantId))
          .filter((o) => o.paymentProofUrl || o.payment_status || o.paymentStatus || o.payment_method || o.paymentMethod);
        setOrders(all);
      }
      setLoading(false);
    });
    return unsub;
  }, [restaurantId]);

  const updatePayment = async (orderId: string, status: "approved" | "rejected") => {
    if (readOnly) return;
    await update(ref(db, `orders/${orderId}`), { paymentStatus: status, payment_status: status, paymentReviewedAt: Date.now() });
    toast.success(`Payment ${status}`);
    setSelectedOrder(null);
  };

  const filtered = orders
    .filter(o => statusFilter === "all" || (o.paymentStatus || "pending") === statusFilter)
    .filter(o => methodFilter === "all" || (o.paymentMethod || "") === methodFilter)
    .filter(o => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (o.customerName || "").toLowerCase().includes(q) || o.id.includes(q);
    });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Payment Verification</h1>
        <p className="text-sm text-muted-foreground">Review customer payment receipts</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by customer or order ID..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><Filter className="h-3 w-3 mr-1" /><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Select value={methodFilter} onValueChange={setMethodFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Method" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Methods</SelectItem>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="card">Card</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? <TableSkeleton columns={7} /> : (
      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order ID</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Receipt</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No payments to review</TableCell></TableRow>
            ) : filtered.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-mono font-medium">#{o.id.slice(-6)}</TableCell>
                <TableCell className="text-sm">{o.customerName || "Customer"}</TableCell>
                <TableCell className="font-medium">R{getOrderTotal(o).toFixed(2)}</TableCell>
                <TableCell className="capitalize text-sm">{o.paymentMethod || "—"}</TableCell>
                <TableCell>{o.paymentProofUrl ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/10 text-success">Uploaded</span> : <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">None</span>}</TableCell>
                <TableCell>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium capitalize ${
                    (o.paymentStatus || "pending") === "approved" ? "bg-success/10 text-success" :
                    (o.paymentStatus || "pending") === "rejected" ? "bg-destructive/10 text-destructive" :
                    "bg-warning/10 text-warning"
                  }`}>{o.paymentStatus || "pending"}</span>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => setSelectedOrder(o)}><Eye className="h-3 w-3 mr-1" />Review</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      )}

      <Dialog open={!!selectedOrder} onOpenChange={(v) => !v && setSelectedOrder(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Payment Review - #{selectedOrder?.id.slice(-6)}</DialogTitle></DialogHeader>
          {selectedOrder && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-muted-foreground text-xs">Customer</p><p className="font-medium">{selectedOrder.customerName || "N/A"}</p></div>
                <div><p className="text-muted-foreground text-xs">Phone</p><p className="font-medium">{selectedOrder.customerPhone || "N/A"}</p></div>
                <div><p className="text-muted-foreground text-xs">Total</p><p className="font-medium">R{getOrderTotal(selectedOrder).toFixed(2)}</p></div>
                <div><p className="text-muted-foreground text-xs">Method</p><p className="font-medium capitalize">{selectedOrder.paymentMethod || "N/A"}</p></div>
                <div><p className="text-muted-foreground text-xs">Order Status</p><p className="font-medium capitalize">{(selectedOrder.status || "pending").replace(/_/g, " ")}</p></div>
                <div><p className="text-muted-foreground text-xs">Payment Status</p><p className="font-medium capitalize">{selectedOrder.paymentStatus || "pending"}</p></div>
              </div>
              {selectedOrder.paymentProofUrl ? (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Receipt</p>
                  <img src={selectedOrder.paymentProofUrl} alt="Receipt" className="rounded-lg border border-border w-full max-h-80 object-contain" />
                </div>
              ) : (
                <div className="flex items-center justify-center py-8 rounded-lg bg-muted/50">
                  <div className="text-center">
                    <Image className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No receipt uploaded</p>
                  </div>
                </div>
              )}
              {(selectedOrder.paymentStatus || "pending") !== "approved" && (
                <div className="flex gap-3">
                  <Button className="flex-1" onClick={() => updatePayment(selectedOrder.id, "approved")}>
                    <CheckCircle className="h-4 w-4 mr-1" />Approve
                  </Button>
                  <Button variant="outline" className="flex-1 text-destructive" onClick={() => updatePayment(selectedOrder.id, "rejected")}>
                    <XCircle className="h-4 w-4 mr-1" />Reject
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Payments;
