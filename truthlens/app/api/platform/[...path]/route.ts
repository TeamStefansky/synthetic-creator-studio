// Proxy to the narrative-intel platform API (Stage 6 dashboard backend).
//
// The dashboard UI calls same-origin `/api/platform/...`; this route forwards to
// the FastAPI service at NARRATIVE_API_URL, keeping the (optional) API key on the
// server. Degrades gracefully: when NARRATIVE_API_URL is unset or the upstream is
// unreachable it returns { unavailable: true } with a 503 so the UI can show a
// friendly "connect the platform" state instead of crashing.

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const BASE = (process.env.NARRATIVE_API_URL || "").replace(/\/+$/, "");
const KEY = process.env.NARRATIVE_API_KEY || "";

function unavailable(reason: string) {
  return NextResponse.json({ unavailable: true, reason }, { status: 503 });
}

async function forward(req: NextRequest, path: string[]) {
  if (!BASE) {
    return unavailable(
      "NARRATIVE_API_URL is not configured. Point it at the narrative-intel service to enable the dashboard."
    );
  }
  const search = req.nextUrl.search || "";
  const url = `${BASE}/api/${path.join("/")}${search}`;
  const headers: Record<string, string> = { accept: "application/json" };
  if (KEY) headers["x-api-key"] = KEY;

  const init: RequestInit = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    const body = await req.text();
    if (body) {
      headers["content-type"] = "application/json";
      init.body = body;
    }
  }

  try {
    const res = await fetch(url, { ...init, cache: "no-store" });
    const text = await res.text();
    const contentType = res.headers.get("content-type") || "application/json";
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": contentType },
    });
  } catch (err: any) {
    return unavailable(`Could not reach the platform API: ${err?.message || "network error"}`);
  }
}

export async function GET(req: NextRequest, ctx: { params: { path: string[] } }) {
  return forward(req, ctx.params.path);
}

export async function POST(req: NextRequest, ctx: { params: { path: string[] } }) {
  return forward(req, ctx.params.path);
}

export async function DELETE(req: NextRequest, ctx: { params: { path: string[] } }) {
  return forward(req, ctx.params.path);
}
