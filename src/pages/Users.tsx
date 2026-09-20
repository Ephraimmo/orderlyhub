import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeBranches, type RestaurantBranch } from "@/lib/branches.firebase";
import {
  STAFF_ROLES,
  STAFF_DENIED_PERMISSIONS,
  deleteStaffUser,
  normalizeUsername,
  saveStaffUser,
  staffPermissionsForRole,
  subscribeStaffUsers,
  type StaffUser,
} from "@/lib/staff-users.firebase";
import {
  isCustomRoleId,
  subscribeCustomRoles,
  saveCustomRole,
  deleteCustomRole,
  type CustomRole,
} from "@/lib/custom-roles.firebase";
import { restaurantRoleLabel, isRestaurantRole, RESTAURANT_PERMISSIONS } from "@/lib/restaurant-permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Plus,
  ShieldCheck,
  ShieldPlus,
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

/** Permissions a custom role may grant — same restriction as built-in staff roles
 * (settings/profile/payment configuration stays admin-only, see staff-users.firebase.ts). */
const ASSIGNABLE_PERMISSIONS = RESTAURANT_PERMISSIONS.filter(
  (p) => !STAFF_DENIED_PERMISSIONS.includes(p.code),
);
const PERMISSION_MODULES = [...new Set(ASSIGNABLE_PERMISSIONS.map((p) => p.module))];
const CREATE_CUSTOM_ROLE_VALUE = "__create_custom_role__";

interface RoleFormState {
  name: string;
  permissions: string[];
}

const emptyRoleForm: RoleFormState = { name: "", permissions: [] };

