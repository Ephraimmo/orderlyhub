// Permission catalog for the Restaurant Management application.
// Stored on /restaurantUsers/{uid}/permissions (encoded keys) and enforced in UI + RTDB rules.

export type RestaurantRole =
  | "restaurant_owner"
  | "restaurant_manager"
  | "branch_manager"
  | "kitchen_manager"
  | "kitchen_staff"
  | "cashier"
  | "inventory_manager";

export const RESTAURANT_ROLES: RestaurantRole[] = [
  "restaurant_owner",
  "restaurant_manager",
  "branch_manager",
  "kitchen_manager",
  "kitchen_staff",
  "cashier",
  "inventory_manager",
];

export interface RestaurantPermission {
  code: string;
  module: string;
  description: string;
  actions?: string[];
}

export const RESTAURANT_PERMISSIONS: RestaurantPermission[] = [
  { code: "rm.dashboard.view", module: "dashboard", description: "View restaurant dashboard and KPIs" },
  { code: "rm.profile.view", module: "profile", description: "View restaurant profile and branding" },
  { code: "rm.profile.manage", module: "profile", description: "Edit restaurant profile, hours and contact details" },
  { code: "rm.menu.view", module: "menu", description: "View menu categories, products and pricing" },
  { code: "rm.menu.manage", module: "menu", description: "Create and edit menu categories and products" },
  { code: "rm.orders.view", module: "orders", description: "View incoming and historical orders" },
  { code: "rm.orders.manage", module: "orders", description: "Accept, advance and cancel orders" },
  { code: "rm.kitchen.view", module: "kitchen", description: "View the kitchen preparation queue" },
  { code: "rm.kitchen.manage", module: "kitchen", description: "Mark items prepared and manage kitchen flow" },
  { code: "rm.tables.view", module: "tables", description: "View table layout and seating status" },
  { code: "rm.tables.manage", module: "tables", description: "Manage table assignments and reservations" },
  { code: "rm.customers.view", module: "customers", description: "View customer directory for this restaurant" },
  { code: "rm.customers.manage", module: "customers", description: "Edit customer records and loyalty data" },
  { code: "rm.inventory.view", module: "inventory", description: "View stock levels and ingredients" },
  { code: "rm.inventory.manage", module: "inventory", description: "Adjust stock and manage inventory items" },
  { code: "rm.delivery.view", module: "delivery", description: "View delivery orders and dispatch board" },
  { code: "rm.delivery.manage", module: "delivery", description: "Assign drivers and manage deliveries" },
  { code: "rm.drivers.view", module: "drivers", description: "View assigned drivers for this restaurant" },
  { code: "rm.drivers.manage", module: "drivers", description: "Manage driver assignments for this restaurant" },
  { code: "rm.payments.view", module: "payments", description: "View payment methods and transaction history" },
  { code: "rm.payments.manage", module: "payments", description: "Configure payment methods and reconcile" },
  { code: "rm.promotions.view", module: "promotions", description: "View promotions and discount codes" },
  { code: "rm.promotions.manage", module: "promotions", description: "Create and publish restaurant promotions" },
  { code: "rm.reports.view", module: "reports", description: "View operational and sales reports" },
  { code: "rm.settings.view", module: "settings", description: "View restaurant settings" },
  { code: "rm.settings.manage", module: "settings", description: "Configure restaurant settings and integrations" },
  {
    code: "rm.support.view",
    module: "support",
    description: "View support inquiries for this restaurant",
    actions: ["view"],
  },
  {
    code: "rm.support.manage",
    module: "support",
    description: "Reply to and resolve support inquiries for this restaurant",
    actions: ["edit", "manage"],
  },
];

export const RESTAURANT_PERMISSION_CODES = RESTAURANT_PERMISSIONS.map((p) => p.code);

export interface RestaurantRolePermission {
  role: RestaurantRole;
  permission_code: string;
}

