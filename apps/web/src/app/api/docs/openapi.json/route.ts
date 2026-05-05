import { NextResponse } from "next/server";

import { generateSpec } from "@quadstack/api/openapi";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const baseUrl = new URL(req.url).origin;
  const spec = await generateSpec(baseUrl);
  return NextResponse.json(spec);
}
