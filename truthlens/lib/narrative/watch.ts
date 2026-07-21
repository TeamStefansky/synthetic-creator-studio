// Continuous Brand Watch - server-side. Watchlist + threat-snapshot history in
// the KV store; scheduled scans recompute each entity against a rolling baseline
// and dispatch an alert when the status escalates. Alerts INFORM - no action is
// ever taken against anyone.

import { kvGetJson, kvSetJson, storeAvailable } from "@/lib/store";
import { collectMentions } from "./sources";
import { computeThreat } from "./threat";
import type { ThreatResult, ThreatStatus } from "./types";

export interface Watch {
  id: string;
  name: string;
  query?: string;
  enabled: boolean;
  lastScore: number | null;
  lastStatus: ThreatStatus | null;
  lastCheckedAt?: string;
}
export interface Snapshot { score: number | null; status: ThreatStatus; total: number; at: string; }
export interface WatchAlert { id: string; entity: string; status: ThreatStatus; score: number | null; title: string; body: string; at: string; delivered: boolean; }

const LIST_KEY = "bw:watch:list";
const ALERTS_KEY = "bw:alerts";
const snapKey = (name: string) => `bw:snap:${name.toLowerCase()}`;
const ORDER: Record<string, number> = { CALM: 0, ELEVATED: 1, UNDER_ATTACK: 2 };
const BASELINE_N = 10;

export function watchAvailable(): boolean {
  return storeAvailable();
}
function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "entity";
}

export async function listWatches(): Promise<Watch[]> {
  return (await kvGetJson<Watch[]>(LIST_KEY)) || [];
}
export async function addWatch(name: string, query?: string): Promise<Watch> {
  const list = await listWatches();
  const existing = list.find((w) => w.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing;
  const w: Watch = { id: slug(name), name, query, enabled: true, lastScore: null, lastStatus: null };
  list.push(w);
  await kvSetJson(LIST_KEY, list);
  return w;
}
export async function removeWatch(id: string): Promise<void> {
  await kvSetJson(LIST_KEY, (await listWatches()).filter((w) => w.id !== id));
}
async function saveWatch(updated: Watch): Promise<void> {
  const list = await listWatches();
  const i = list.findIndex((w) => w.id === updated.id);
  if (i >= 0) { list[i] = updated; await kvSetJson(LIST_KEY, list); }
}

async function snapshots(name: string): Promise<Snapshot[]> {
  return (await kvGetJson<Snapshot[]>(snapKey(name))) || [];
}
async function pushSnapshot(name: string, s: Snapshot): Promise<Snapshot[]> {
  const all = [...(await snapshots(name)), s].slice(-50);
  await kvSetJson(snapKey(name), all);
  return all;
}

export async function recentAlerts(): Promise<WatchAlert[]> {
  return (await kvGetJson<WatchAlert[]>(ALERTS_KEY)) || [];
}
async function pushAlert(a: WatchAlert): Promise<void> {
  const all = [a, ...(await recentAlerts())].slice(0, 50);
  await kvSetJson(ALERTS_KEY, all);
}

async function dispatch(a: WatchAlert): Promise<boolean> {
  let delivered = false;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_ALERT_CHAT_ID;
  const webhook = process.env.ALERT_WEBHOOK_URL;
  const text = `🔔 ${a.title}\n${a.body}`;
  if (token && chat) {
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
      });
      delivered = true;
    } catch { /* best-effort */ }
  }
  if (webhook) {
    try {
      await fetch(webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      delivered = true;
    } catch { /* best-effort */ }
  }
  return delivered;
}

/** Scan one watched entity, snapshot it, and alert on escalation. */
export async function checkWatch(w: Watch): Promise<ThreatResult> {
  const query = w.query || w.name;
  const prior = await snapshots(w.name);
  const totals = prior.map((s) => s.total).slice(-BASELINE_N);
  const baseline = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : undefined;

  const results = await collectMentions(query);
  const result = computeThreat(w.name, results.flatMap((r) => r.mentions), results.map((r) => r.status), baseline);

  const prev = w.lastStatus;
  await pushSnapshot(w.name, { score: result.score, status: result.status, total: result.totalMentions, at: result.generatedAt });
  await saveWatch({ ...w, lastScore: result.score, lastStatus: result.status, lastCheckedAt: result.generatedAt });

  const escalated =
    (prev && prev !== "UNKNOWN" && ORDER[result.status] > (ORDER[prev] ?? -1)) ||
    ((!prev || prev === "UNKNOWN") && result.status === "UNDER_ATTACK");
  if (escalated) {
    const top = result.indicators.filter((i) => i.level !== "Unknown").slice(0, 3)
      .map((i) => `${i.label} ${i.level}`).join(", ");
    const alert: WatchAlert = {
      id: `${w.id}-${Date.parse(result.generatedAt)}`, entity: w.name, status: result.status, score: result.score,
      title: `Brand Watch: '${w.name}' escalated to ${result.status.replace("_", " ").toLowerCase()} (${result.score ?? "?"}/100)`,
      body: `Was ${(prev || "unknown").toLowerCase()}. Drivers: ${top || " - "}. ${result.totalMentions} mentions, ${result.totalAccounts} accounts. Indicators with evidence - not a verdict.`,
      at: result.generatedAt, delivered: false,
    };
    alert.delivered = await dispatch(alert);
    await pushAlert(alert);
  }
  return result;
}

export async function runAllWatched(): Promise<{ checked: number; escalations: number }> {
  const list = (await listWatches()).filter((w) => w.enabled);
  let checked = 0, escalations = 0;
  for (const w of list) {
    try {
      const before = w.lastStatus;
      const res = await checkWatch(w);
      checked++;
      if (before && before !== "UNKNOWN" && ORDER[res.status] > (ORDER[before] ?? -1)) escalations++;
    } catch { /* failure isolation - one entity never aborts the batch */ }
  }
  return { checked, escalations };
}
