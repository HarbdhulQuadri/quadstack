import { v2 as cloudinary } from "cloudinary";

import { mediaEnv } from "../env";

function configure() {
  const env = mediaEnv();
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key:    env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure:     true,
  });
  return cloudinary;
}

export interface SignedUploadParams {
  signature:  string;
  timestamp:  number;
  apiKey:     string;
  cloudName:  string;
  folder:     string;
}

/**
 * Generate signed params the client needs to upload directly to Cloudinary.
 * File bytes never pass through your server — the client posts directly to Cloudinary.
 *
 * Usage in an ORPC procedure:
 *   const params = await getSignedUploadParams("avatars");
 *   // return params to the client
 *   // client posts the file + params to https://api.cloudinary.com/v1_1/:cloudName/auto/upload
 */
export async function getSignedUploadParams(
  folder: string,
  options: { allowedFormats?: string[]; maxBytes?: number } = {},
): Promise<SignedUploadParams> {
  const env = mediaEnv();
  const cloud = configure();

  const timestamp = Math.round(Date.now() / 1000);
  const params: Record<string, string | number | string[]> = {
    timestamp,
    folder,
    ...(options.allowedFormats ? { allowed_formats: options.allowedFormats } : {}),
    ...(options.maxBytes       ? { max_bytes:       options.maxBytes }       : {}),
  };

  const signature = cloud.utils.api_sign_request(params, env.CLOUDINARY_API_SECRET);

  return {
    signature,
    timestamp,
    apiKey:    env.CLOUDINARY_API_KEY,
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    folder,
  };
}

/** Delete an asset from Cloudinary by its public ID. */
export async function deleteAsset(publicId: string) {
  const cloud = configure();
  return cloud.uploader.destroy(publicId);
}

/** Build a Cloudinary transformation URL without importing cloudinary on the client. */
export function buildImageUrl(
  publicId: string,
  options: {
    width?:   number;
    height?:  number;
    quality?: number | "auto";
    format?:  "auto" | "webp" | "avif" | "jpg" | "png";
    crop?:    "fill" | "fit" | "scale" | "thumb" | "crop";
    gravity?: "auto" | "face" | "center";
  } = {},
): string {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  if (!cloudName) throw new Error("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME is not set");

  const transforms: string[] = [];
  if (options.width)   transforms.push(`w_${options.width}`);
  if (options.height)  transforms.push(`h_${options.height}`);
  if (options.quality) transforms.push(`q_${options.quality}`);
  if (options.format)  transforms.push(`f_${options.format}`);
  if (options.crop)    transforms.push(`c_${options.crop}`);
  if (options.gravity) transforms.push(`g_${options.gravity}`);

  const transform = transforms.length ? transforms.join(",") + "/" : "";
  return `https://res.cloudinary.com/${cloudName}/image/upload/${transform}${publicId}`;
}

export function buildVideoUrl(publicId: string): string {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  if (!cloudName) throw new Error("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME is not set");
  return `https://res.cloudinary.com/${cloudName}/video/upload/${publicId}`;
}
