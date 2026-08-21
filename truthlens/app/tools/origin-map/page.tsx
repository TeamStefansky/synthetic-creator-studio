"use client";

// Origin Map - "where did this content come from?" on one geographic map.
// Composes THREE existing capabilities as toggleable layers, all fed by the
// EXISTING APIs (called from the client; no new orchestration route needed):
//   1. Geographic origin + spread - /api/mentions (geolocated observations),
//      with the EARLIEST-observed point marked distinctly and carrying the
//      mandatory rule-2 label, plus a time control for spread-over-time.
//   2. Infrastructure origin (de-CDN) - /api/origin-exposure pins the resolved
//      server country/host, with confidence + evidence + an innocent alternative.
//   3. Propagation graph - NetworkGraph over the amplifier domains (co-appearance),
//      and the origin infra network. Nodes are domains/infra only, never people.
//
// Honest throughout: a layer with no connected source / no data renders a visible
// "not connected" / "no data" state - never a faked one (CLAUDE.md rules 2,3,7).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapPin, ArrowRight, Server, Globe, Share2, Play, Pause, ExternalLink } from "lucide-react";
import WorldMapCanvas, { type WorldMarker } from "@/components/WorldMapCanvas";
import NetworkGraph from "@/components/NetworkGraph";
import ConfidenceBadge, { type ConfidenceLevel } from "@/components/ConfidenceBadge";
import Disclaimer from "@/components/Disclaimer";
import { TYPE_COLORS, outletName } from "@/lib/signal";
import { flagEmoji, countryName } from "@/lib/countries";
import type { MapMention } from "@/lib/mentions-map";
import type { MentionsApiResponse } from "@/lib/signal";
import type { OriginExposureReport } from "@/lib/origin-exposure";
import {
  looksLikeUrl, toDomain, earliestObserved, timeSpan, originServerPoints,
  buildOriginExposureNetwork, buildAmplifierNetwork,
  EARLIEST_LABEL, ORIGIN_SERVER_ALT,
} from "@/lib/origin-map";
import { recordSearch } from "@/lib/clues/record";

const EARLIEST_RING = "#22D3EE"; // cyan - matches the influence-map "earliest" ring
const INFRA_COLOR = "#F87171";   // red - resolved origin-server pins

type Layers = { geo: boolean; infra: boolean; propagation: boolean };

