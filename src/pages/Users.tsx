import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeBranches, type RestaurantBranch } from "@/lib/branches.firebase";
import {
  STAFF_ROLES,
  deleteStaffUser,
  normalizeUsername,
  saveStaffUser,
  staffPermissionsForRole,
  subscribeStaffUsers,
  type StaffUser,
} from "@/lib/staff-users.firebase";
import { restaurantRoleLabel } from "@/lib/restaurant-permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  Pencil,
  Users as UsersIcon,
  Building2,
  KeyRound,
} from "lucide-react";

interface FormState {
  username: string;
  full_name: string;
  phone: string;
  role: string;
  branch_id: string;
  is_active: boolean;
  password: string;
}

const emptyForm: FormState = {
  username: "",
  full_name: "",
  phone: "",
  role: "cashier",
  branch_id: "main",
  is_active: true,
  password: "",
};

const Users = () => {
  const { restaurantId, can } = useAuth();
  const { toast } = useToast();
  const canManage = can("rm.settings.manage");

  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [branches, setBranches] = useState<RestaurantBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StaffUser | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!restaurantId) return;
    const unsubStaff = subscribeStaffUsers(restaurantId, (rows) => {
      setStaff(rows);
      setLoading(false);
    });
    const unsubBranches = subscribeBranches(restaurantId, setBranches);
    return () => {
      unsubStaff();
      unsubBranches();
    };
  }, [restaurantId]);

  const branchOptions = useMemo(
    () => [
      { id: "main", name: "Main restaurant (head office)" },
      ...branches.map((b) => ({ id: b.id, name: b.is_main ? `${b.name} (main branch)` : b.name })),
    ],
    [branches],
  );

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setOpen(true);
  };

  const openEdit = (user: StaffUser) => {
    setEditing(user);
    setForm({
      username: user.username,
      full_name: user.full_name,
      phone: user.phone ?? "",
      role: user.role,
      branch_id: user.branch_id ?? "main",
      is_active: user.is_active,
      password: "",
    });
    setError("");
    setOpen(true);
  };

  const handleSave = async () => {
    if (!restaurantId) return;
    setError("");
    const username = normalizeUsername(form.username);
    if (!username) return setError("Username is required (letters, numbers, . _ - only).");
    if (!form.full_name.trim()) return setError("Full name is required.");
    if (!editing && form.password.length < 6) return setError("Password must be at least 6 characters.");
    if (form.password && form.password.length < 6) return setError("Password must be at least 6 characters.");
    if (!editing && staff.some((s) => s.username === username)) {
      return setError("That username is already taken.");
    }

    setSaving(true);
    try {
      const branch = branchOptions.find((b) => b.id === form.branch_id);
      await saveStaffUser(
        restaurantId,
        {
          username,
          full_name: form.full_name,
          phone: form.phone,
          role: form.role as StaffUser["role"],
          branch_id: form.branch_id === "main" ? null : form.branch_id,
          branch_name: branch?.name ?? null,
          is_active: form.is_active,
          password: form.password || undefined,
        },
        editing ?? undefined,
      );
      toast({ title: editing ? "User updated" : "User created", description: `@${username} can now sign in with their username.` });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the user.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (user: StaffUser) => {
    if (!restaurantId) return;
    if (!window.confirm(`Remove ${user.full_name} (@${user.username})? They will lose access immediately.`)) return;
    try {
      await deleteStaffUser(restaurantId, user.username);
      toast({ title: "User removed", description: `@${user.username} can no longer sign in.` });
    } catch {
      toast({ title: "Could not remove user", variant: "destructive" });
    }
  };

  if (!canManage) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
        <ShieldCheck className="h-10 w-10 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Admins only</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Only the restaurant admin signed in with email and password can manage staff accounts.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Staff Users</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Create username accounts for your team. Staff sign in on the login page by ticking
            “I'm a staff member” and entering the username and password you set here. They can operate
            the restaurant but can never change system settings.
          </p>
        </div>
        <Button onClick={openCreate} className="h-10">
          <Plus className="mr-2 h-4 w-4" /> Add user
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border/60 bg-card/70 p-4">
          <p className="text-xs text-muted-foreground">Total users</p>
          <p className="mt-1 text-2xl font-bold">{staff.length}</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/70 p-4">
          <p className="text-xs text-muted-foreground">Active</p>
          <p className="mt-1 text-2xl font-bold">{staff.filter((s) => s.is_active).length}</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/70 p-4">
          <p className="text-xs text-muted-foreground">Branches available</p>
          <p className="mt-1 text-2xl font-bold">{branchOptions.length}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/70">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : staff.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <UsersIcon className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No staff accounts yet. Add your first user.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Branch</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((user) => (
                <tr key={user.id} className="border-t border-border/50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{user.full_name}</p>
                    <p className="font-mono text-xs text-muted-foreground">@{user.username}</p>
                  </td>
                  <td className="px-4 py-3">{restaurantRoleLabel(user.role)}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <Building2 className="h-3.5 w-3.5" />
                      {user.branch_name ?? "Main restaurant"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={user.is_active ? "default" : "secondary"}>
                      {user.is_active ? "Active" : "Deactivated"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(user)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => void handleDelete(user)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="grid max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-lg grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-h-[calc(100dvh-2rem)]">
          <DialogHeader className="border-b border-border/60 px-5 py-4 pr-12 sm:px-6">
            <DialogTitle>{editing ? `Edit @${editing.username}` : "Add staff user"}</DialogTitle>
            <DialogDescription>
              Assign a role and a branch. Staff accounts cannot change business settings.
            </DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 gap-4 overflow-y-auto px-5 py-4 sm:px-6">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={form.username}
                  disabled={!!editing}
                  placeholder="thabo.m"
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="full_name">Full name</Label>
                <Input
                  id="full_name"
                  value={form.full_name}
                  placeholder="Thabo Mokoena"
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone (optional)</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  placeholder="+27 82 000 0000"
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">
                  {editing ? "New password (leave blank to keep)" : "Password"}
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={form.password}
                  placeholder="••••••••"
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STAFF_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>{restaurantRoleLabel(role)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Assigned branch</Label>
                <Select value={form.branch_id} onValueChange={(v) => setForm({ ...form, branch_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {branchOptions.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
              <p className="mb-2 flex items-center gap-2 text-xs font-medium text-foreground">
                <KeyRound className="h-3.5 w-3.5" /> Access granted by this role
              </p>
              <div className="flex flex-wrap gap-1.5">
                {staffPermissionsForRole(form.role as StaffUser["role"]).map((code) => (
                  <span key={code} className="rounded-md bg-background px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {code}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2">
              <div>
                <p className="text-sm font-medium">Account active</p>
                <p className="text-xs text-muted-foreground">Deactivated users cannot sign in.</p>
              </div>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            </div>

            {error && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
            )}
          </div>

          <DialogFooter className="gap-2 border-t border-border/60 bg-background px-5 py-4 sm:px-6">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? "Save changes" : "Create user"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Users;
