import { useEffect, useState } from "react";
import { db } from "@/lib/firestore";
import { ref, onValue } from "@/lib/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { belongsToRestaurant } from "@/lib/restaurant-scope";
import { reviewOrderPayment } from "@/lib/orders.firebase";
import {
  orderCustomerName,
  orderCustomerPhone,
  orderLineTotal,
  orderNumber,
  orderPaymentMethod,
  orderPaymentProofUrl,
  orderPaymentStatus,
  orderPlacedAt,
  paymentRequiresVerification,
} from "@/lib/order-display";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, XCircle, Eye, Image, Search, Filter, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import TableSkeleton from "@/components/TableSkeleton";

/** Display labels/colors for the canonical `payment_status` field, in this
 * review context. "paid" = the restaurant approved the proof of payment;
 * "failed" = rejected. Kept in sync with order-display.ts's isPaymentVerified(). */
const PAYMENT_REVIEW_LABEL: Record<string, string> = {
  pending: "Pending",
  paid: "Approved",
  failed: "Rejected",
  refunded: "Refunded",
};

const PAYMENT_REVIEW_COLOR: Record<string, string> = {
  pending: "bg-warning/10 text-warning",
  paid: "bg-success/10 text-success",
  failed: "bg-destructive/10 text-destructive",
  refunded: "bg-muted text-muted-foreground",
};

const Payments = () => {
  const { restaurantId, canManage, session } = useAuth();
  const readOnly = !canManage("payments");
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    if (!restaurantId) return;
    const unsub = onValue(ref(db, "orders"), (snap) => {
      if (!snap.exists()) {
        setOrders([]);
      } else {
        setOrders(
          Object.entries(snap.val())
            .map(([id, val]: any) => ({ id, ...val }))
            .filter((o) => belongsToRestaurant(o, restaurantId))
            // Only orders that either need manual payment verification (e.g. EFT) or
            // already have an uploaded receipt for some other reason belong here.
            .filter((o) => paymentRequiresVerification(o) || Boolean(orderPaymentProofUrl(o))),
        );
      }
      setLoading(false);
    });
    return unsub;
  }, [restaurantId]);

  const reviewPayment = async (orderId: string, decision: "paid" | "failed") => {
    if (readOnly) return;
    setReviewing(true);
    try {
      await reviewOrderPayment({ orderId, decision, actor: session?.email ?? null });
      toast.success(`Payment ${decision === "paid" ? "approved" : "rejected"}`);
      setSelectedOrder(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update payment");
    } finally {
      setReviewing(false);
    }
  };

  const filtered = orders
    .filter((o) => statusFilter === "all" || orderPaymentStatus(o) === statusFilter)
    .filter((o) => methodFilter === "all" || orderPaymentMethod(o) === methodFilter)
    .filter((o) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        orderCustomerName(o).toLowerCase().includes(q) ||
        orderNumber(o).toLowerCase().includes(q) ||
        String(o.id).toLowerCase().includes(q)
      );
    });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Payment Verification</h1>
        <p className="text-sm text-muted-foreground">
          Review customer payment receipts. Orders paid by a method that needs proof of payment (e.g.
          EFT) cannot be accepted under Orders until approved here.
        </p>
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
            <SelectItem value="paid">Approved</SelectItem>
            <SelectItem value="failed">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Select value={methodFilter} onValueChange={setMethodFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Method" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Methods</SelectItem>
            <SelectItem value="eft">EFT</SelectItem>
            <SelectItem value="wallet">Wallet</SelectItem>
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
            ) : filtered.map((o) => {
              const status = orderPaymentStatus(o);
              return (
              <TableRow key={o.id}>
                <TableCell className="font-mono font-medium">{orderNumber(o)}</TableCell>
                <TableCell className="text-sm">{orderCustomerName(o)}</TableCell>
                <TableCell className="font-medium">R{orderLineTotal(o).toFixed(2)}</TableCell>
                <TableCell className="capitalize text-sm">{orderPaymentMethod(o)}</TableCell>
                <TableCell>
                  {orderPaymentProofUrl(o) ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/10 text-success">Uploaded</span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">None</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${PAYMENT_REVIEW_COLOR[status] || "bg-warning/10 text-warning"}`}>
                    {PAYMENT_REVIEW_LABEL[status] || status}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => setSelectedOrder(o)}><Eye className="h-3 w-3 mr-1" />Review</Button>
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      )}

      <Dialog open={!!selectedOrder} onOpenChange={(v) => !v && setSelectedOrder(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Payment Review — {selectedOrder ? orderNumber(selectedOrder) : ""}</DialogTitle></DialogHeader>
          {selectedOrder && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-muted-foreground text-xs">Customer</p><p className="font-medium">{orderCustomerName(selectedOrder)}</p></div>
                <div><p className="text-muted-foreground text-xs">Phone</p><p className="font-medium">{orderCustomerPhone(selectedOrder)}</p></div>
                <div><p className="text-muted-foreground text-xs">Total</p><p className="font-medium">R{orderLineTotal(selectedOrder).toFixed(2)}</p></div>
                <div><p className="text-muted-foreground text-xs">Method</p><p className="font-medium capitalize">{orderPaymentMethod(selectedOrder)}</p></div>
                <div><p className="text-muted-foreground text-xs">Placed</p><p className="font-medium">{orderPlacedAt(selectedOrder)?.toLocaleString() ?? "N/A"}</p></div>
                <div>
                  <p className="text-muted-foreground text-xs">Payment Status</p>
                  <p className="font-medium">
                    {PAYMENT_REVIEW_LABEL[orderPaymentStatus(selectedOrder)] || orderPaymentStatus(selectedOrder)}
                  </p>
                </div>
              </div>

              {paymentRequiresVerification(selectedOrder) && (
                <div className="rounded-lg border border-warning/20 bg-warning/5 p-3 text-xs text-warning flex items-start gap-2">
                  <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>This order cannot be accepted under Orders until you approve its payment here.</span>
                </div>
              )}

              {orderPaymentProofUrl(selectedOrder) ? (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Receipt</p>
                  <img src={orderPaymentProofUrl(selectedOrder)} alt="Receipt" className="rounded-lg border border-border w-full max-h-80 object-contain" />
                </div>
              ) : (
                <div className="flex items-center justify-center py-8 rounded-lg bg-muted/50">
                  <div className="text-center">
                    <Image className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No receipt uploaded</p>
                  </div>
                </div>
              )}

              {readOnly ? (
                <p className="text-xs text-muted-foreground text-center">
                  You don't have permission to approve or reject payments.
                </p>
              ) : (
                orderPaymentStatus(selectedOrder) !== "paid" && (
                  <div className="flex gap-3">
                    <Button className="flex-1" disabled={reviewing} onClick={() => void reviewPayment(selectedOrder.id, "paid")}>
                      <CheckCircle className="h-4 w-4 mr-1" />Approve
                    </Button>
                    <Button variant="outline" className="flex-1 text-destructive" disabled={reviewing} onClick={() => void reviewPayment(selectedOrder.id, "failed")}>
                      <XCircle className="h-4 w-4 mr-1" />Reject
                    </Button>
                  </div>
                )
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Payments;