const Users = () => {
  const { restaurantId, can } = useAuth();
  const { toast } = useToast();
  const canManage = can("rm.settings.manage");

  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [branches, setBranches] = useState<RestaurantBranch[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StaffUser | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<CustomRole | null>(null);
  const [roleForm, setRoleForm] = useState<RoleFormState>(emptyRoleForm);
  const [savingRole, setSavingRole] = useState(false);
  const [roleError, setRoleError] = useState("");

  useEffect(() => {
    if (!restaurantId) return;
    const unsubStaff = subscribeStaffUsers(restaurantId, (rows) => {
      setStaff(rows);
      setLoading(false);
    });
    const unsubBranches = subscribeBranches(restaurantId, setBranches);
    const unsubRoles = subscribeCustomRoles(restaurantId, setCustomRoles);
    return () => {
      unsubStaff();
      unsubBranches();
      unsubRoles();
    };
  }, [restaurantId]);

  const roleLabelFor = (role: string): string => {
    if (isRestaurantRole(role)) return restaurantRoleLabel(role);
    return customRoles.find((r) => r.id === role)?.name ?? "Custom role (deleted)";
  };

  const previewPermissionsFor = (role: string): string[] => {
    if (isRestaurantRole(role)) return staffPermissionsForRole(role);
    const custom = customRoles.find((r) => r.id === role);
    return (custom?.permissions ?? []).filter((code) => !STAFF_DENIED_PERMISSIONS.includes(code));
  };

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
          role: form.role,
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

  const openCreateRole = () => {
    setEditingRole(null);
    setRoleForm(emptyRoleForm);
    setRoleError("");
    setRoleDialogOpen(true);
  };

  const openEditRole = (role: CustomRole) => {
    setEditingRole(role);
    setRoleForm({ name: role.name, permissions: role.permissions });
    setRoleError("");
    setRoleDialogOpen(true);
  };

  const togglePermission = (code: string, checked: boolean) => {
    setRoleForm((prev) => ({
      ...prev,
      permissions: checked ? [...prev.permissions, code] : prev.permissions.filter((c) => c !== code),
    }));
  };

  const handleSaveRole = async () => {
    if (!restaurantId) return;
    setRoleError("");
    if (!roleForm.name.trim()) return setRoleError("Role name is required.");
    if (roleForm.permissions.length === 0) return setRoleError("Select at least one permission.");

    setSavingRole(true);
    try {
      const saved = await saveCustomRole(restaurantId, {
        id: editingRole?.id,
        name: roleForm.name,
        permissions: roleForm.permissions,
      });
      setForm((f) => ({ ...f, role: saved.id }));
      toast({
        title: editingRole ? "Role updated" : "Role created",
        description: `"${saved.name}" is ready to assign.`,
      });
      setRoleDialogOpen(false);
    } catch (err) {
      setRoleError(err instanceof Error ? err.message : "Could not save the role.");
    } finally {
      setSavingRole(false);
    }
  };

  const handleDeleteRole = async (role: CustomRole) => {
    if (!restaurantId) return;
    const inUse = staff.filter((s) => s.role === role.id);
    const warning =
      inUse.length > 0
        ? `${inUse.length} staff member${inUse.length === 1 ? "" : "s"} currently ${inUse.length === 1 ? "has" : "have"} the "${role.name}" role and will lose those permissions immediately. `
        : "";
    if (!window.confirm(`${warning}Delete the "${role.name}" role?`)) return;
    try {
      await deleteCustomRole(restaurantId, role.id);
      if (form.role === role.id) setForm((f) => ({ ...f, role: "cashier" }));
      toast({ title: "Role deleted" });
    } catch {
      toast({ title: "Could not delete role", variant: "destructive" });
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
                  <td className="px-4 py-3">{roleLabelFor(user.role)}</td>
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
                <div className="flex items-center justify-between">
                  <Label>Role</Label>
                  {isCustomRoleId(form.role) && (
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        title="Edit this custom role"
                        onClick={() => {
                          const role = customRoles.find((r) => r.id === form.role);
                          if (role) openEditRole(role);
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-destructive hover:text-destructive"
                        title="Delete this custom role"
                        onClick={() => {
                          const role = customRoles.find((r) => r.id === form.role);
                          if (role) void handleDeleteRole(role);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
                <Select
                  value={form.role}
                  onValueChange={(v) => {
                    if (v === CREATE_CUSTOM_ROLE_VALUE) {
                      openCreateRole();
                      return;
                    }
                    setForm({ ...form, role: v });
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Built-in roles</SelectLabel>
                      {STAFF_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>{restaurantRoleLabel(role)}</SelectItem>
                      ))}
                    </SelectGroup>
                    {customRoles.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Custom roles</SelectLabel>
                        {customRoles.map((role) => (
                          <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                    <SelectSeparator />
                    <SelectItem value={CREATE_CUSTOM_ROLE_VALUE}>
                      <span className="flex items-center gap-1.5 text-primary">
                        <ShieldPlus className="h-3.5 w-3.5" /> Create custom role…
                      </span>
                    </SelectItem>
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
                {previewPermissionsFor(form.role).map((code) => (
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

      {/* Custom Role Builder */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent className="grid max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-h-[calc(100dvh-2rem)]">
          <DialogHeader className="border-b border-border/60 px-5 py-4 pr-12 sm:px-6">
            <DialogTitle>{editingRole ? `Edit "${editingRole.name}"` : "Create custom role"}</DialogTitle>
            <DialogDescription>
              Pick exactly the permissions this role should grant. Like every staff role, it can never
              include system settings, profile, or payment configuration access.
            </DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 gap-4 overflow-y-auto px-5 py-4 sm:px-6">
            <div className="space-y-2">
              <Label htmlFor="role_name">Role name</Label>
              <Input
                id="role_name"
                value={roleForm.name}
                placeholder="Shift Lead"
                onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label>Permissions</Label>
              <div className="flex gap-3 text-xs">
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => setRoleForm((f) => ({ ...f, permissions: ASSIGNABLE_PERMISSIONS.map((p) => p.code) }))}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="text-muted-foreground hover:underline"
                  onClick={() => setRoleForm((f) => ({ ...f, permissions: [] }))}
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {PERMISSION_MODULES.map((mod) => (
                <div key={mod}>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {mod}
                  </p>
                  <div className="space-y-1.5">
                    {ASSIGNABLE_PERMISSIONS.filter((p) => p.module === mod).map((perm) => (
                      <label
                        key={perm.code}
                        className="flex cursor-pointer items-start gap-2 rounded-lg border border-border/50 p-2 text-sm hover:bg-muted/30"
                      >
                        <Checkbox
                          className="mt-0.5"
                          checked={roleForm.permissions.includes(perm.code)}
                          onCheckedChange={(checked) => togglePermission(perm.code, checked === true)}
                        />
                        <span>
                          <span className="block font-medium">{perm.description}</span>
                          <span className="block font-mono text-[10px] text-muted-foreground">{perm.code}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {roleError && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{roleError}</p>
            )}
          </div>

          <DialogFooter className="gap-2 border-t border-border/60 bg-background px-5 py-4 sm:px-6">
            <Button variant="outline" onClick={() => setRoleDialogOpen(false)} disabled={savingRole}>
              Cancel
            </Button>
            <Button onClick={() => void handleSaveRole()} disabled={savingRole}>
              {savingRole && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingRole ? "Save role" : "Create role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Users;
