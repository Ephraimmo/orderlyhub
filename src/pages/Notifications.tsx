import { useEffect, useState } from "react";
import { db } from "@/lib/firestore";
import { ref, onValue } from "@/lib/firestore";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Bell, Search, Filter } from "lucide-react";
import TableSkeleton from "@/components/TableSkeleton";

const Notifications = () => {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onValue(ref(db, "notifications"), (snap) => {
      if (!snap.exists()) { setNotifications([]); } else { setNotifications(Object.entries(snap.val()).map(([id, val]: any) => ({ id, ...val }))); }
      setLoading(false);
    });
    return unsub;
  }, []);

  const filtered = notifications
    .filter(n => typeFilter === "all" || (n.type || "") === typeFilter)
    .filter(n => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (n.title || "").toLowerCase().includes(q) || (n.body || "").toLowerCase().includes(q);
    })
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Notifications</h1>
        <p className="text-sm text-muted-foreground">Firebase Cloud Messaging notifications</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search notifications..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40"><Filter className="h-3 w-3 mr-1" /><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="order">Order</SelectItem>
            <SelectItem value="delivery">Delivery</SelectItem>
            <SelectItem value="system">System</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? <TableSkeleton columns={5} /> : (
      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Message</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Recipient</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">
                  <Bell className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">No notifications yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Notifications are sent automatically when order statuses change</p>
                </TableCell>
              </TableRow>
            ) : filtered.map((n) => (
              <TableRow key={n.id}>
                <TableCell className="font-medium text-sm">{n.title || "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{n.body || "—"}</TableCell>
                <TableCell>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary capitalize">{n.type || "general"}</span>
                </TableCell>
                <TableCell className="text-sm capitalize">{n.recipient || "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{n.createdAt ? new Date(n.createdAt).toLocaleString() : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      )}
    </div>
  );
};

export default Notifications;
