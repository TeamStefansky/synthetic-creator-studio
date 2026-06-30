// Email header-tracing endpoint. Works on raw email source the user possesses.

import { NextRequest, NextResponse } from "next/server";
import { traceEmail } from "@/lib/email-trace";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  let raw: string;
  try {
    const body = await req.json();
    raw = body.raw || body.headers || "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!raw || !/received:/i.test(raw)) {
    return NextResponse.json(
      { error: "Paste raw email source including the Received: headers." },
      { status: 400 },
    );
  }

  try {
    const result = await traceEmail(raw);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Trace failed" }, { status: 500 });
  }
}
