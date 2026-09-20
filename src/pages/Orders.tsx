import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firestore";
import { ref, onValue } from "@/lib/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { belongsToRestaurant } from "@/lib/restaurant-scope";
import {
  setFirebaseOrderStatus,
  rejectFirebaseOrder,
  assignOrderDriver,
  isAssignableToDriver,
  orderType,
  orderStage,
  canonicalOrderStatus,
  isDeliveryOrder,
  isPickupOrder,
  completePickupCollection,
  ORDER_STAGE_LABEL,
  ORDER_STAGE_COLOR,
} from "@/lib/orders.firebase";
import {
  eligibleDriversForOrder,
  type DriverAssignmentRecord,
  type DriverProfileRecord,
  type EligibleDriver,
} from "@/lib/drivers.firebase";
import {
  formatDeliveryAddress,
  normalizeOrderItems,
  orderCardBrand,
  orderCardLast4,
  orderCustomerEmail,
  orderCustomerName,
  orderCustomerPhone,
  orderDeliveryAddress,
  orderDriverName,
  orderDriverPhone,
  orderEtaAt,
  orderFee,
  orderLineTotal,
  orderNumber,
  orderPaymentMethod,
  orderPaymentProofUrl,
  orderPaymentReference,
  orderPaymentStatus,
  orderPlacedAt,
  orderReceiptNumber,
  orderSpecialInstructions,
  paymentRequiresVerification,
  isPaymentVerified,
  type DisplayOrderLine,
} from "@/lib/order-display";
import { Link } from "react-router-dom";
import { MenuCatalog } from "@/lib/menu-catalog";
import { OrderDetailLine } from "@/components/OrderDetailLine";
import { OrderTypeBadge } from "@/components/OrderTypeBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Eye, Search, Filter, MapPin, CreditCard, Banknote, Receipt, Truck, Clock, User, Phone, FileText, UtensilsCrossed, ShoppingBag, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import TableSkeleton from "@/components/TableSkeleton";

const ORDER_STATUSES = [
  "pending", "accepted", "preparing", "ready",
  "assigned", "picked_up", "on_the_way", "delivered", "rejected", "cancelled", "refunded",
];

