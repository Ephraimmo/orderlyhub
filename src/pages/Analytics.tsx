import { useEffect, useState } from "react";
import { db } from "@/lib/firestore";
import { ref, onValue } from "@/lib/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { belongsToRestaurant, isCompletedOrderStatus } from "@/lib/restaurant-scope";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { TrendingUp, DollarSign, ShoppingCart, Truck } from "lucide-react";

const CHART_COLORS = [
  "hsl(25, 95%, 53%)", "hsl(142, 71%, 45%)", "hsl(38, 92%, 50%)",
  "hsl(0, 72%, 51%)", "hsl(215, 70%, 55%)", "hsl(280, 65%, 55%)"
];

const Analytics = () => {
  const { restaurantId } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);

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
    const unsub1 = onValue(ref(db, "orders"), (snap) => {
      if (!snap.exists()) { setOrders([]); return; }
      setOrders(
        Object.entries(snap.val())
          .map(([id, val]: any) => ({ id, ...val }))
          .filter((o) => belongsToRestaurant(o, restaurantId)),
      );
    });
    const unsub2 = onValue(ref(db, "driverAssignments"), (snap) => {
      if (!snap.exists()) { setDrivers([]); return; }
      setDrivers(
        Object.values(snap.val() as Record<string, any>).filter((a) => a.restaurant_id === restaurantId),
      );
    });
    return () => { unsub1(); unsub2(); };
  }, [restaurantId]);

  // Daily revenue for last 7 days
  const getDailyRevenue = () => {
    const days: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days[d.toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })] = 0;
    }
    orders.forEach(o => {
      if (isCompletedOrderStatus(o.status)) {
        const ts = o.delivered_at ?? o.placed_at ?? o.createdAt;
        if (!ts) return;
        const d = new Date(ts);
        const key = d.toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" });
        if (key in days) days[key] += getOrderTotal(o);
      }
    });
    return Object.entries(days).map(([name, revenue]) => ({ name, revenue: Math.round(revenue * 100) / 100 }));
  };

  // Monthly revenue for last 6 months
  const getMonthlyRevenue = () => {
    const months: Record<string, number> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      months[d.toLocaleDateString("en", { month: "short", year: "2-digit" })] = 0;
    }
    orders.forEach(o => {
      if (isCompletedOrderStatus(o.status)) {
        const ts = o.delivered_at ?? o.placed_at ?? o.createdAt;
        if (!ts) return;
        const d = new Date(ts);
        const key = d.toLocaleDateString("en", { month: "short", year: "2-digit" });
        if (key in months) months[key] += getOrderTotal(o);
      }
    });
    return Object.entries(months).map(([name, revenue]) => ({ name, revenue: Math.round(revenue * 100) / 100 }));
  };

  // Top products
  const getTopProducts = () => {
    const counts: Record<string, { name: string; count: number; revenue: number }> = {};
    orders.forEach(o => {
      if (o.items) {
        Object.values(o.items).forEach((item: any) => {
          const name = item.name || "Unknown";
          if (!counts[name]) counts[name] = { name, count: 0, revenue: 0 };
          counts[name].count += item.quantity || 1;
          counts[name].revenue += (item.price || 0) * (item.quantity || 1);
        });
      }
    });
    return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 6);
  };

  // Driver performance
  const getDriverPerformance = () => {
    return drivers.map(d => {
      const driverOrders = orders.filter(o => o.driverId === d.id);
      const completed = driverOrders.filter(o => isCompletedOrderStatus(o.status)).length;
      return { name: d.name || "Unknown", deliveries: completed };
    }).filter(d => d.deliveries > 0).sort((a, b) => b.deliveries - a.deliveries).slice(0, 8);
  };

  // Order type distribution
  const getOrderTypes = () => {
    const types: Record<string, number> = { delivery: 0, pickup: 0, table: 0 };
    orders.forEach(o => { types[o.type || "delivery"] = (types[o.type || "delivery"] || 0) + 1; });
    return Object.entries(types).filter(([, v]) => v > 0).map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }));
  };

  const totalRevenue = orders.filter(o => isCompletedOrderStatus(o.status)).reduce((s, o) => s + getOrderTotal(o), 0);
  const totalCompleted = orders.filter(o => isCompletedOrderStatus(o.status)).length;
  const avgOrderValue = totalCompleted > 0 ? totalRevenue / totalCompleted : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-sm text-muted-foreground">Business performance insights</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Revenue", value: `R${totalRevenue.toFixed(2)}`, icon: DollarSign, color: "text-success" },
          { label: "Total Orders", value: orders.length, icon: ShoppingCart, color: "text-primary" },
          { label: "Completed", value: totalCompleted, icon: TrendingUp, color: "text-success" },
          { label: "Avg Order Value", value: `R${avgOrderValue.toFixed(2)}`, icon: DollarSign, color: "text-warning" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="stat-card">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
              <Icon className={`h-5 w-5 ${color}`} />
            </div>
            <p className="text-2xl font-bold">{value}</p>
          </div>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card p-6">
          <h3 className="text-sm font-semibold mb-4">Daily Revenue (Last 7 Days)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={getDailyRevenue()}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(224, 14%, 18%)" />
              <XAxis dataKey="name" tick={{ fill: "hsl(215, 15%, 50%)", fontSize: 11 }} />
              <YAxis tick={{ fill: "hsl(215, 15%, 50%)", fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(224, 18%, 11%)", border: "1px solid hsl(224, 14%, 18%)", borderRadius: 8, color: "hsl(210, 20%, 92%)" }} />
              <Line type="monotone" dataKey="revenue" stroke="hsl(25, 95%, 53%)" strokeWidth={2} dot={{ fill: "hsl(25, 95%, 53%)" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card p-6">
          <h3 className="text-sm font-semibold mb-4">Monthly Revenue (Last 6 Months)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={getMonthlyRevenue()}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(224, 14%, 18%)" />
              <XAxis dataKey="name" tick={{ fill: "hsl(215, 15%, 50%)", fontSize: 11 }} />
              <YAxis tick={{ fill: "hsl(215, 15%, 50%)", fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(224, 18%, 11%)", border: "1px solid hsl(224, 14%, 18%)", borderRadius: 8, color: "hsl(210, 20%, 92%)" }} />
              <Bar dataKey="revenue" fill="hsl(25, 95%, 53%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="glass-card p-6">
          <h3 className="text-sm font-semibold mb-4">Top Selling Products</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={getTopProducts()} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(224, 14%, 18%)" />
              <XAxis type="number" tick={{ fill: "hsl(215, 15%, 50%)", fontSize: 11 }} />
              <YAxis dataKey="name" type="category" tick={{ fill: "hsl(215, 15%, 50%)", fontSize: 11 }} width={80} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(224, 18%, 11%)", border: "1px solid hsl(224, 14%, 18%)", borderRadius: 8, color: "hsl(210, 20%, 92%)" }} />
              <Bar dataKey="count" fill="hsl(142, 71%, 45%)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card p-6">
          <h3 className="text-sm font-semibold mb-4">Order Types</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={getOrderTypes()} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                {getOrderTypes().map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: "hsl(224, 18%, 11%)", border: "1px solid hsl(224, 14%, 18%)", borderRadius: 8, color: "hsl(210, 20%, 92%)" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card p-6">
          <h3 className="text-sm font-semibold mb-4">Driver Performance</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={getDriverPerformance()}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(224, 14%, 18%)" />
              <XAxis dataKey="name" tick={{ fill: "hsl(215, 15%, 50%)", fontSize: 10 }} />
              <YAxis tick={{ fill: "hsl(215, 15%, 50%)", fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(224, 18%, 11%)", border: "1px solid hsl(224, 14%, 18%)", borderRadius: 8, color: "hsl(210, 20%, 92%)" }} />
              <Bar dataKey="deliveries" fill="hsl(38, 92%, 50%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default Analytics;
