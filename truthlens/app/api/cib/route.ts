// CIB analysis endpoint - collects public mentions of an entity and grades a
// Coordination Likelihood with raw evidence. Server-side. Never attributes to a
// state/actor. Short KV cache to respect source rate limits.

import { NextRequest, NextResponse } from "next/server";
import { collectMentions, enrichCreationDates } from "@/lib/narrative/sources";
import { analyzeCib } from "@/lib/cib/analyze";
import { archiveEvidence } from "@/lib/archive";
import { resolvePlatformProvider } from "@/lib/platform/provider";
import { MODEL_VERSION } from "@/lib/authenticity";
import type { AccountProfile } from "@/lib/authenticity";
import { kvGetJson, kvSetJson, storeAvailable } from "@/lib/store";
import type { CibReport } from "@/lib/cib/analyze";

export const runtime = "nodejs";
export const maxDuration = 60;

const CACHE_MS = 5 * 60_000;

export async function GET(req: NextRequest) {
  const entity = (req.nextUrl.searchParams.get("entity") || "").trim();
  if (entity.length < 2) {
    return NextResponse.json({ error: "entity must be at least 2 characters" }, { status: 400 });
  }
  const key = `cib:${entity.toLowerCase()}`;
  if (storeAvailable()) {
    const cached = await kvGetJson<CibReport>(key);
    if (cached && Date.now() - new Date(cached.generatedAt).getTime() < CACHE_MS) {
      return NextResponse.json({ ...cached, cached: true });
    }
  }
  const results = await collectMentions(entity);
  const mentions = results.flatMap((r) => r.mentions);
  // Enrich account-creation dates (Bluesky) so the creation-clustering signal can
  // graduate above "Not collected" when the data exists. Best-effort, cached.
  await enrichCreationDates(mentions);

  // Platform-account profiles for the top amplifying accounts - only when the
  // env-gated provider is configured; absent → Phase-1 authenticity only.
  let profiles: Record<string, AccountProfile> | undefined;
  const provider = resolvePlatformProvider();
  if (provider) {
    const byAccount = new Map<string, { platform: string; handle: string; count: number }>();
    for (const m of mentions) {
      const id = m.accountId || m.account;
      if (!id || !provider.supports(m.source)) continue;
      const cur = byAccount.get(id);
      if (cur) cur.count++;
      else byAccount.set(id, { platform: m.source, handle: m.account || id, count: 1 });
    }
    const top = [...byAccount.entries()]
      .filter(([, v]) => v.count >= 2)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 8);
    const fetched = await Promise.all(top.map(async ([id, v]) => {
      try { return [id, await provider.fetchAccount(v.platform, v.handle)] as const; }
      catch { return [id, null] as const; } // failure-isolated - never aborts the report
    }));
    const ok = fetched.filter((f): f is [string, AccountProfile] => !!f[1]);
    if (ok.length) profiles = Object.fromEntries(ok);
  }

  const report = analyzeCib(entity, mentions, profiles);
  // Preserve the top evidence URLs (by engagement) before posts change/vanish.
  const topUrls = [...mentions]
    .sort((a, b) => (b.engagement || 0) - (a.engagement || 0))
    .map((m) => m.url);
  report.archives = await archiveEvidence(topUrls);
  const withSources = { ...report, sources: results.map((r) => r.status) };
  if (storeAvailable()) {
    await kvSetJson(key, withSources);
    // Dedicated authenticity snapshot (bw:* family) so assessments are
    // re-openable/comparable over time independently of the CIB cache.
    if (report.authenticity?.length) {
      await kvSetJson(`bw:auth:${entity.toLowerCase()}`, {
        entity,
        accounts: report.authenticity,
        assessed_at: report.generatedAt,
        model_version: MODEL_VERSION,
      });
    }
  }
  return NextResponse.json(withSources);
}
