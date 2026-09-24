import {
  LayoutDashboard, Package, FolderOpen, ShoppingCart, Truck, Users,
  Settings, CreditCard, Bell, MapPin,
  SlidersHorizontal, Ticket, BarChart3, ChefHat, LifeBuoy, Building2,
  UserCog,
} from "lucide-react";

/** Sidebar navigation. Labels also drive the page titles set in AdminLayout. */
export const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, permission: "rm.dashboard.view" },
  { to: "/orders", label: "Orders", icon: ShoppingCart, permission: "rm.orders.view" },
  { to: "/kitchen", label: "Kitchen", icon: ChefHat, permission: "rm.kitchen.view" },
  { to: "/products", label: "Products", icon: Package, permission: "rm.menu.view" },
  { to: "/categories", label: "Categories", icon: FolderOpen, permission: "rm.menu.view" },
  { to: "/modifiers", label: "Modifiers", icon: SlidersHorizontal, permission: "rm.menu.view" },
  { to: "/customers", label: "Customers", icon: Users, permission: "rm.customers.view" },
  { to: "/drivers", label: "Drivers", icon: Truck, permission: "rm.drivers.view" },
  { to: "/coupons", label: "Coupons", icon: Ticket, permission: "rm.promotions.view" },
  { to: "/payments", label: "Payments", icon: CreditCard, permission: "rm.payments.view" },
  { to: "/location", label: "Location & Branches", icon: Building2, permission: "rm.profile.view" },
  { to: "/delivery-settings", label: "Delivery Settings", icon: MapPin, permission: "rm.delivery.view" },
  { to: "/analytics", label: "Analytics", icon: BarChart3, permission: "rm.reports.view" },
  { to: "/support", label: "My Inquiries", icon: LifeBuoy, permission: "rm.support.view" },
  { to: "/users", label: "Staff Users", icon: UserCog, permission: "rm.settings.manage" },
  { to: "/settings", label: "Business Settings", icon: Settings, permission: "rm.settings.view" },
  { to: "/notifications", label: "Notifications", icon: Bell, permission: "rm.settings.view" },
];
