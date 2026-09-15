/**
 * One Firebase project can host many businesses. Each business has its own settings document.
 *
 * - `default` → `settings/business` (backward compatible with existing single-tenant installs)
 * - any other id → `settings/businesses/{businessId}`
 *
 * Set `businessId` on `admins/{uid}` in Realtime Database (string). Omit or use `default` for the original store.
 */
export function getBusinessSettingsPath(businessId: string | undefined | null): string {
  const id = typeof businessId === "string" ? businessId.trim() : "";
  if (!id || id === "default") return "settings/business";
  return `settings/businesses/${id}`;
}

export function formatBusinessIdLabel(businessId: string | undefined | null): string {
  const id = typeof businessId === "string" ? businessId.trim() : "";
  if (!id || id === "default") return "default (shared settings path)";
  return id;
}
