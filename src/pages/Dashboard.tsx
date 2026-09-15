import { useEffect, useState } from "react";
import { db } from "@/lib/firestore";
import { ref, onValue } from "@/lib/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { belongsToRestaurant, isActiveDeliveryStatus, isCompletedOrderStatus, isPendingOrderStatus } from "@/lib/restaurant-scope";
import { ShoppingCart, DollarSign, Truck, CheckCircle, TrendingUp, Clock, AlertCircle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface Stats {
  totalOrders: number;
  todaySales: number;
  activeDeliveries: number;
  completedOrders: number;
  pendingOrders: number;
  preparingOrders: number;
}

const statCards = [
  { key: "totalOrders" as const, label: "Total Orders Today", icon: ShoppingCart, color: "text-primary" },
  { key: "todaySales" as const, label: "Revenue Today", icon: DollarSign, color: "text-success", prefix: "R" },
  { key: "pendingOrders" as const, label: "Pending Orders", icon: AlertCircle, color: "text-warning" },
  { key: "preparingOrders" as const, label: "Preparing", icon: Clock, color: "text-primary" },
  { key: "activeDeliveries" as const, label: "Active Deliveries", icon: Truck, color: "text-warning" },
  { key: "completedOrders" as const, label: "Completed", icon: CheckCircle, color: "text-success" },
];

const Dashboard = () => {
  const { restaurantId } = useAuth();
  const [stats, setStats] = useState<Stats>({ totalOrders: 0, todaySales: 0, activeDeliveries: 0, completedOrders: 0, pendingOrders: 0, preparingOrders: 0 });
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [weeklyData, setWeeklyData] = useState<any[]>([]);

  const toAmount = (value: unknown): number => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };

  const getOrderTotal = (order: any) => {
    const explicitTotal = toAmount(order?.total);
    if (explicitTotal > 0) return explicitTotal;
    const subtotal = toAmount(order?.subtotal);
    const deliveryFee: number = toAmount(order?.deliveryFee);
    const serviceFee: number = toAmount(order?.serviceFee);
    const discount: number = toAmount(order?.discount);
    if (subtotal > 0) return Math.max(0, subtotal + deliveryFee + serviceFee - discount);
    const itemsTotal: number = order?.items
      ? Object.values(order.items as Record<string, any>).reduce<number>((sum, item) => {
          const lineTotal = toAmount(item?.total) || toAmount(item?.lineTotal);
          if (lineTotal > 0) return sum + lineTotal;
          return sum + (toAmount(item?.price) * Math.max(1, toAmount(item?.quantity)));
        }, 0)
      : 0;
    return Math.max(0, itemsTotal + deliveryFee + serviceFee - discount);
  };

  useEffect(() => {
    if (!restaurantId) return;
    const ordersRef = ref(db, "orders");
    const unsub = onValue(ordersRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.val();
      const orders = Object.entries(data)
        .map(([id, val]: any) => ({ id, ...val }))
        .filter((o) => belongsToRestaurant(o, restaurantId));
      const today = new Date().toDateString();

      const todayOrders = orders.filter((o: any) => {
        const ts = o.placed_at ?? o.createdAt;
        const d = ts ? new Date(ts).toDateString() : "";
        return d === today;
      });

      const todaySales = todayOrders.reduce((sum: number, o: any) => sum + getOrderTotal(o), 0);
      const activeDeliveries = orders.filter((o: any) => isActiveDeliveryStatus(o.status)).length;
      const completedOrders = orders.filter((o: any) => isCompletedOrderStatus(o.status)).length;
      const pendingOrders = orders.filter((o: any) => isPendingOrderStatus(o.status)).length;
      const preparingOrders = orders.filter((o: any) => o.status === "preparing").length;

      setStats({ totalOrders: todayOrders.length, todaySales, activeDeliveries, completedOrders, pendingOrders, preparingOrders });
      setRecentOrders(orders.slice(-5).reverse());

      // Top products
      const productCount: Record<string, { name: string; count: number }> = {};
      orders.forEach((o: any) => {
        if (o.items) {
          Object.values(o.items).forEach((item: any) => {
            const name = item.name || "Unknown";
            if (!productCount[name]) productCount[name] = { name, count: 0 };
            productCount[name].count += item.quantity || 1;
          });
        }
      });
      setTopProducts(Object.values(productCount).sort((a, b) => b.count - a.count).slice(0, 5));

      // Weekly chart
      const days: Record<string, number> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        days[d.toLocaleDateString("en", { weekday: "short" })] = 0;
      }
      orders.forEach((o: any) => {
        if (isCompletedOrderStatus(o.status)) {
          const ts = o.delivered_at ?? o.placed_at ?? o.createdAt;
          if (!ts) return;
          const d = new Date(ts);
          const key = d.toLocaleDateString("en", { weekday: "short" });
          if (key in days) days[key] += getOrderTotal(o);
        }
      });
      setWeeklyData(Object.entries(days).map(([name, revenue]) => ({ name, revenue: Math.round(revenue * 100) / 100 })));
    });
    return () => unsub();
  }, [restaurantId]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Welcome back, here's your overview</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {statCards.map(({ key, label, icon: Icon, color, prefix }) => (
          <div key={key} className="stat-card">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <p className="text-xl font-bold">{prefix || ""}{stats[key].toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="glass-card p-6 lg:col-span-2">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Weekly Revenue
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(224, 14%, 18%)" />
              <XAxis dataKey="name" tick={{ fill: "hsl(215, 15%, 50%)", fontSize: 11 }} />
              <YAxis tick={{ fill: "hsl(215, 15%, 50%)", fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(224, 18%, 11%)", border: "1px solid hsl(224, 14%, 18%)", borderRadius: 8, color: "hsl(210, 20%, 92%)" }} />
              <Bar dataKey="revenue" fill="hsl(25, 95%, 53%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top Products */}
        <div className="glass-card p-6">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Top Selling Products
          </h3>
          {topProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data yet</p>
          ) : (
            <div className="space-y-3">
              {topProducts.map((p, i) => (
                <div key={p.name} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">{i + 1}</span>
                    <p className="text-sm font-medium">{p.name}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">{p.count} sold</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Orders */}
      <div className="glass-card p-6">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-primary" />
          Recent Orders
        </h3>
        {recentOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground">No orders yet</p>
        ) : (
          <div className="space-y-3">
            {recentOrders.map((order) => (
              <div key={order.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                <div>
                  <p className="text-sm font-medium">#{order.id.slice(-6)}</p>
                  <p className="text-xs text-muted-foreground">{order.customerName || "Customer"}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">R{getOrderTotal(order).toFixed(2)}</p>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary capitalize">
                    {(order.status || "pending").replace(/_/g, " ")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
