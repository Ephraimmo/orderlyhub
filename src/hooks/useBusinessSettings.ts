import { useEffect, useState } from "react";
import { subscribeRestaurant } from "@/lib/restaurants.firebase";

/**
 * Live subscription to the assigned restaurant document (includes Cloudinary config fields).
 */
export function useBusinessSettings(restaurantId: string | undefined | null) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const path = restaurantId ? `restaurants/${restaurantId}` : null;

  useEffect(() => {
    if (!restaurantId) {
      setData(null);
      return;
    }
    return subscribeRestaurant(restaurantId, (restaurant) => {
      setData(restaurant as Record<string, unknown> | null);
    });
  }, [restaurantId]);

  return { businessSettings: data, settingsPath: path ?? "" };
}
