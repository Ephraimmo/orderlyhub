import { useEffect, useState } from "react";
import { db } from "@/lib/firestore";
import { ref, onValue } from "@/lib/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeBranches, type RestaurantBranch } from "@/lib/branches.firebase";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Truck, Search, Filter } from "lucide-react";
import TableSkeleton from "@/components/TableSkeleton";

interface AssignedDriver {
  id: string;
  name: string;
  phone: string;
  vehicleType: string;
  vehiclePlate: string;
  active: boolean;
  status: string;
  branches: string[]; // resolved branch names; empty = assigned restaurant-wide
}

const Drivers = () => {
  const { restaurantId } = useAuth();
  const [drivers, setDrivers] = useState<AssignedDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    if (!restaurantId) return;
    let assignments: Record<string, any> = {};
    let driverProfiles: Record<string, any> = {};
    let branchList: RestaurantBranch[] = [];

    // A driver can hold a separate driverAssignments record per branch, so the
    // same driver_id may appear multiple times in the raw collection — group by
    // driver_id here so each driver renders as exactly one row.
    const merge = () => {
      const branchNameById = new Map(branchList.map((b) => [b.id, b.name]));
      const grouped = new Map<string, { branchIds: Set<string>; restaurantWide: boolean; active: boolean }>();

      for (const a of Object.values(assignments) as any[]) {
        const driverId = a?.driver_id;
        if (!driverId || a.restaurant_id !== restaurantId) continue;
        const entry = grouped.get(driverId) ?? { branchIds: new Set<string>(), restaurantWide: false, active: false };
        if (a.is_active !== false) {
          entry.active = true;
          if (a.branch_id) entry.branchIds.add(a.branch_id);
          else entry.restaurantWide = true;
        }
        grouped.set(driverId, entry);
      }

      const list = Array.from(grouped.entries())
        .filter(([, info]) => info.active)
        .map(([driverId, info]) => {
          const profile = driverProfiles[driverId] ?? {};
          return {
            id: driverId,
            name: profile.full_name ?? profile.name ?? driverId,
            phone: profile.phone ?? "",
            vehicleType: profile.vehicle_type ?? "—",
            vehiclePlate: profile.vehicle_plate ?? "—",
            active: profile.is_active !== false,
            status: String(profile.status ?? "offline"),
            branches: info.restaurantWide
              ? []
              : Array.from(info.branchIds).map((id) => branchNameById.get(id) ?? id),
          } satisfies AssignedDriver;
        });
      setDrivers(list);
      setLoading(false);
    };

    const unsub1 = onValue(ref(db, "driverAssignments"), (snap) => {
      assignments = snap.exists() ? snap.val() : {};
      merge();
    });
    const unsub2 = onValue(ref(db, "drivers"), (snap) => {
      driverProfiles = snap.exists() ? snap.val() : {};
      merge();
    });
    const unsub3 = subscribeBranches(restaurantId, (rows) => {
      branchList = rows;
      merge();
    });
    return () => { unsub1(); unsub2(); unsub3(); };
  }, [restaurantId]);

  const filtered = drivers
    .filter((d) => statusFilter === "all" || (statusFilter === "active" ? d.active : !d.active))
    .filter((d) => !search || d.name.toLowerCase().includes(search.toLowerCase()) || d.phone.includes(search));

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Drivers</h1>
        <p className="text-sm text-muted-foreground">
          Drivers assigned to your restaurant via ForkFleet Super Admin ({drivers.length} driver{drivers.length === 1 ? "" : "s"})
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search drivers..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
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

      {loading ? <TableSkeleton columns={7} /> : (
      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Vehicle</TableHead>
              <TableHead>Plate</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Branches</TableHead>
              <TableHead>Assignment</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No drivers assigned to this restaurant</TableCell></TableRow>
            ) : filtered.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.name}</TableCell>
                <TableCell>{d.phone || "—"}</TableCell>
                <TableCell className="capitalize">{d.vehicleType}</TableCell>
                <TableCell>{d.vehiclePlate}</TableCell>
                <TableCell className="capitalize">{d.status}</TableCell>
                <TableCell>{d.branches.length > 0 ? d.branches.join(", ") : "All branches"}</TableCell>
                <TableCell>{d.active ? "Active" : "Inactive"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      )}

      <p className="text-xs text-muted-foreground flex items-center gap-2">
        <Truck className="h-3.5 w-3.5" />
        Driver profiles are managed by the Driver App. Assignments are controlled in ForkFleet Super Admin.
      </p>
    </div>
  );
};

export default Drivers;
