// Email header tracing endpoint. Accepts { raw: string } (the pasted raw email
// source / headers) and returns an EmailTrace with the reconstructed hop path,
// inferred origin, and spoofing verdict.

import { NextRequest, NextResponse } from "next/server";
import { traceEmail } from "@/lib/email-trace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB of headers is already extreme

export async function POST(req: NextRequest) {
  let body: { raw?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const raw = body.raw ?? "";
  if (!raw.trim()) {
    return NextResponse.json(
      { error: "No email headers provided" },
      { status: 400 }
    );
  }
  if (raw.length > MAX_BYTES) {
    return NextResponse.json({ error: "Input too large" }, { status: 413 });
  }
  if (!/Received:/i.test(raw)) {
    return NextResponse.json(
      { error: "No 'Received:' headers found. Paste the full raw email source." },
      { status: 400 }
    );
  }

  try {
    const trace = await traceEmail(raw);
    return NextResponse.json(trace);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Email trace failed" },
      { status: 500 }
    );
  }
}
