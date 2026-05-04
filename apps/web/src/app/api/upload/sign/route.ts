import { NextResponse } from "next/server";
import { z } from "zod";

import { getSignedUploadParams } from "@quadstack/media";
import { getSession } from "@quadstack/auth";

const bodySchema = z.object({
  folder: z.string().min(1).max(100),
});

// Allowed upload folders — add more as needed
const ALLOWED_FOLDERS = ["avatars", "covers", "attachments", "products", "courses"];

export async function POST(req: Request) {
  // Require authentication before issuing signed upload params
  const session = await getSession(req.headers);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = bodySchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!ALLOWED_FOLDERS.includes(body.data.folder)) {
    return NextResponse.json({ error: "Folder not allowed" }, { status: 400 });
  }

  const params = await getSignedUploadParams(body.data.folder, {
    maxBytes: 10 * 1024 * 1024, // 10 MB max
  });

  return NextResponse.json(params);
}
