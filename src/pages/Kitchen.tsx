import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { OrderTypeBadge } from "@/components/OrderTypeBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  advanceOrder,
  getKitchenQueue,
  kitchenOrderHasNotes,
  markCustomerCollected,
  onKitchenChanged,
  type KitchenOrder,
} from "@/lib/kitchen.functions";
import {
  ChefHat,
  CheckCircle2,
  FileText,
  Flame,
  MessageSquare,
  PackageCheck,
  ShoppingBag,
} from "lucide-react";
import { toast } from "sonner";

const COLUMNS: {
  key: string;
  label: string;
  next: string | null;
  icon: typeof Flame;
  hint?: string;
}[] = [
  {
    key: "accepted",
    label: "New (Accepted)",
    next: "preparing",
    icon: ChefHat,
    hint: "Tap Advance to fire the order",
  },
  { key: "preparing", label: "Cooking", next: "ready", icon: Flame, hint: "On the pass" },
  {
    key: "ready",
    label: "Ready for pickup",
    next: null,
    icon: PackageCheck,
    hint: "Delivery orders wait for a driver; pickup orders wait for the customer",
  },
];

const Kitchen = () => {
  const { restaurantId, session, canManage } = useAuth();
  const canKitchenManage = canManage("kitchen");
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [notesOrder, setNotesOrder] = useState<KitchenOrder | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!restaurantId) {
      setOrders([]);
      setLoading(false);
      return;
    }
    setOrders(await getKitchenQueue({ restaurantId }));
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId) return;
    const unsub = onKitchenChanged(() => {
      void refresh();
    });
    return unsub;
  }, [restaurantId, refresh]);

  const handleAdvance = async (orderId: string, nextStatus: string) => {
    setBusyId(orderId);
    try {
      await advanceOrder({
        orderId,
        nextStatus,
        actor: session?.email ?? null,
      });
      toast.success("Order moved");
      await refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to advance order");
    } finally {
      setBusyId(null);
    }
  };

  const handleCollected = async (orderId: string) => {
    setBusyId(orderId);
    try {
      await markCustomerCollected({
        orderId,
        actor: session?.email ?? null,
      });
      toast.success("Customer collected — order completed");
      await refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to mark collected");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <Skeleton className="h-96 w-full" />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Live kitchen queue</h1>
        <p className="text-sm text-muted-foreground">
          Accepted, cooking and ready lanes with realtime updates for your assigned restaurant.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {COLUMNS.map((column) => {
          const lane = orders.filter((order) => order.status === column.key);
          return (
            <Card key={column.key} className="flex flex-col">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <column.icon className="size-4" /> {column.label}
                </CardTitle>
                <CardDescription>{lane.length} orders · {column.hint}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {lane.map((order) => (
                  <OrderTicket
                    key={order.id}
                    order={order}
                    busy={busyId === order.id}
                    onViewNotes={() => setNotesOrder(order)}
                    {...(column.next && canKitchenManage
                      ? { onAdvance: () => void handleAdvance(order.id, column.next!) }
                      : {})}
                    {...(column.key === "ready" && order.order_type === "pickup" && canKitchenManage
                      ? { onCollected: () => void handleCollected(order.id) }
                      : {})}
                  />
                ))}
                {lane.length === 0 && (
                  <p className="py-8 text-center text-xs text-muted-foreground">Lane is clear.</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={Boolean(notesOrder)} onOpenChange={(open) => !open && setNotesOrder(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="size-4 text-amber-400" />
              Order notes — {notesOrder?.order_number}
            </DialogTitle>
            <DialogDescription>Instructions from the customer.</DialogDescription>
          </DialogHeader>
          {notesOrder && <KitchenNotesBody order={notesOrder} />}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setNotesOrder(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

function KitchenNotesBody({ order }: { order: KitchenOrder }) {
  const special = (order.special_instructions ?? "").trim();
  const delivery = (order.delivery_notes ?? "").trim();
  const itemNotes = order.items.filter((it) => (it.notes ?? "").trim().length > 0);
  return (
    <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
      <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
        {order.customer_name}
      </div>
      {(special.length > 0 || itemNotes.length > 0) && (
        <section>
          <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-violet-300">
            <ChefHat className="size-3.5" /> Kitchen instructions
          </h4>
          {special && (
            <div className="rounded-md border border-violet-500/20 bg-violet-500/5 p-3 text-xs">
              <p className="whitespace-pre-wrap text-foreground/90">{special}</p>
            </div>
          )}
          {itemNotes.map((it) => (
            <div
              key={it.id}
              className="mt-1.5 rounded-md border border-violet-500/20 bg-violet-500/5 p-2 text-xs"
            >
              <p className="font-medium text-foreground">
                {it.quantity}× {it.item_name}
              </p>
              <p className="mt-0.5 text-foreground/80">{it.notes}</p>
            </div>
          ))}
        </section>
      )}
      {delivery && (
        <section>
          <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-sky-300">
            <PackageCheck className="size-3.5" /> Handover / delivery notes
          </h4>
          <div className="rounded-md border border-sky-500/20 bg-sky-500/5 p-3 text-xs">
            <p className="whitespace-pre-wrap text-foreground/90">{delivery}</p>
          </div>
        </section>
      )}
    </div>
  );
}

function OrderTicket({
  order,
  busy,
  onAdvance,
  onCollected,
  onViewNotes,
}: {
  order: KitchenOrder;
  busy?: boolean;
  onAdvance?: () => void;
  onCollected?: () => void;
  onViewNotes?: () => void;
}) {
  const waited = Math.max(
    0,
    Math.round((Date.now() - new Date(order.placed_at).getTime()) / 60000),
  );
  const hasNotes = kitchenOrderHasNotes(order);
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{order.order_number}</p>
        <Badge variant={waited > 25 ? "destructive" : "secondary"}>{waited}m</Badge>
      </div>
      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">{order.customer_name}</span>
        <OrderTypeBadge type={order.order_type} />
      </p>
      <ul className="mt-2 space-y-0.5 text-xs">
        {order.items.map((item) => (
          <li key={item.id}>
            {item.quantity}× {item.item_name}
          </li>
        ))}
      </ul>
      {hasNotes && onViewNotes && (
        <button
          type="button"
          onClick={onViewNotes}
          className="mt-2 flex w-full items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-left text-[11px] text-amber-200 transition hover:bg-amber-500/15"
        >
          <MessageSquare className="size-3.5 shrink-0" />
          <span className="truncate">View customer notes</span>
        </button>
      )}
      <div className="mt-3 flex gap-2">
        {onAdvance && (
          <Button size="sm" className="flex-1" onClick={onAdvance} disabled={busy}>
            <CheckCircle2 className="mr-1 size-3.5" /> Advance
          </Button>
        )}
        {onCollected && (
          <Button size="sm" className="flex-1" onClick={onCollected} disabled={busy}>
            <ShoppingBag className="mr-1 size-3.5" /> Customer collected
          </Button>
        )}
        {hasNotes && onViewNotes && (
          <Button size="sm" variant="outline" onClick={onViewNotes} title="View notes">
            <FileText className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

export default Kitchen;
