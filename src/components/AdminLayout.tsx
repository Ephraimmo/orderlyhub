import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import AdminSidebar from "@/components/AdminSidebar";
import { CONSOLE_NAME } from "@/components/HearthLogo";
import { navItems } from "@/components/nav-items";

const usePageTitle = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    const item = navItems.find(({ to }) => (to === "/" ? pathname === "/" : pathname.startsWith(to)));
    document.title = item ? `${item.label} — ${CONSOLE_NAME}` : CONSOLE_NAME;
  }, [pathname]);
};

const AdminLayout = () => {
  usePageTitle();
  return (
    <div className="relative min-h-screen bg-background">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-72 top-0 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute right-0 top-80 h-72 w-72 rounded-full bg-warning/10 blur-3xl" />
      </div>
      <AdminSidebar />
      <main className="relative ml-64 min-h-screen">
        <div className="p-5 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;
