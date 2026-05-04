"use client";

import Image from "next/image";
import type { ImageProps } from "next/image";

import { buildImageUrl } from "./index";

// ─── CloudImage ──────────────────────────────────────────────────────────────
// Drop-in replacement for next/image that takes a Cloudinary public ID
// instead of a hardcoded URL or SVG path.
//
// Usage:
//   <CloudImage publicId="avatars/user-abc123" width={80} height={80} alt="Avatar" />
//   <CloudImage publicId="brand/logo" width={200} height={60} alt="Logo" format="webp" />

interface CloudImageProps
  extends Omit<ImageProps, "src"> {
  publicId: string;
  quality?: number | "auto";
  format?: "auto" | "webp" | "avif" | "jpg" | "png";
  crop?: "fill" | "fit" | "scale" | "thumb";
  gravity?: "auto" | "face" | "center";
}

export function CloudImage({
  publicId,
  width,
  height,
  quality = "auto",
  format = "auto",
  crop = "fill",
  gravity = "auto",
  alt,
  ...props
}: CloudImageProps) {
  const src = buildImageUrl(publicId, {
    width:   typeof width === "number" ? width : undefined,
    height:  typeof height === "number" ? height : undefined,
    quality,
    format,
    crop,
    gravity,
  });

  return (
    <Image
      src={src}
      width={width}
      height={height}
      alt={alt}
      {...props}
    />
  );
}

// ─── CloudVideo ──────────────────────────────────────────────────────────────
// Usage:
//   <CloudVideo publicId="courses/intro-lesson" className="w-full rounded-lg" />

interface CloudVideoProps
  extends React.VideoHTMLAttributes<HTMLVideoElement> {
  publicId: string;
}

export function CloudVideo({ publicId, ...props }: CloudVideoProps) {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const src = `https://res.cloudinary.com/${cloudName}/video/upload/${publicId}`;

  return (
    <video {...props}>
      <source src={`${src}.webm`} type="video/webm" />
      <source src={`${src}.mp4`}  type="video/mp4" />
    </video>
  );
}

// ─── useUpload ────────────────────────────────────────────────────────────────
// Hook that handles the full upload flow:
//   1. Fetches signed params from your server (via the /api/upload route)
//   2. Posts the file directly to Cloudinary
//   3. Returns the public_id to save in your DB
//
// Usage:
//   const { upload, uploading, error } = useUpload("avatars");
//   const publicId = await upload(file);

import { useState } from "react";

export function useUpload(folder: string) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File): Promise<string | null> {
    setUploading(true);
    setError(null);

    try {
      // Step 1: get signed params from your server
      const paramsRes = await fetch("/api/upload/sign", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ folder }),
      });
      if (!paramsRes.ok) throw new Error("Failed to get upload params");
      const params = await paramsRes.json() as {
        signature: string; timestamp: number; apiKey: string; cloudName: string;
      };

      // Step 2: upload directly to Cloudinary (file bytes never touch your server)
      const form = new FormData();
      form.append("file",       file);
      form.append("folder",     folder);
      form.append("signature",  params.signature);
      form.append("timestamp",  String(params.timestamp));
      form.append("api_key",    params.apiKey);

      const uploadRes = await fetch(
        `https://api.cloudinary.com/v1_1/${params.cloudName}/auto/upload`,
        { method: "POST", body: form },
      );
      if (!uploadRes.ok) throw new Error("Cloudinary upload failed");

      const data = await uploadRes.json() as { public_id: string };
      return data.public_id;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      return null;
    } finally {
      setUploading(false);
    }
  }

  return { upload, uploading, error };
}
