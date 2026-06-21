// Runtime reverse-proxy for the FastAPI backend.
// The browser calls same-origin /api/*; this handler forwards to BACKEND_URL
// at request time, so the same image works in dev, Docker, and any host
// without a rebuild. Streams request/response bodies (incl. binary assets).
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Normalize BACKEND_URL: accept a full URL, or a bare host (Render fromService),
// defaulting the scheme to http for local hosts and https otherwise.
function resolveBackend(): string {
  const raw = (process.env.BACKEND_URL || "http://localhost:8000").trim().replace(/\/$/, "");
  if (/^https?:\/\//.test(raw)) return raw;
  const isLocal = /^(localhost|127\.|backend(:|$)|0\.0\.0\.0)/.test(raw);
  return `${isLocal ? "http" : "https"}://${raw}`;
}

const BACKEND = resolveBackend();

async function proxy(req: NextRequest, path: string[]) {
  const search = req.nextUrl.search;
  const target = `${BACKEND}/${path.join("/")}${search}`;

  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("connection");

  const init: RequestInit = { method: req.method, headers, redirect: "manual" };
  if (!["GET", "HEAD"].includes(req.method)) {
    init.body = await req.arrayBuffer();
  }

  try {
    const res = await fetch(target, init);
    const respHeaders = new Headers(res.headers);
    respHeaders.delete("content-encoding");
    respHeaders.delete("transfer-encoding");
    return new Response(res.body, { status: res.status, headers: respHeaders });
  } catch (e) {
    return Response.json(
      { error: "backend_unreachable", detail: `${BACKEND} — ${(e as Error).message}` },
      { status: 502 },
    );
  }
}

type Ctx = { params: { path: string[] } };
export const GET = (req: NextRequest, { params }: Ctx) => proxy(req, params.path);
export const POST = (req: NextRequest, { params }: Ctx) => proxy(req, params.path);
export const PUT = (req: NextRequest, { params }: Ctx) => proxy(req, params.path);
export const PATCH = (req: NextRequest, { params }: Ctx) => proxy(req, params.path);
export const DELETE = (req: NextRequest, { params }: Ctx) => proxy(req, params.path);
