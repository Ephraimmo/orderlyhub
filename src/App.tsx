import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AdminLayout from "@/components/AdminLayout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Products from "@/pages/Products";
import Categories from "@/pages/Categories";
import Orders from "@/pages/Orders";
import Drivers from "@/pages/Drivers";
import Payments from "@/pages/Payments";
import DeliverySettings from "@/pages/DeliverySettings";
import LocationPage from "@/pages/Location";
import Settings from "@/pages/Settings";
import Notifications from "@/pages/Notifications";
import Coupons from "@/pages/Coupons";
import Customers from "@/pages/Customers";
import Analytics from "@/pages/Analytics";
import Modifiers from "@/pages/Modifiers";
import Kitchen from "@/pages/Kitchen";
import Support from "@/pages/Support";
import Users from "@/pages/Users";
import NotFound from "@/pages/NotFound";
import { Loader2, ShieldOff } from "lucide-react";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const PermissionRoute = ({
  permission,
  children,
}: {
  permission: string;
  children: React.ReactNode;
}) => {
  const { can } = useAuth();
  if (!can(permission)) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center animate-fade-in">
        <ShieldOff className="h-10 w-10 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Access restricted</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Your account does not have permission to view this module. Contact your platform administrator.
        </p>
      </div>
    );
  }
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route
                index
                element={
                  <PermissionRoute permission="rm.dashboard.view">
                    <Dashboard />
                  </PermissionRoute>
                }
              />
              <Route
                path="products"
                element={
                  <PermissionRoute permission="rm.menu.view">
                    <Products />
                  </PermissionRoute>
                }
              />
              <Route
                path="categories"
                element={
                  <PermissionRoute permission="rm.menu.view">
                    <Categories />
                  </PermissionRoute>
                }
              />
              <Route
                path="modifiers"
                element={
                  <PermissionRoute permission="rm.menu.view">
                    <Modifiers />
                  </PermissionRoute>
                }
              />
              <Route
                path="orders"
                element={
                  <PermissionRoute permission="rm.orders.view">
                    <Orders />
                  </PermissionRoute>
                }
              />
              <Route
                path="kitchen"
                element={
                  <PermissionRoute permission="rm.kitchen.view">
                    <Kitchen />
                  </PermissionRoute>
                }
              />
              <Route
                path="customers"
                element={
                  <PermissionRoute permission="rm.customers.view">
                    <Customers />
                  </PermissionRoute>
                }
              />
              <Route
                path="drivers"
                element={
                  <PermissionRoute permission="rm.drivers.view">
                    <Drivers />
                  </PermissionRoute>
                }
              />
              <Route
                path="coupons"
                element={
                  <PermissionRoute permission="rm.promotions.view">
                    <Coupons />
                  </PermissionRoute>
                }
              />
              <Route
                path="payments"
                element={
                  <PermissionRoute permission="rm.payments.view">
                    <Payments />
                  </PermissionRoute>
                }
              />
              <Route
                path="location"
                element={
                  <PermissionRoute permission="rm.profile.view">
                    <LocationPage />
                  </PermissionRoute>
                }
              />
              <Route
                path="delivery-settings"
                element={
                  <PermissionRoute permission="rm.delivery.view">
                    <DeliverySettings />
                  </PermissionRoute>
                }
              />
              <Route
                path="analytics"
                element={
                  <PermissionRoute permission="rm.reports.view">
                    <Analytics />
                  </PermissionRoute>
                }
              />
              <Route
                path="support"
                element={
                  <PermissionRoute permission="rm.support.view">
                    <Support />
                  </PermissionRoute>
                }
              />
              <Route
                path="users"
                element={
                  <PermissionRoute permission="rm.settings.manage">
                    <Users />
                  </PermissionRoute>
                }
              />
              <Route
                path="settings"
                element={
                  <PermissionRoute permission="rm.settings.view">
                    <Settings />
                  </PermissionRoute>
                }
              />
              <Route
                path="notifications"
                element={
                  <PermissionRoute permission="rm.settings.view">
                    <Notifications />
                  </PermissionRoute>
                }
              />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
