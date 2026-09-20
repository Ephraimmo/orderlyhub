import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  fetchRestaurantUserByUid,
  refreshRestaurantUserSession,
  type RestaurantSignInResult,
  signInRestaurantUserWithFirebase,
  clearPersistedSession,
  buildRestaurantUserSession,
  type RestaurantUserSession,
} from "@/lib/restaurant-users.firebase";
import { restaurantRoleLabel, type RestaurantRole } from "@/lib/restaurant-permissions";
import {
  clearStaffSession,
  persistStaffSession,
  readStaffSession,
  signInStaffUser,
} from "@/lib/staff-users.firebase";
import {
  fetchRestaurantById,
  subscribeRestaurant,
  type FirebaseRestaurant,
} from "@/lib/restaurants.firebase";

interface AuthContextType {
  session: RestaurantUserSession | null;
  restaurant: FirebaseRestaurant | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  loginStaff: (username: string, password: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  can: (permission: string) => boolean;
  canManage: (module: "menu" | "orders" | "kitchen" | "customers" | "drivers" | "delivery" | "payments" | "promotions" | "settings" | "profile") => boolean;
  restaurantId: string | null;
  roleLabel: string;
  /** Username (non-admin) account signed in. */
  isStaff: boolean;
  /** @deprecated use session + can() */
  user: { uid: string; email: string | null; role: string; displayName: string | null; businessId: string } | null;
  /** @deprecated use can('rm.menu.manage') etc. */
  isManager: boolean;
  /** @deprecated use session.role === 'restaurant_owner' */
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<RestaurantUserSession | null>(null);
  const [restaurant, setRestaurant] = useState<FirebaseRestaurant | null>(null);
  const [loading, setLoading] = useState(true);

  const loadRestaurant = useCallback(async (restaurantId: string) => {
    const data = await fetchRestaurantById(restaurantId);
    setRestaurant(data);
  }, []);

  const applySession = useCallback(
    async (next: RestaurantUserSession | null) => {
      setSession(next);
      if (next?.restaurantId) {
        await loadRestaurant(next.restaurantId);
      } else {
        setRestaurant(null);
      }
    },
    [loadRestaurant],
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        const staff = readStaffSession();
        if (staff) {
          await applySession(staff);
          setLoading(false);
          return;
        }
        setSession(null);
        setRestaurant(null);
        clearPersistedSession();
        setLoading(false);
        return;
      }
      try {
        const record = await fetchRestaurantUserByUid(firebaseUser.uid);
        if (!record || record.status === "suspended") {
          await signOut(auth);
          setSession(null);
          setRestaurant(null);
          clearPersistedSession();
        } else {
          await applySession(buildRestaurantUserSession(record));
        }
      } catch {
        setSession(null);
        setRestaurant(null);
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, [applySession]);

  useEffect(() => {
    if (!session?.restaurantId) return;
    return subscribeRestaurant(session.restaurantId, setRestaurant);
  }, [session?.restaurantId]);

  useEffect(() => {
    if (!session || session.kind === "staff") return;
    const refresh = async () => {
      const next = await refreshRestaurantUserSession(session);
      if (!next) {
        await signOut(auth);
        setSession(null);
        setRestaurant(null);
        return;
      }
      if (JSON.stringify(next.permissions) !== JSON.stringify(session.permissions)) {
        setSession(next);
      }
    };
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [session]);

  const login = async (email: string, password: string) => {
    clearStaffSession();
    const result = await signInRestaurantUserWithFirebase({ email, password });
    if (!result.ok) return { ok: false as const, message: (result as Extract<RestaurantSignInResult, { ok: false }>).message };
    await applySession(result.session);
    return { ok: true as const };
  };

  const loginStaff = async (username: string, password: string) => {
    const result = await signInStaffUser({ username, password });
    if (result.ok !== true) return { ok: false as const, message: result.message };
    persistStaffSession(result.session);
    await applySession(result.session);
    setLoading(false);
    return { ok: true as const };
  };

  const logout = async () => {
    clearPersistedSession();
    clearStaffSession();
    await signOut(auth).catch(() => {});
    setSession(null);
    setRestaurant(null);
  };

  const refreshSession = async () => {
    if (!session || session.kind === "staff") return;
    const next = await refreshRestaurantUserSession(session);
    if (!next) {
      await logout();
      return;
    }
    setSession(next);
  };


  const can = useCallback(
    (permission: string) => session?.permissions.includes(permission) ?? false,
    [session],
  );

  const canManage = useCallback(
    (module: Parameters<AuthContextType["canManage"]>[0]) => can(`rm.${module}.manage`),
    [can],
  );

  const legacyUser = session
    ? {
        uid: session.userId,
        email: session.email,
        role: session.role,
        displayName: session.fullName,
        businessId: session.restaurantId,
      }
    : null;

  return (
    <AuthContext.Provider
      value={{
        session,
        restaurant,
        loading,
        login,
        loginStaff,
        isStaff: session?.kind === "staff",
        logout,
        refreshSession,
        can,
        canManage,
        restaurantId: session?.restaurantId ?? null,
        roleLabel: session ? session.roleName ?? restaurantRoleLabel(session.role as RestaurantRole) : "",
        user: legacyUser,
        isManager: !can("rm.menu.manage") && !can("rm.orders.manage") && !can("rm.settings.manage"),
        isAdmin: session?.role === "restaurant_owner",
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
