// Social & media intelligence endpoint (on-demand): X amplification/bot
// analysis + AI-generated/deepfake image detection. Both gated behind keys.

import { NextRequest, NextResponse } from "next/server";
import { analyzeSocial } from "@/lib/social";
import { detectImages } from "@/lib/image-detect";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const query = String(body.query || body.domain || "");
  const images: string[] = Array.isArray(body.images) ? body.images : [];

  const [social, media] = await Promise.all([
    analyzeSocial(query).catch(() => null),
    detectImages(images).catch(() => null),
  ]);

  return NextResponse.json({ social, media });
}