const grant = (role: RestaurantRole, codes: string[]) => {
  for (const code of codes) entries.push({ role, permission_code: code });
};

const entries: RestaurantRolePermission[] = [];
grant("restaurant_owner", RESTAURANT_PERMISSION_CODES);
grant("restaurant_manager", [
  "rm.dashboard.view", "rm.profile.view", "rm.profile.manage", "rm.menu.view", "rm.menu.manage",
  "rm.orders.view", "rm.orders.manage", "rm.kitchen.view", "rm.kitchen.manage", "rm.tables.view",
  "rm.tables.manage", "rm.customers.view", "rm.customers.manage", "rm.inventory.view", "rm.inventory.manage",
  "rm.delivery.view", "rm.delivery.manage", "rm.drivers.view", "rm.promotions.view", "rm.reports.view", "rm.settings.view",
  "rm.support.view", "rm.support.manage",
]);
grant("branch_manager", [
  "rm.dashboard.view", "rm.profile.view", "rm.orders.view", "rm.orders.manage", "rm.kitchen.view",
  "rm.kitchen.manage", "rm.tables.view", "rm.tables.manage", "rm.customers.view", "rm.inventory.view", "rm.reports.view",
  "rm.support.view",
]);
grant("kitchen_manager", [
  "rm.orders.view", "rm.orders.manage", "rm.kitchen.view", "rm.kitchen.manage", "rm.menu.view",
  "rm.inventory.view", "rm.inventory.manage",
]);
grant("kitchen_staff", ["rm.orders.view", "rm.kitchen.view", "rm.kitchen.manage"]);
grant("cashier", [
  "rm.orders.view", "rm.orders.manage", "rm.tables.view", "rm.tables.manage", "rm.customers.view", "rm.promotions.view",
]);
grant("inventory_manager", [
  "rm.menu.view", "rm.inventory.view", "rm.inventory.manage", "rm.reports.view", "rm.orders.view",
]);

export const RESTAURANT_ROLE_PERMISSIONS: RestaurantRolePermission[] = entries;

export function isRestaurantRole(value: string): value is RestaurantRole {
  return (RESTAURANT_ROLES as string[]).includes(value);
}

export function isRestaurantPermission(value: string): boolean {
  return RESTAURANT_PERMISSION_CODES.includes(value);
}

export function getDefaultPermissionsForRole(role: RestaurantRole): string[] {
  return RESTAURANT_ROLE_PERMISSIONS.filter((rp) => rp.role === role).map((rp) => rp.permission_code);
}

export function encodePermissionKeyForRtdb(code: string): string {
  return code.replace(/\./g, "_");
}

export function decodePermissionKeyFromRtdb(key: string): string {
  if (key.includes(".")) return key;
  if (!key.startsWith("rm_")) return key;
  return key.split("_").join(".");
}

export function permissionsToMap(codes: string[]): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const code of codes.filter(isRestaurantPermission)) {
    map[encodePermissionKeyForRtdb(code)] = true;
  }
  return map;
}

export function mapToPermissions(map: Record<string, boolean> | null | undefined): string[] {
  return Object.entries(map ?? {})
    .filter(([, enabled]) => enabled === true)
    .map(([key]) => decodePermissionKeyFromRtdb(key))
    .filter(isRestaurantPermission);
}

export const RESTAURANT_ROLE_LABELS: Record<RestaurantRole, string> = {
  restaurant_owner: "Restaurant Owner",
  restaurant_manager: "Restaurant Manager",
  branch_manager: "Branch Manager",
  kitchen_manager: "Kitchen Manager",
  kitchen_staff: "Kitchen Staff",
  cashier: "Cashier",
  inventory_manager: "Inventory Manager",
};

export function restaurantRoleLabel(role: RestaurantRole): string {
  return RESTAURANT_ROLE_LABELS[role] ?? role.replace(/_/g, " ");
}
