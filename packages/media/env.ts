import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export function mediaEnv() {
  return createEnv({
    server: {
      CLOUDINARY_CLOUD_NAME: z.string().min(1),
      CLOUDINARY_API_KEY:    z.string().min(1),
      CLOUDINARY_API_SECRET: z.string().min(1),
    },
    clientPrefix: "NEXT_PUBLIC_",
    client: {
      NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: z.string().min(1),
    },
    runtimeEnv: {
      CLOUDINARY_CLOUD_NAME:             process.env.CLOUDINARY_CLOUD_NAME,
      CLOUDINARY_API_KEY:                process.env.CLOUDINARY_API_KEY,
      CLOUDINARY_API_SECRET:             process.env.CLOUDINARY_API_SECRET,
      NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    },
    skipValidation: !!process.env.CI || process.env.npm_lifecycle_event === "lint",
  });
}