const Orders = () => {
  const { restaurantId, canManage, can, session } = useAuth();
  const readOnly = !canManage("orders");
  const canKitchenManage = canManage("kitchen");
  // Independent of rm.orders.manage — a restaurant may grant one without the other.
  const canAssignDriver = can("rm.orders.assign");
  const canViewPayments = can("rm.payments.view");
  const [orders, setOrders] = useState<any[]>([]);
  const [driverAssignments, setDriverAssignments] = useState<Record<string, DriverAssignmentRecord>>({});
  const [driverProfiles, setDriverProfiles] = useState<Record<string, DriverProfileRecord>>({});
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailItems, setDetailItems] = useState<DisplayOrderLine[]>([]);
  const [detailItemsLoading, setDetailItemsLoading] = useState(false);
  const [menuItems, setMenuItems] = useState<Record<string, Record<string, unknown>>>({});
  const [menuVariants, setMenuVariants] = useState<Record<string, Record<string, unknown>>>({});
  const [menuAddons, setMenuAddons] = useState<Record<string, Record<string, unknown>>>({});
  const [menuModifiers, setMenuModifiers] = useState<Record<string, Record<string, unknown>>>({});

  const menuCatalog = useMemo(
    () =>
      MenuCatalog.fromRtdb({
        items: menuItems,
        variants: menuVariants,
        addons: menuAddons,
        modifiers: menuModifiers,
      }),
    [menuItems, menuVariants, menuAddons, menuModifiers],
  );

  useEffect(() => {
    if (!restaurantId) return;
    const unsub = onValue(ref(db, "orders"), (snap) => {
      if (!snap.exists()) {
        setOrders([]);
      } else {
        setOrders(
          Object.entries(snap.val())
            .map(([id, val]: any) => ({ id, ...val, status: canonicalOrderStatus(val.status) }))
            .filter((o) => belongsToRestaurant(o, restaurantId)),
        );
      }
      setLoading(false);
    });
    return unsub;
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId || !canAssignDriver) {
      setDriverAssignments({});
      setDriverProfiles({});
      return;
    }
    const unsub1 = onValue(ref(db, "driverAssignments"), (snap) => {
      setDriverAssignments(snap.exists() ? snap.val() : {});
    });
    const unsub2 = onValue(ref(db, "drivers"), (snap) => {
      setDriverProfiles(snap.exists() ? snap.val() : {});
    });
    return () => { unsub1(); unsub2(); };
  }, [restaurantId, canAssignDriver]);

  useEffect(() => {
    if (!restaurantId) return;
    const base = `menus/${restaurantId}`;
    const unsubItems = onValue(ref(db, `${base}/items`), (snap) => {
      setMenuItems(snap.exists() ? snap.val() : {});
    });
    const unsubVariants = onValue(ref(db, `${base}/variants`), (snap) => {
      setMenuVariants(snap.exists() ? snap.val() : {});
    });
    const unsubAddons = onValue(ref(db, `${base}/addons`), (snap) => {
      setMenuAddons(snap.exists() ? snap.val() : {});
    });
    const unsubModifiers = onValue(ref(db, `${base}/modifiers`), (snap) => {
      setMenuModifiers(snap.exists() ? snap.val() : {});
    });
    return () => {
      unsubItems();
      unsubVariants();
      unsubAddons();
      unsubModifiers();
    };
  }, [restaurantId]);

  useEffect(() => {
    if (!selectedOrder?.id) {
      setDetailItems([]);
      return;
    }
    setDetailItemsLoading(true);
    const itemsRef = ref(db, `orders/${selectedOrder.id}/items`);
    const unsub = onValue(itemsRef, (snap) => {
      const raw = snap.exists() ? snap.val() : selectedOrder.items;
      setDetailItems(normalizeOrderItems(raw, menuCatalog));
      setDetailItemsLoading(false);
    });
    return () => unsub();
  }, [selectedOrder?.id, selectedOrder?.items, menuCatalog]);

  const [rejectOrderId, setRejectOrderId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const acceptOrder = async (order: any) => {
    if (readOnly) return;
    if (paymentRequiresVerification(order) && !isPaymentVerified(order)) {
      toast.error("Verify the proof of payment in Payments before accepting this order");
      return;
    }
    setBusyId(order.id);
    try {
      await setFirebaseOrderStatus({
        orderId: order.id,
        status: "accepted",
        actor: session?.email ?? null,
      });
      toast.success("Order accepted — now visible in Kitchen");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to accept order");
    } finally {
      setBusyId(null);
    }
  };

  const openReject = (orderId: string) => {
    if (readOnly) return;
    setRejectOrderId(orderId);
    setRejectReason("");
  };

  const submitReject = async () => {
    if (!rejectOrderId || !rejectReason.trim()) return;
    setRejecting(true);
    try {
      await rejectFirebaseOrder({
        orderId: rejectOrderId,
        reason: rejectReason.trim(),
        actor: session?.email ?? null,
      });
      toast.success("Order rejected");
      setRejectOrderId(null);
      setRejectReason("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to reject order");
    } finally {
      setRejecting(false);
    }
  };

  const advanceKitchen = async (orderId: string, nextStatus: "preparing" | "ready", currentEtaMinutes: number | null) => {
    if (!canKitchenManage) return;
    setBusyId(orderId);
    try {
      await setFirebaseOrderStatus({
        orderId,
        status: nextStatus,
        etaMinutes: nextStatus === "ready" ? Math.max(5, currentEtaMinutes ?? 15) : null,
        actor: session?.email ?? null,
      });
      toast.success(`Order marked ${nextStatus.replace(/_/g, " ")}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to advance order");
    } finally {
      setBusyId(null);
    }
  };

  const assignDriver = async (orderId: string, driverId: string, eligibleDrivers: EligibleDriver[]) => {
    if (!canAssignDriver) return;
    const driver = eligibleDrivers.find((d) => d.id === driverId);
    if (!driver) {
      toast.error("Driver not found or no longer eligible for this restaurant/branch");
      return;
    }
    setBusyId(orderId);
    try {
      await assignOrderDriver({
        orderId,
        driverId: driver.id,
        driverName: driver.name,
        driverPhone: driver.phone || null,
        driverPhoto: driver.photo,
        driverRating: driver.rating,
        actor: session?.email ?? null,
      });
      toast.success(`Driver assigned: ${driver.name}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to assign driver");
    } finally {
      setBusyId(null);
    }
  };

  /** Fallback for when the order is stuck waiting on the driver app's own PIN-verified
   * pickup write — only ever valid at stage "at_restaurant" (see handover doc §5.4). */
  const markPickedUpFallback = async (orderId: string) => {
    if (readOnly) return;
    setBusyId(orderId);
    try {
      await setFirebaseOrderStatus({ orderId, status: "picked_up", actor: session?.email ?? null });
      toast.success("Order marked picked up");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to mark order picked up");
    } finally {
      setBusyId(null);
    }
  };

  const collectPickupOrder = async (orderId: string) => {
    if (readOnly) return;
    setBusyId(orderId);
    try {
      await completePickupCollection({
        orderId,
        actor: session?.email ?? null,
      });
      toast.success("Customer collected — order completed");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to complete pickup");
    } finally {
      setBusyId(null);
    }
  };

  const getAddress = (addr: unknown) => formatDeliveryAddress(addr as Record<string, unknown> | string | null);

  const filtered = orders
    .filter(o => typeFilter === "all" || orderType(o) === typeFilter)
    .filter(o => statusFilter === "all" || o.status === statusFilter)
    .filter(o => paymentFilter === "all" || orderPaymentMethod(o) === paymentFilter)
    .filter(o => {
      if (!dateFilter) return true;
      const placed = orderPlacedAt(o);
      const orderDate = placed ? placed.toISOString().split("T")[0] : "";
      return orderDate === dateFilter;
    })
    .filter(o => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        orderCustomerName(o).toLowerCase().includes(q) ||
        orderNumber(o).toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q)
      );
    });

  const selectedAddress = selectedOrder ? orderDeliveryAddress(selectedOrder) : null;
  const selectedInstructions = selectedOrder ? orderSpecialInstructions(selectedOrder) : "";
  const selectedPlacedAt = selectedOrder ? orderPlacedAt(selectedOrder) : null;
  const selectedEta = selectedOrder ? orderEtaAt(selectedOrder) : null;
  const selectedEligibleDrivers =
    selectedOrder && canAssignDriver && isAssignableToDriver(selectedOrder)
      ? eligibleDriversForOrder(driverAssignments, driverProfiles, restaurantId ?? "", selectedOrder.branch_id ?? null)
      : [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Orders</h1>
        <p className="text-sm text-muted-foreground">{orders.length} total orders</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name or ID..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <Filter className="h-3 w-3 mr-1" /><SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {ORDER_STATUSES.map(s => (
              <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="delivery">Delivery</SelectItem>
            <SelectItem value="pickup">Pickup</SelectItem>
          </SelectContent>
        </Select>
        <Select value={paymentFilter} onValueChange={setPaymentFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Payment" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Payments</SelectItem>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="card">Card</SelectItem>
            <SelectItem value="eft">EFT</SelectItem>
            <SelectItem value="wallet">Wallet</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" className="w-40" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
      </div>

      {loading ? <TableSkeleton columns={7} /> : (
      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order ID</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No orders found</TableCell></TableRow>
            ) : filtered.map((o) => {
              const stage = orderStage(o);
              const busy = busyId === o.id;
              const paymentBlocked = paymentRequiresVerification(o) && !isPaymentVerified(o);
              const eligibleDrivers =
                canAssignDriver && (stage === "unassigned" || stage === "waiting_accept")
                  ? eligibleDriversForOrder(driverAssignments, driverProfiles, restaurantId ?? "", o.branch_id ?? null)
                  : [];
              return (
              <TableRow key={o.id}>
                <TableCell className="font-mono font-medium">{orderNumber(o)}</TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium text-sm">{orderCustomerName(o)}</p>
                    <p className="text-xs text-muted-foreground">{orderCustomerPhone(o)}</p>
                  </div>
                </TableCell>
                <TableCell><OrderTypeBadge type={orderType(o)} /></TableCell>
                <TableCell className="font-medium">R{orderLineTotal(o).toFixed(2)}</TableCell>
                <TableCell className="capitalize">{orderPaymentMethod(o)}</TableCell>
                <TableCell>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${ORDER_STAGE_COLOR[stage] || "bg-muted text-muted-foreground"}`}>
                    {ORDER_STAGE_LABEL[stage] || stage}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1 flex-wrap">
                    <Button variant="ghost" size="sm" onClick={() => setSelectedOrder(o)}>
                      <Eye className="h-3 w-3 mr-1" />View
                    </Button>
                    {stage === "pending" && !readOnly && paymentBlocked && (
                      <>
                        {canViewPayments ? (
                          <Button size="sm" variant="outline" className="text-warning" asChild>
                            <Link to="/payments">
                              <ShieldAlert className="h-3 w-3 mr-1" />Verify payment
                            </Link>
                          </Button>
                        ) : (
                          <span className="text-[10px] text-warning px-2 py-1 rounded-md bg-warning/10 flex items-center gap-1">
                            <ShieldAlert className="h-3 w-3" />Awaiting payment verification
                          </span>
                        )}
                        <Button size="sm" variant="outline" className="text-destructive" disabled={busy} onClick={() => openReject(o.id)}>Reject</Button>
                      </>
                    )}
                    {stage === "pending" && !readOnly && !paymentBlocked && (
                      <>
                        <Button size="sm" variant="default" disabled={busy} onClick={() => acceptOrder(o)}>Accept</Button>
                        <Button size="sm" variant="outline" className="text-destructive" disabled={busy} onClick={() => openReject(o.id)}>Reject</Button>
                      </>
                    )}
                    {stage === "accepted" && canKitchenManage && (
                      <Button size="sm" disabled={busy} onClick={() => advanceKitchen(o.id, "preparing", o.eta_minutes ?? null)}>Prepare</Button>
                    )}
                    {stage === "preparing" && canKitchenManage && (
                      <Button size="sm" disabled={busy} onClick={() => advanceKitchen(o.id, "ready", o.eta_minutes ?? null)}>Ready</Button>
                    )}
                    {stage === "ready" && isPickupOrder(o) && !readOnly && (
                      <Button size="sm" variant="default" disabled={busy} onClick={() => collectPickupOrder(o.id)}>
                        <ShoppingBag className="h-3 w-3 mr-1" />
                        Customer collected
                      </Button>
                    )}
                    {(stage === "unassigned" || stage === "waiting_accept") && canAssignDriver && (
                      eligibleDrivers.length > 0 ? (
                        <Select disabled={busy} onValueChange={(v) => assignDriver(o.id, v, eligibleDrivers)}>
                          <SelectTrigger className="w-36 h-8 text-xs">
                            <SelectValue placeholder={stage === "waiting_accept" ? "Reassign driver" : "Assign driver"} />
                          </SelectTrigger>
                          <SelectContent>
                            {eligibleDrivers.map((d) => (
                              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-[10px] text-muted-foreground px-2">No eligible drivers for this branch</span>
                      )
                    )}
                    {(stage === "unassigned" || stage === "waiting_accept") && !canAssignDriver && (
                      <span className="text-[10px] text-muted-foreground px-2">
                        {ORDER_STAGE_LABEL[stage]}
                      </span>
                    )}
                    {stage === "heading_to_restaurant" && (
                      <span className="text-[10px] text-muted-foreground px-2">
                        {ORDER_STAGE_LABEL[stage]}
                      </span>
                    )}
                    {stage === "at_restaurant" && !readOnly && (
                      <Button size="sm" variant="secondary" disabled={busy} onClick={() => markPickedUpFallback(o.id)}>
                        Mark picked up
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      )}

      {/* Order Detail Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={(v) => !v && setSelectedOrder(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <span>{selectedOrder ? orderNumber(selectedOrder) : "Order"}</span>
              {selectedOrder && (
                <>
                  <Badge variant="outline" className={ORDER_STAGE_COLOR[orderStage(selectedOrder)] || "bg-muted text-muted-foreground"}>
                    {ORDER_STAGE_LABEL[orderStage(selectedOrder)] || selectedOrder.status}
                  </Badge>
                  <OrderTypeBadge type={orderType(selectedOrder)} />
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <Tabs defaultValue="details" className="w-full">
              <TabsList className="w-full grid grid-cols-4">
                <TabsTrigger value="details" className="text-xs gap-1"><FileText className="h-3 w-3" />Details</TabsTrigger>
                <TabsTrigger value="items" className="text-xs gap-1"><UtensilsCrossed className="h-3 w-3" />Items</TabsTrigger>
                <TabsTrigger value="payment" className="text-xs gap-1"><CreditCard className="h-3 w-3" />Payment</TabsTrigger>
                <TabsTrigger value="delivery" className="text-xs gap-1"><Truck className="h-3 w-3" />Delivery</TabsTrigger>
              </TabsList>

              {/* ORDER DETAILS TAB */}
              <TabsContent value="details" className="space-y-4 text-sm mt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/20 p-3">
                    <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-muted-foreground text-xs">Customer</p>
                      <p className="font-medium">{orderCustomerName(selectedOrder)}</p>
                      {orderCustomerEmail(selectedOrder) && (
                        <p className="text-xs text-muted-foreground mt-0.5">{orderCustomerEmail(selectedOrder)}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/20 p-3">
                    <Phone className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-muted-foreground text-xs">Phone</p>
                      <p className="font-medium">{orderCustomerPhone(selectedOrder)}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/20 p-3">
                    <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-muted-foreground text-xs">Placed</p>
                      <p className="font-medium">
                        {selectedPlacedAt ? selectedPlacedAt.toLocaleString() : "N/A"}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                    <p className="text-muted-foreground text-xs">Order ref</p>
                    <p className="font-mono text-xs font-medium mt-0.5">{selectedOrder.id}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                    <p className="text-muted-foreground text-xs">Restaurant</p>
                    <p className="font-medium">{selectedOrder.restaurant_name || selectedOrder.restaurantName || "—"}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                    <p className="text-muted-foreground text-xs">Total</p>
                    <p className="font-bold text-lg">R{orderLineTotal(selectedOrder).toFixed(2)}</p>
                  </div>
                </div>
                {selectedAddress && isDeliveryOrder(selectedOrder) && (
                  <div className="rounded-xl border border-border bg-muted/30 p-4">
                    <p className="text-muted-foreground text-xs mb-1.5">Delivery address</p>
                    <p className="font-medium flex items-start gap-2">
                      <MapPin className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <span>{getAddress(selectedAddress)}</span>
                    </p>
                  </div>
                )}
                {selectedInstructions && (
                  <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4">
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1">Special instructions</p>
                    <p className="text-sm leading-relaxed">{selectedInstructions}</p>
                  </div>
                )}
                {selectedOrder.status === "rejected" && selectedOrder.rejection_reason && (
                  <div className="rounded-xl border border-destructive/25 bg-destructive/10 p-4">
                    <p className="text-xs font-medium text-destructive mb-1">Rejection reason</p>
                    <p className="text-sm leading-relaxed">{selectedOrder.rejection_reason}</p>
                  </div>
                )}
                {selectedOrder.status === "pending" &&
                  paymentRequiresVerification(selectedOrder) &&
                  !isPaymentVerified(selectedOrder) && (
                    <div className="rounded-xl border border-warning/25 bg-warning/10 p-4">
                      <p className="text-xs font-medium text-warning mb-1 flex items-center gap-1.5">
                        <ShieldAlert className="h-3.5 w-3.5" /> Payment not yet verified
                      </p>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        This order was paid by {orderPaymentMethod(selectedOrder)}, which requires proof of
                        payment review. It cannot be accepted until approved in{" "}
                        {canViewPayments ? (
                          <Link to="/payments" className="text-primary underline">Payments</Link>
                        ) : (
                          "Payments"
                        )}
                        .
                      </p>
                    </div>
                  )}
              </TabsContent>

              {/* ITEMS TAB */}
              <TabsContent value="items" className="space-y-3 text-sm mt-4">
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                  <p className="text-sm font-semibold text-primary">Order items</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {orderNumber(selectedOrder)} · {orderCustomerName(selectedOrder)}
                    {detailItems.length > 0 && ` · ${detailItems.length} line${detailItems.length === 1 ? "" : "s"}`}
                  </p>
                </div>
                {detailItemsLoading ? (
                  <p className="text-center py-8 text-muted-foreground text-sm">Loading items…</p>
                ) : detailItems.length > 0 ? (
                  detailItems.map((line) => <OrderDetailLine key={line.id} line={line} />)
                ) : (
                  <p className="text-muted-foreground text-center py-8">No items in this order</p>
                )}
                <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-2">
                  {selectedOrder.subtotal != null && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="tabular-nums">R{Number(selectedOrder.subtotal || 0).toFixed(2)}</span>
                    </div>
                  )}
                  {orderFee(selectedOrder, "delivery") > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Delivery fee</span>
                      <span className="tabular-nums">R{orderFee(selectedOrder, "delivery").toFixed(2)}</span>
                    </div>
                  )}
                  {orderFee(selectedOrder, "service") > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Service fee</span>
                      <span className="tabular-nums">R{orderFee(selectedOrder, "service").toFixed(2)}</span>
                    </div>
                  )}
                  {orderFee(selectedOrder, "tax") > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tax</span>
                      <span className="tabular-nums">R{orderFee(selectedOrder, "tax").toFixed(2)}</span>
                    </div>
                  )}
                  {orderFee(selectedOrder, "tip") > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tip</span>
                      <span className="tabular-nums">R{orderFee(selectedOrder, "tip").toFixed(2)}</span>
                    </div>
                  )}
                  {orderFee(selectedOrder, "discount") > 0 && (
                    <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-400">
                      <span>Discount</span>
                      <span className="tabular-nums">-R{orderFee(selectedOrder, "discount").toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-base pt-2 border-t border-border">
                    <span>Total</span>
                    <span className="tabular-nums">R{orderLineTotal(selectedOrder).toFixed(2)}</span>
                  </div>
                </div>
              </TabsContent>

              {/* PAYMENT TAB */}
              <TabsContent value="payment" className="space-y-4 text-sm mt-4">
                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center gap-3 mb-4">
                    {orderPaymentMethod(selectedOrder) === "cash" && <Banknote className="h-8 w-8 text-success" />}
                    {orderPaymentMethod(selectedOrder) === "card" && <CreditCard className="h-8 w-8 text-primary" />}
                    {!["cash", "card"].includes(orderPaymentMethod(selectedOrder)) && (
                      <Receipt className="h-8 w-8 text-muted-foreground" />
                    )}
                    <div>
                      <p className="font-semibold text-lg capitalize">{orderPaymentMethod(selectedOrder)}</p>
                      <p className="text-xs text-muted-foreground">Payment method</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-muted/40 p-3">
                      <p className="text-xs text-muted-foreground">Status</p>
                      <Badge variant="outline" className={`mt-1 capitalize ${
                        orderPaymentStatus(selectedOrder) === "paid" ? "bg-success/10 text-success border-success/30" :
                        orderPaymentStatus(selectedOrder) === "failed" ? "bg-destructive/10 text-destructive border-destructive/30" :
                        "bg-warning/10 text-warning border-warning/30"
                      }`}>
                        {orderPaymentStatus(selectedOrder)}
                      </Badge>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-3">
                      <p className="text-xs text-muted-foreground">Amount</p>
                      <p className="font-bold text-lg mt-1 tabular-nums">R{orderLineTotal(selectedOrder).toFixed(2)}</p>
                    </div>
                  </div>

                  {orderReceiptNumber(selectedOrder) && (
                    <div className="mt-3 rounded-lg bg-muted/30 px-3 py-2 text-xs">
                      <span className="text-muted-foreground">Receipt:</span>{" "}
                      <span className="font-mono font-medium">{orderReceiptNumber(selectedOrder)}</span>
                    </div>
                  )}

                  {orderPaymentMethod(selectedOrder) === "cash" && (
                    <div className="mt-4 rounded-lg border border-success/20 bg-success/5 p-3">
                      <p className="text-xs font-medium text-success flex items-center gap-1">
                        <Banknote className="h-3 w-3" /> Cash payment
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {isDeliveryOrder(selectedOrder)
                          ? "To be collected on delivery."
                          : "Collected at pickup."}
                      </p>
                    </div>
                  )}

                  {orderPaymentMethod(selectedOrder) === "card" && (
                    <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-1">
                      <p className="text-xs font-medium text-primary flex items-center gap-1">
                        <CreditCard className="h-3 w-3" /> Card payment
                      </p>
                      {orderCardBrand(selectedOrder) && (
                        <p className="text-xs"><span className="text-muted-foreground">Brand:</span> {orderCardBrand(selectedOrder)}</p>
                      )}
                      {orderCardLast4(selectedOrder) && (
                        <p className="text-xs"><span className="text-muted-foreground">Card:</span> •••• {orderCardLast4(selectedOrder)}</p>
                      )}
                      {orderPaymentReference(selectedOrder) && (
                        <p className="text-xs">
                          <span className="text-muted-foreground">Reference:</span>{" "}
                          <span className="font-mono">{orderPaymentReference(selectedOrder)}</span>
                        </p>
                      )}
                    </div>
                  )}

                  {paymentRequiresVerification(selectedOrder) && (
                    <div className="mt-4 rounded-lg border border-warning/20 bg-warning/5 p-3 space-y-1">
                      <p className="text-xs font-medium text-warning flex items-center gap-1">
                        <ShieldAlert className="h-3 w-3" /> Requires proof of payment review
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Verification status:{" "}
                        <span className="font-medium capitalize">
                          {isPaymentVerified(selectedOrder) ? "Approved" : orderPaymentStatus(selectedOrder)}
                        </span>
                      </p>
                    </div>
                  )}

                  {orderPaymentProofUrl(selectedOrder) && (
                    <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
                      <p className="text-xs font-medium flex items-center gap-1 mb-2">
                        <Receipt className="h-3 w-3" /> Proof of payment
                      </p>
                      <img
                        src={orderPaymentProofUrl(selectedOrder)}
                        alt="Payment receipt"
                        className="rounded-lg border border-border max-h-60 w-full object-contain bg-background"
                      />
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* DELIVERY TAB */}
              <TabsContent value="delivery" className="space-y-4 text-sm mt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border bg-card p-3">
                    <p className="text-xs text-muted-foreground">Fulfillment</p>
                    <div className="mt-1"><OrderTypeBadge type={orderType(selectedOrder)} /></div>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3">
                    <p className="text-xs text-muted-foreground">Delivery fee</p>
                    <p className="font-semibold mt-1 tabular-nums">R{orderFee(selectedOrder, "delivery").toFixed(2)}</p>
                  </div>
                </div>
                {selectedAddress && isDeliveryOrder(selectedOrder) && (
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs text-muted-foreground mb-1.5">Delivery address</p>
                    <p className="font-medium flex items-start gap-2">
                      <MapPin className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <span>{getAddress(selectedAddress)}</span>
                    </p>
                  </div>
                )}
                {orderDriverName(selectedOrder) ? (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                    <p className="text-xs text-muted-foreground mb-1">Assigned driver</p>
                    <p className="font-semibold flex items-center gap-2">
                      <User className="h-4 w-4 text-primary" />
                      {orderDriverName(selectedOrder)}
                    </p>
                    {orderDriverPhone(selectedOrder) && (
                      <p className="text-xs text-muted-foreground ml-6 mt-1">{orderDriverPhone(selectedOrder)}</p>
                    )}
                    <p className="text-xs text-muted-foreground ml-6 mt-1">
                      {ORDER_STAGE_LABEL[orderStage(selectedOrder)]}
                    </p>
                  </div>
                ) : (
                  isDeliveryOrder(selectedOrder) && (
                    <div className="rounded-xl border border-warning/20 bg-warning/5 p-4 text-center">
                      <p className="text-xs text-warning font-medium">No driver assigned yet</p>
                    </div>
                  )
                )}
                {canAssignDriver && isAssignableToDriver(selectedOrder) && (
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs text-muted-foreground mb-2">
                      {orderDriverName(selectedOrder) ? "Reassign driver" : "Assign a driver"}
                    </p>
                    {selectedEligibleDrivers.length > 0 ? (
                      <Select
                        disabled={busyId === selectedOrder.id}
                        onValueChange={(v) => assignDriver(selectedOrder.id, v, selectedEligibleDrivers)}
                      >
                        <SelectTrigger className="w-full h-9 text-xs">
                          <SelectValue placeholder="Choose a driver" />
                        </SelectTrigger>
                        <SelectContent>
                          {selectedEligibleDrivers.map((d) => (
                            <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-xs text-muted-foreground">No eligible drivers for this restaurant/branch yet</p>
                    )}
                  </div>
                )}
                {selectedEta && (
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs text-muted-foreground">Estimated arrival</p>
                    <p className="font-medium flex items-center gap-1 mt-1">
                      <Clock className="h-3 w-3" />
                      {selectedEta.toLocaleString()}
                    </p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Order Dialog */}
      <Dialog open={!!rejectOrderId} onOpenChange={(v) => !v && setRejectOrderId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject order</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The customer will see this reason. Rejection cannot be undone.
          </p>
          <Textarea
            placeholder="e.g. Out of stock, kitchen closed early..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOrderId(null)} disabled={rejecting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={submitReject}
              disabled={rejecting || !rejectReason.trim()}
            >
              Reject order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Orders;
