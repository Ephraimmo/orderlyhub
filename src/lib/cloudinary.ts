import axios from "axios";
import { ref, push } from "@/lib/firestore";
import { db } from "@/lib/firestore";

const env = import.meta.env as Record<string, string | undefined>;

export type CloudinaryUploadOverrides = {
  cloudName?: string | null;
  uploadPreset?: string | null;
};

/**
 * Merge Business Settings (or explicit overrides) with optional `.env` fallbacks.
 * Unsigned uploads only need cloud name + preset — never put API secret in the client.
 */
export function resolveCloudinaryOptions(overrides?: CloudinaryUploadOverrides | null): {
  cloudName: string;
  uploadPreset: string;
} {
  const fromEnvName = (env.VITE_CLOUDINARY_CLOUD_NAME ?? "").trim();
  const fromEnvPreset = (env.VITE_CLOUDINARY_UPLOAD_PRESET ?? "").trim() || "ml_default";
  const cloudName = (overrides?.cloudName?.trim() || fromEnvName).trim();
  const uploadPreset = (overrides?.uploadPreset?.trim() || fromEnvPreset).trim() || "ml_default";
  return { cloudName, uploadPreset };
}

/**
 * Unsigned image upload to Cloudinary.
 * Pass `{ cloudName, uploadPreset }` from Business Settings (Firebase), or rely on `.env` for local dev.
 */
export const uploadToCloudinary = async (
  file: File,
  overrides?: CloudinaryUploadOverrides | null
): Promise<string> => {
  const { cloudName, uploadPreset } = resolveCloudinaryOptions(overrides ?? undefined);

  if (!cloudName) {
    throw new Error(
      "Cloudinary cloud name is missing. Enter it under Business Settings → Media (Cloudinary), or set VITE_CLOUDINARY_CLOUD_NAME in .env for development."
    );
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);

  const { data } = await axios.post<{ secure_url?: string }>(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } }
  );

  const url = data?.secure_url;
  if (!url) {
    throw new Error("Cloudinary upload succeeded but no secure_url was returned.");
  }

  return url;
};

export type ImageUploadContext = "product" | "category" | "settings_logo" | string;

/** Optional audit trail: store URL + metadata in Realtime Database (not the binary). */
export const saveImageUploadToRtdb = async (
  url: string,
  meta: { context?: ImageUploadContext; userId?: string | null } = {}
) => {
  try {
    await push(ref(db, "uploads/images"), {
      url,
      createdAt: Date.now(),
      context: meta.context ?? "unknown",
      userId: meta.userId ?? null,
    });
  } catch (e) {
    console.error("Failed to log image upload to Firebase:", e);
  }
};
