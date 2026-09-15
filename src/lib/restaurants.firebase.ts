import { fsGet, fsSubscribe } from "@/lib/firestore";
import { restaurantPath } from "@/lib/restaurant-scope";

export type RestaurantStatus = "approved" | "pending" | "suspended" | "rejected";

export interface DeliveryTier {
  id: string;
  up_to_km: number;
  fee: number;
  label?: string | null;
}

export interface FirebaseRestaurant {
  id: string;
  name: string;
  slug: string;
  cuisine: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string;
  country: string;
  currency: string;
  status: RestaurantStatus;
  commission_rate: number;
  delivery_enabled: boolean;
  pickup_enabled: boolean;
  delivery_radius_km: number;
  delivery_tiers: DeliveryTier[];
  rating: number;
  rating_count: number;
  prep_time_minutes: number;
  opens_at: string;
  closes_at: string;
  latitude: number | null;
  longitude: number | null;
  image_url: string | null;
  created_at: string;
  cloudinaryCloudName?: string;
  cloudinaryUploadPreset?: string;
  [key: string]: unknown;
}

export async function fetchRestaurantById(restaurantId: string): Promise<FirebaseRestaurant | null> {
  const raw = await fsGet<FirebaseRestaurant>(restaurantPath(restaurantId));
  if (!raw) return null;
  return { ...raw, id: raw.id ?? restaurantId };
}

export function subscribeRestaurant(
  restaurantId: string,
  callback: (restaurant: FirebaseRestaurant | null) => void,
): () => void {
  return fsSubscribe<FirebaseRestaurant>(restaurantPath(restaurantId), (raw) => {
    if (!raw) {
      callback(null);
      return;
    }
    callback({ ...raw, id: raw.id ?? restaurantId });
  });
}
