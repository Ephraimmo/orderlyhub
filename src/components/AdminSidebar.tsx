import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LogOut, UtensilsCrossed } from "lucide-react";
import { AppLogo, CONSOLE_NAME } from "@/components/HearthLogo";
import { navItems } from "@/components/nav-items";

const AdminSidebar = () => {
  const { session, restaurant, logout, can, roleLabel } = useAuth();
  const location = useLocation();
  const visibleItems = navItems.filter(({ permission }) => can(permission));

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-sidebar-border/80 bg-sidebar/95 backdrop-blur-xl">
      <Link
        to="/"
        aria-label={`${CONSOLE_NAME} — home`}
        className="flex h-14 shrink-0 items-center border-b border-sidebar-border px-6"
      >
        <AppLogo />
      </Link>
      <div className="border-b border-sidebar-border px-6 py-5">
        <div className="flex items-center gap-3">
          {restaurant?.image_url ? (
            <img src={restaurant.image_url} alt="" className="h-10 w-10 rounded-xl object-cover border border-border" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
              <UtensilsCrossed className="h-5 w-5 text-primary" />
            </div>
          )}
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold text-sidebar-accent-foreground">
              {restaurant?.name ?? "Restaurant"}
            </h2>
            <p className="text-[10px] text-sidebar-foreground">{roleLabel}</p>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-primary/15 bg-primary/8 px-3 py-2">
          <p className="text-[11px] font-medium text-sidebar-accent-foreground">Assigned restaurant</p>
          <p className="mt-0.5 truncate font-mono text-[10px] text-sidebar-foreground">
            {session?.restaurantId ?? "—"}
          </p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {visibleItems.map(({ to, label, icon: Icon }) => {
          const active = location.pathname === to || (to !== "/" && location.pathname.startsWith(to));
          return (
            <NavLink key={to} to={to} className={active ? "sidebar-link-active" : "sidebar-link"}>
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border px-3 py-4">
        <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-sidebar-accent/40 px-3 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
            {session?.email?.[0]?.toUpperCase() || "A"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-sidebar-accent-foreground truncate">{session?.fullName || session?.email}</p>
            <p className="text-[10px] text-sidebar-foreground truncate">{session?.email}</p>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-md p-1 text-sidebar-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};

export default AdminSidebar;