export default function OriginMapPage() {
  const [input, setInput] = useState("");
  const [entity, setEntity] = useState("");   // the term/domain actually scanned
  const [isUrl, setIsUrl] = useState(false);
  const [mentions, setMentions] = useState<MapMention[] | null>(null);
  const [mentionsErr, setMentionsErr] = useState("");
  const [report, setReport] = useState<OriginExposureReport | null>(null);
  const [reportErr, setReportErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [layers, setLayers] = useState<Layers>({ geo: true, infra: true, propagation: true });
  const [selected, setSelected] = useState<string | null>(null);

  // Time control (spread over time). t = fraction 0..1 of the observed span.
  const [t, setT] = useState(1);
  const [playing, setPlaying] = useState(false);
  const playRef = useRef<number | null>(null);

  const scan = useCallback(async (value?: string) => {
    const raw = (value ?? input).trim();
    if (raw.length < 2) return;
    const url = looksLikeUrl(raw);
    const term = url ? toDomain(raw) : raw;
    setLoading(true);
    setIsUrl(url);
    setEntity(term);
    setMentions(null); setReport(null);
    setMentionsErr(""); setReportErr("");
    setSelected(null); setT(1); setPlaying(false);

    // Geographic layer - always (term, or the URL's domain as the term).
    const mentionsP = (async () => {
      try {
        const r = await fetch(`/api/mentions?entity=${encodeURIComponent(term)}`);
        const txt = await r.text();
        let json: MentionsApiResponse & { error?: string };
        try { json = JSON.parse(txt); } catch { throw new Error(txt.slice(0, 160) || "unreadable response"); }
        if (!r.ok) throw new Error(json.error || `scan failed (${r.status})`);
        setMentions(json.mentions || []);
        recordSearch("origin-map", term, `Origin Map: ${term}`, json);
      } catch (e: any) {
        setMentionsErr(e?.message || "mentions unavailable");
        setMentions([]);
      }
    })();

    // Infrastructure layer - only when the input is a URL / domain.
    const reportP = url
      ? (async () => {
          try {
            const r = await fetch("/api/origin-exposure", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ domain: term }),
            });
            const txt = await r.text();
            let data: any;
            try { data = JSON.parse(txt); } catch {
              throw new Error(r.status === 504 ? "The audit took too long for this domain." : txt.slice(0, 160) || `audit failed (${r.status})`);
            }
            if (!r.ok) throw new Error(data.error || "audit failed");
            setReport(data);
          } catch (e: any) {
            setReportErr(e?.message || "origin exposure unavailable");
          }
        })()
      : Promise.resolve();

    await Promise.all([mentionsP, reportP]);
    setLoading(false);
  }, [input]);

  // Time span of the observed data.
  const span = useMemo(() => (mentions ? timeSpan(mentions) : null), [mentions]);
  const cutoff = useMemo(() => (span ? span[0] + (span[1] - span[0]) * t : Infinity), [span, t]);
  const cutoffLabel = useMemo(() => (span && t < 1 ? new Date(cutoff).toISOString().slice(0, 10) : "all"), [span, cutoff, t]);

  const earliest = useMemo(() => (mentions ? earliestObserved(mentions) : null), [mentions]);
  const infraPoints = useMemo(() => originServerPoints(report), [report]);

  // Compose the marker set from the active layers + the time cutoff.
  const markers = useMemo<WorldMarker[]>(() => {
    const out: WorldMarker[] = [];
    if (layers.geo && mentions) {
      mentions.forEach((m, idx) => {
        if (typeof m.lat !== "number" || typeof m.lon !== "number") return;
        const ts = m.timestamp ? Date.parse(m.timestamp) : NaN;
        // Undated observations always show; dated ones respect the time cutoff.
        if (!Number.isNaN(ts) && ts > cutoff) return;
        const isEarliest = earliest?.idx === idx;
        out.push({
          id: `m${idx}`,
          lat: m.lat, lon: m.lon,
          color: TYPE_COLORS[m.sourceType] || "#A98BF0",
          r: isEarliest ? 5 : 3.4,
          ring: isEarliest ? EARLIEST_RING : undefined,
          label: outletName(m.source, m.account),
          title: isEarliest
            ? `EARLIEST OBSERVED - ${EARLIEST_LABEL}\n${outletName(m.source, m.account)} · ${m.timestamp || "undated"}`
            : `${outletName(m.source, m.account)} · ${m.country || "?"}${m.timestamp ? " · " + m.timestamp.slice(0, 10) : ""}`,
        });
      });
    }
    if (layers.infra) {
      infraPoints.forEach((p, i) => {
        out.push({
          id: `infra${i}`,
          lat: p.lat, lon: p.lon,
          color: INFRA_COLOR, r: 5, shape: "pin", ring: INFRA_COLOR,
          label: `${p.ip}`,
          title: `RESOLVED ORIGIN SERVER (de-CDN)\n${p.ip} · ${p.flag} ${p.countryLabel}${p.provider ? " · " + p.provider : ""}\n${ORIGIN_SERVER_ALT}`,
        });
      });
    }
    return out;
  }, [layers.geo, layers.infra, mentions, cutoff, earliest, infraPoints]);

  // Play control: sweep t from 0 to 1.
  useEffect(() => {
    if (!playing || !span) return;
    if (t >= 1) setT(0);
    playRef.current = window.setInterval(() => {
      setT((prev) => {
        const next = prev + 0.04;
        if (next >= 1) { setPlaying(false); return 1; }
        return next;
      });
    }, 200);
    return () => { if (playRef.current) window.clearInterval(playRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, span]);

  const amplifier = useMemo(
    () => (mentions ? buildAmplifierNetwork(entity, mentions) : { network: { nodes: [], edges: [] }, domains: [] }),
    [mentions, entity],
  );
  const originNetwork = useMemo(() => buildOriginExposureNetwork(report), [report]);

  const selMention = useMemo(() => {
    if (!selected || !mentions) return null;
    if (selected.startsWith("m")) {
      const idx = Number(selected.slice(1));
      return mentions[idx] || null;
    }
    return null;
  }, [selected, mentions]);

  const geoCount = markers.filter((m) => m.id.startsWith("m")).length;
  const totalGeo = mentions?.filter((m) => typeof m.lat === "number").length ?? 0;
  const scanned = mentions !== null || report !== null;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <MapPin className="h-6 w-6 text-brand-soft" />
          <h1 className="font-display text-2xl font-bold">
            Origin <span className="gradient-text">Map</span>
          </h1>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-ink-secondary">
          “Where did this content come from?” on one map. Enter a <span className="text-ink">topic/term</span> to plot
          geolocated observations and their spread, or a <span className="text-ink">URL/domain</span> to also pin the
          resolved origin server behind a CDN. The earliest observed point is marked distinctly - and it is{" "}
          <span className="text-ink">not</span> a claim about the true source.
        </p>
      </div>

      <div className="card">
        <form
          onSubmit={(e) => { e.preventDefault(); if (input.trim().length >= 2) scan(); }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            dir="auto"
            placeholder="A topic/term (e.g. Wolt) or a URL/domain (e.g. example.com)"
            className="w-full rounded-xl border border-white/15 bg-bg-elev px-4 py-3 text-base outline-none transition focus:border-brand"
          />
          <button type="submit" className="btn shrink-0" disabled={loading || input.trim().length < 2}>
            {loading ? "Mapping…" : <>Map origin <ArrowRight className="h-4 w-4" /></>}
          </button>
        </form>
        {scanned && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="label-muted mr-1">Layers</span>
            {([
              ["geo", "Geographic", Globe],
              ["infra", "Infrastructure", Server],
              ["propagation", "Propagation", Share2],
            ] as [keyof Layers, string, any][]).map(([k, lbl, Icon]) => (
              <button
                key={k}
                onClick={() => setLayers((s) => ({ ...s, [k]: !s[k] }))}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition ${
                  layers[k] ? "border-brand/50 bg-brand/10 text-white" : "border-white/10 text-ink-secondary hover:text-white"
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {lbl}
              </button>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-ink-secondary">
          Uses connected public sources only. A URL/domain adds the de-CDN infrastructure layer; a bare term does not.
          Results are cached per day for reproducibility.
        </p>
      </div>

      {!scanned && !loading && (
        <div className="card text-sm text-ink-secondary">
          Enter a term or URL above. TruthLens sweeps connected public sources, plots where the content was observed,
          marks the earliest observation (labeled as observed, not the origin), and - for a URL - reveals the true
          server behind any CDN. Nothing is invented: a layer with no connected source shows an honest “not connected” state.
        </div>
      )}

      {scanned && (
        <>
          {/* ---- Layer 1: Geographic origin + spread ---- */}
          {layers.geo && (
            <div className="card space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="label-muted flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" /> Geographic origin + spread</div>
                <span className="text-xs text-ink-secondary">
                  {mentions === null ? "…" : `${geoCount}/${totalGeo} geolocated observation(s)`}
                </span>
              </div>

              {mentions !== null && totalGeo === 0 ? (
                <div className="rounded-lg border border-white/10 bg-black/20 p-4 text-sm text-ink-secondary">
                  {mentionsErr
                    ? <>Mentions source not connected - {mentionsErr}.</>
                    : <>No geolocated observations of “{entity}” from the connected sources. This is a real “none observed” result, not an error.</>}
                </div>
              ) : (
                <>
                  <WorldMapCanvas markers={markers} onSelect={setSelected} selectedId={selected} />

                  {/* time control */}
                  {span && (
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setPlaying((p) => !p)}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/15 text-ink-secondary hover:text-white"
                        aria-label={playing ? "Pause" : "Play spread over time"}
                      >
                        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </button>
                      <input
                        type="range" min={0} max={1} step={0.01} value={t}
                        onChange={(e) => { setPlaying(false); setT(Number(e.target.value)); }}
                        className="w-full accent-brand"
                        aria-label="Show observations up to this date"
                      />
                      <span className="w-24 shrink-0 text-right font-mono text-xs text-ink-secondary">
                        ≤ {cutoffLabel}
                      </span>
                    </div>
                  )}
                  {!span && mentions && totalGeo > 0 && (
                    <p className="text-xs text-ink-secondary">No timestamps on the geolocated observations - the time control is unavailable (shown honestly, not faked).</p>
                  )}

                  {/* legend + earliest label (rule 2) */}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-ink-secondary">
                    {(["news", "social", "forum", "video"] as const).map((k) => (
                      <span key={k} className="flex items-center gap-1.5">
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: TYPE_COLORS[k] }} /> {k}
                      </span>
                    ))}
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-2.5 rounded-full ring-2 ring-offset-0" style={{ background: "#A98BF0", boxShadow: `0 0 0 2px ${EARLIEST_RING}` }} />
                      Earliest observed
                    </span>
                  </div>
                  {earliest && (
                    <div className="rounded-lg border border-cyan-400/30 bg-cyan-400/5 p-3 text-xs">
                      <div className="flex items-center gap-2 text-cyan-200/90">
                        <span className="font-semibold">Earliest observed</span>
                        <ConfidenceBadge level="Low" label="as origin evidence" />
                      </div>
                      <p className="mt-1 text-ink-secondary">
                        Marked in cyan on the map. <strong className="text-cyan-200/90">{EARLIEST_LABEL}.</strong> The
                        earliest item we collected can pre-date our collection window, sit behind a paywall, or have been
                        syndicated - treat it as a lead to verify, not the source.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* selected observation detail */}
          {selMention && (
            <div className="card">
              <div className="mb-1 flex items-center justify-between">
                <div className="label-muted">Selected observation</div>
                <button className="text-xs text-ink-secondary hover:text-white" onClick={() => setSelected(null)}>close ✕</button>
              </div>
              <div className="text-sm text-ink" dir="auto">{selMention.text?.slice(0, 220) || "(no text)"}</div>
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-ink-secondary">
                <span>{outletName(selMention.source, selMention.account)}</span>
                {selMention.country && <span>· {flagEmoji(selMention.country)} {countryName(selMention.country) || selMention.country}</span>}
                {selMention.timestamp && <span>· {selMention.timestamp.slice(0, 10)}</span>}
                {selMention.url && (
                  <a href={selMention.url} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-brand-soft hover:underline">
                    open source <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          )}

          {/* ---- Layer 2: Infrastructure origin (de-CDN) ---- */}
          {layers.infra && (
            <div className="card space-y-3">
              <div className="label-muted flex items-center gap-1.5"><Server className="h-3.5 w-3.5" /> Infrastructure origin (de-CDN)</div>
              {!isUrl ? (
                <p className="text-sm text-ink-secondary">
                  Enter a <span className="text-ink">URL or domain</span> (not a bare term) to resolve the true server behind a CDN.
                  This layer reads only public Certificate Transparency + DNS records; it never probes the origin.
                </p>
              ) : report === null ? (
                <p className="text-sm text-ink-secondary">
                  {reportErr ? <>Origin-exposure source not connected - {reportErr}.</> : "Resolving origin exposure…"}
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-ink-secondary">
                    <span className="text-ink">{report.domain}</span>
                    <span>· CDN: {report.cdn}</span>
                    <span>· {report.namesChecked} names checked</span>
                    <ConfidenceBadge level={(report.confidence as ConfidenceLevel) || "Unknown"} label="origin exposure" />
                  </div>

                  {report.evidence.length > 0 && (
                    <ul className="space-y-1 text-sm text-ink-secondary">
                      {report.evidence.map((e, i) => (
                        <li key={i} className="flex gap-2"><span className="text-brand-soft">·</span><span>{e}</span></li>
                      ))}
                    </ul>
                  )}

                  {infraPoints.length > 0 ? (
                    <div className="overflow-x-auto scroll-thin">
                      <table className="w-full text-left text-sm">
                        <thead className="text-ink-secondary"><tr><th className="py-1 pr-4 font-medium">Resolved server IP</th><th className="py-1 pr-4 font-medium">Country</th><th className="py-1 font-medium">Provider</th></tr></thead>
                        <tbody className="font-mono text-xs">
                          {infraPoints.map((p, i) => (
                            <tr key={i} className="border-t border-white/5">
                              <td className="py-1 pr-4 text-risk-high">{p.ip}</td>
                              <td className="py-1 pr-4 text-ink-secondary">{p.flag} {p.countryLabel}</td>
                              <td className="py-1 text-ink-secondary">{p.provider || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-ink-secondary">
                      No resolved origin-server candidates with a known country to pin on the map
                      {report.candidates.length > 0 ? " (candidates found but not geolocated - shown honestly, not placed)" : ""}. Band: {report.band}.
                    </p>
                  )}

                  <p className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 text-sm text-yellow-200/90">
                    <strong>Could also be explained by:</strong> {report.alternative || ORIGIN_SERVER_ALT}
                  </p>

                  {originNetwork.nodes.length > 1 && (
                    <div>
                      <div className="label-muted mb-2">Origin network (domain → subdomains → resolved / historical IPs)</div>
                      <NetworkGraph network={originNetwork} />
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ---- Layer 3: Propagation graph ---- */}
          {layers.propagation && (
            <div className="card space-y-3">
              <div className="label-muted flex items-center gap-1.5"><Share2 className="h-3.5 w-3.5" /> Propagation - amplifier domains</div>
              {amplifier.network.nodes.length > 1 ? (
                <>
                  <NetworkGraph network={amplifier.network} />
                  <p className="text-xs text-ink-secondary">
                    The searched term linked to the publisher <strong>domains</strong> that carried it across the collected
                    mentions. Nodes are domains only - never an account handle or a person. A line means “appeared in
                    collected mentions” (a co-appearance observation), <span className="text-ink">not</span> proof of
                    coordination: this can be ordinary coverage, syndication, or criticism.
                  </p>
                </>
              ) : (
                <p className="text-sm text-ink-secondary">
                  {mentions === null
                    ? "…"
                    : "No amplifier domains to graph - the collected mentions carried no resolvable publisher domains. Shown honestly, not faked."}
                </p>
              )}
            </div>
          )}
        </>
      )}

      <Disclaimer variant="inline" />
    </div>
  );
}
