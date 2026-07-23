"use client";

// SIGNAL - Brand Intelligence Grid. A faithful port of the uploaded dashboard's
// look, but wired to TruthLens' server-side /api/mentions instead of a
// client-side LLM call. Every card/marker/panel is a REAL public mention; no
// sentiment or "trend" is fabricated (see lib/signal.ts). Country granularity by
// design - the outlet's country, never a person's location (CLAUDE.md rules
// 1, 4, 5, 7).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildSignal,
  isoDate,
  TYPE_COLORS,
  type MentionsApiResponse,
  type SignalData,
  type SignalMention,
} from "@/lib/signal";
import type { MentionSourceType } from "@/lib/mentions-map";
import { drawLand, project } from "@/lib/signal-grid";

type Filter = "all" | MentionSourceType;

const RECON_STEPS = [
  "Tasking web recon on target brand…",
  "Sweeping GDELT news wires + press APIs…",
  "Listening on Bluesky, Reddit, Hacker News…",
  "Geolocating mention clusters…",
  "Classifying sentiment on collected mentions…",
  "De-duplicating and compiling the grid…",
];

const SENT_ICON: Record<string, string> = { pos: "▲", neg: "▼", neu: "■" };

export default function SignalGrid({ initialEntity = "" }: { initialEntity?: string }) {
  const [entity, setEntity] = useState(initialEntity);
  const [data, setData] = useState<SignalData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState(-1);
  const [step, setStep] = useState(0);
  const [pane, setPane] = useState<"left" | "right">("left"); // mobile tabs
  const [dims, setDims] = useState({ vw: 0, vh: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const scan = useCallback(async (value?: string) => {
    const e = (value ?? entity).trim();
    if (e.length < 2) return;
    setLoading(true);
    setError("");
    setSelected(-1);
    setFilter("all");
    setStep(0);
    try {
      const r = await fetch(`/api/mentions?entity=${encodeURIComponent(e)}&sentiment=1`);
      const txt = await r.text();
      let json: MentionsApiResponse & { error?: string };
      try {
        json = JSON.parse(txt);
      } catch {
        throw new Error(txt.slice(0, 160) || "unreadable response");
      }
      if (!r.ok) throw new Error(json.error || `scan failed (${r.status})`);
      setData(buildSignal(json));
    } catch (err: any) {
      setError(err?.message || "scan failed");
    } finally {
      setLoading(false);
    }
  }, [entity]);

  // Auto-run when opened with a prefilled entity (Monitor "open full" link).
  useEffect(() => {
    if (initialEntity && initialEntity.trim().length >= 2) scan(initialEntity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Animated recon log while scanning (describes the REAL server-side sweep).
  useEffect(() => {
    if (!loading) return;
    setStep(0);
    const id = setInterval(() => setStep((s) => Math.min(s + 1, RECON_STEPS.length - 1)), 900);
    return () => clearInterval(id);
  }, [loading]);

  // Measure the map stage + draw the land dots (canvas). Redraw on resize.
  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;
    const render = () => {
      const rect = stage.getBoundingClientRect();
      const vw = rect.width;
      const vh = rect.height;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = vw * dpr;
      canvas.height = vh * dpr;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawLand(ctx, vw, vh, "#22314F");
      setDims({ vw, vh });
    };
    render();
    const ro = new ResizeObserver(render);
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  const visible = useMemo<SignalMention[]>(() => {
    if (!data) return [];
    return data.mentions.filter((m) => filter === "all" || m.sourceType === filter);
  }, [data, filter]);

  const markers = useMemo(() => {
    if (!data || dims.vw === 0) return [];
    return visible
      .filter((m) => typeof m.lat === "number" && typeof m.lon === "number")
      .map((m) => {
        const [x, y] = project(m.lat as number, m.lon as number, dims.vw, dims.vh);
        const idx = data.mentions.indexOf(m);
        return { idx, x, y, color: TYPE_COLORS[m.sourceType] || "#5EEAD4" };
      });
  }, [visible, data, dims]);

  const selectMention = (idx: number, fromMap: boolean) => {
    setSelected(idx);
    if (fromMap) cardRefs.current[idx]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  const selMention = selected >= 0 ? data?.mentions[selected] : undefined;
  const detailPos = useMemo(() => {
    if (!selMention || typeof selMention.lat !== "number" || dims.vw === 0) return null;
    let [x, y] = project(selMention.lat, selMention.lon as number, dims.vw, dims.vh);
    x = Math.min(Math.max(10, x + 14), Math.max(10, dims.vw - 300));
    y = Math.min(Math.max(10, y - 20), Math.max(10, dims.vh - 190));
    return { x, y };
  }, [selMention, dims]);

  const maxCountry = data?.byCountry[0]?.count || 1;
  const maxType = Math.max(1, ...(data?.byType.map((t) => t.count) || [1]));

  return (
    <div className="sg">
      <style>{CSS}</style>
      <div className="sg-app">
        {/* ---- header ---- */}
        <header className="sg-header">
          <div className="sg-brandmark">
            <b>SIGNAL</b>
            <span>BRAND INTELLIGENCE GRID</span>
          </div>
          <form
            className="sg-searchwrap"
            onSubmit={(e) => {
              e.preventDefault();
              scan();
            }}
          >
            <input
              className="sg-q"
              dir="auto"
              value={entity}
              onChange={(e) => setEntity(e.target.value)}
              placeholder="Enter a brand or term — e.g. Wolt, Nike, Monday.com"
              autoComplete="off"
              aria-label="Brand or term to scan"
            />
            <button className="sg-go" type="submit" disabled={loading || entity.trim().length < 2}>
              {loading ? "SCANNING" : "SCAN"}
            </button>
          </form>
          <div className="sg-status">
            {loading ? (
              <>
                SCANNING <span className="sg-live">●</span>
              </>
            ) : data ? (
              <>
                TARGET: <span style={{ color: "var(--sg-cyan)" }}>{(data.entity || "").toUpperCase()}</span> ·{" "}
                <span className="sg-live">LIVE</span>
              </>
            ) : (
              "STANDBY"
            )}
          </div>
        </header>

        {/* ---- left: signal feed ---- */}
        <aside className={`sg-left ${pane === "left" ? "sg-show" : ""}`}>
          <div className="sg-ph">
            <i />
            SIGNAL FEED
            <span style={{ marginLeft: "auto", color: "var(--sg-cyan)" }}>
              {data ? `${visible.length}/${data.mentions.length}` : ""}
            </span>
          </div>
          <div className="sg-chips">
            {(["all", "news", "social", "forum", "video"] as Filter[]).map((t) => (
              <button
                key={t}
                className={`sg-chip ${filter === t ? "sg-on" : ""}`}
                data-t={t}
                onClick={() => setFilter(t)}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="sg-scroll" ref={feedRef}>
            {!data ? (
              <div className="sg-empty">
                Run a scan to populate the signal feed. Every card is a real public mention pulled from
                connected sources and geolocated on the grid.
              </div>
            ) : visible.length === 0 ? (
              <div className="sg-empty">No signals match this filter.</div>
            ) : (
              visible.map((m) => {
                const idx = data.mentions.indexOf(m);
                const t = m.sourceType;
                return (
                  <div
                    key={idx}
                    ref={(el) => {
                      cardRefs.current[idx] = el;
                    }}
                    className={`sg-m ${selected === idx ? "sg-sel" : ""}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => selectMention(idx, false)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") selectMention(idx, false);
                    }}
                  >
                    <div className="sg-src">
                      <span className={`sg-t sg-t-${t}`}>{t.toUpperCase()}</span>
                      <span style={{ color: "var(--sg-dim)" }}>{m.source}</span>
                      <span className="sg-geo">{m.country || ""}</span>
                    </div>
                    <h4 dir="auto">{m.title}</h4>
                    {m.snippet && <p dir="auto">{m.snippet}</p>}
                    <div className="sg-foot">
                      <span>{m.date}</span>
                      {m.account && <span>· {m.account}</span>}
                      {m.sentiment && (
                        <span
                          className={`sg-s${m.sentiment}`}
                          title={`sentiment: ${m.sentiment} (confidence ${Math.round((m.sentimentConfidence || 0) * 100)}%)`}
                          style={{ marginLeft: "auto" }}
                        >
                          {SENT_ICON[m.sentiment]} {m.sentiment}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* ---- map ---- */}
        <div className="sg-mapzone" onClick={(e) => {
          if ((e.target as HTMLElement).closest(".sg-detail") || (e.target as HTMLElement).closest(".sg-marker")) return;
          setSelected(-1);
        }}>
          <div className="sg-stage" ref={stageRef}>
            <canvas ref={canvasRef} className="sg-canvas" />
            <div className="sg-sweep" />
            <svg className="sg-overlay" viewBox={`0 0 ${dims.vw} ${dims.vh}`}>
              {markers.map((mk) => (
                <g
                  key={mk.idx}
                  className="sg-marker"
                  transform={`translate(${mk.x},${mk.y})`}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectMention(mk.idx, true);
                  }}
                >
                  <circle
                    className="sg-pulse"
                    r={7}
                    fill="none"
                    stroke={mk.color}
                    strokeWidth={1.4}
                    style={{ animationDelay: `${(mk.idx % 5) * 0.35}s` }}
                  />
                  <circle r={selected === mk.idx ? 5 : 3.4} fill={mk.color} stroke="#070B12" strokeWidth={1.2} />
                </g>
              ))}
            </svg>
          </div>

          {!data && !loading && (
            <div className="sg-idle">
              <h1>GLOBAL MENTION GRID</h1>
              <div className="sg-big">AWAITING TARGET</div>
              <div className="sg-hint">
                Type a brand above and press SCAN — TruthLens sweeps connected public sources
                <br />
                and plots who is talking, where, across the open web.
              </div>
            </div>
          )}

          {loading && (
            <div className="sg-scanlog">
              <div className="sg-lt">RECON IN PROGRESS</div>
              <div>
                <div className="sg-ln sg-ok">TARGET: {entity.toUpperCase()}</div>
                {RECON_STEPS.slice(0, step + 1).map((s, i) => (
                  <div key={i} className={`sg-ln ${i === step ? "sg-cur" : "sg-ok"}`}>
                    {s}
                  </div>
                ))}
              </div>
            </div>
          )}

          {selMention && detailPos && (
            <div className="sg-detail" style={{ left: detailPos.x, top: detailPos.y, display: "block" }}>
              <button className="sg-x" aria-label="Close" onClick={() => setSelected(-1)}>
                ✕
              </button>
              <div className="sg-src" style={{ color: TYPE_COLORS[selMention.sourceType] }}>
                {selMention.sourceType.toUpperCase()} · {selMention.source}
              </div>
              <h4 dir="auto">{selMention.title}</h4>
              {selMention.snippet && <p dir="auto">{selMention.snippet}</p>}
              <div className="sg-dfoot">
                <span>{isoDate(selMention.timestamp)}</span>
                <span>{selMention.country || ""}</span>
                {selMention.sentiment && (
                  <span className={`sg-s${selMention.sentiment}`}>
                    {SENT_ICON[selMention.sentiment]} {selMention.sentiment}
                  </span>
                )}
              </div>
              {selMention.url && (
                <p style={{ marginBottom: 0 }}>
                  <a href={selMention.url} target="_blank" rel="noopener noreferrer">
                    open source ↗
                  </a>
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="sg-err" style={{ display: "block" }}>
              Scan failed ({error}). Public sources may be throttling — press SCAN to retry.
            </div>
          )}
        </div>

        {/* ---- right: analysis (honest aggregates, no fabricated sentiment) ---- */}
        <aside className={`sg-right ${pane === "right" ? "sg-show" : ""}`}>
          <div className="sg-ph">
            <i />
            ANALYSIS
          </div>
          <div className="sg-scroll">
            <div className={`sg-summary ${data ? "" : "sg-empty"}`} dir="auto">
              {data ? data.summary : "A real, sourced intelligence picture appears here after a scan. No sentiment or trend is invented — every figure traces to a collected public mention."}
            </div>

            {/* Sentiment - server-side classification of the COLLECTED mentions.
                The score is computed from per-mention labels (never asked for as
                one number); no key or no labels -> honest not-connected/Unknown. */}
            <div className="sg-blk">
              <div className="sg-ph sg-sub">
                <i style={{ background: "var(--sg-pos)" }} />
                SENTIMENT
              </div>
              <div className="sg-gauge">
                {!data ? (
                  <div className="sg-empty" style={{ padding: 0 }}>—</div>
                ) : !data.sentiment ? (
                  <div className="sg-empty" style={{ padding: 0 }}>Not requested for this scan.</div>
                ) : !data.sentiment.available ? (
                  <div className="sg-empty" style={{ padding: 0 }}>
                    Not connected — {data.sentiment.reason}
                  </div>
                ) : data.sentiment.score === null ? (
                  <div className="sg-empty" style={{ padding: 0 }}>
                    Unknown — no mention could be labeled.
                  </div>
                ) : (
                  <>
                    <div
                      className="sg-gval"
                      style={{
                        color:
                          data.sentiment.score > 15
                            ? "var(--sg-pos)"
                            : data.sentiment.score < -15
                              ? "var(--sg-neg)"
                              : "var(--sg-text)",
                      }}
                    >
                      {data.sentiment.score > 0 ? "+" : ""}
                      {data.sentiment.score}
                    </div>
                    <div className="sg-gtrack">
                      <div
                        className="sg-gfill"
                        style={
                          data.sentiment.score >= 0
                            ? {
                                left: "50%",
                                right: `${50 - Math.abs(data.sentiment.score) / 2}%`,
                                background: "linear-gradient(90deg, var(--sg-cyan), var(--sg-pos))",
                              }
                            : {
                                right: "50%",
                                left: `${50 - Math.abs(data.sentiment.score) / 2}%`,
                                background: "linear-gradient(90deg, var(--sg-neg), var(--sg-cyan))",
                              }
                        }
                      />
                    </div>
                    <div className="sg-glabels">
                      <span>NEGATIVE</span>
                      <span>NEUTRAL</span>
                      <span>POSITIVE</span>
                    </div>
                    <div className="sg-gmeta">
                      <span className="sg-spos">▲ {data.sentiment.pos}</span>
                      <span className="sg-sneu">■ {data.sentiment.neu}</span>
                      <span className="sg-sneg">▼ {data.sentiment.neg}</span>
                      <span style={{ marginLeft: "auto" }}>
                        labeled {data.sentiment.labeled}/{data.total}
                      </span>
                    </div>
                    <div className="sg-galt">{data.sentiment.alternative}</div>
                  </>
                )}
              </div>
            </div>

            {/* Signal by type - replaces the original's fabricated sentiment gauge. */}
            <div className="sg-blk">
              <div className="sg-ph sg-sub">
                <i style={{ background: "var(--sg-amber)" }} />
                SIGNAL BY TYPE
              </div>
              <div style={{ padding: "10px 14px" }}>
                {!data ? (
                  <div className="sg-empty" style={{ padding: 0 }}>
                    —
                  </div>
                ) : (
                  data.byType.map((t) => (
                    <div key={t.type} className="sg-bar">
                      <div className="sg-bar-label" style={{ color: TYPE_COLORS[t.type] }}>
                        {t.type}
                      </div>
                      <div className="sg-bar-track">
                        <div
                          className="sg-bar-fill"
                          style={{ width: `${(t.count / maxType) * 100}%`, background: TYPE_COLORS[t.type] }}
                        />
                      </div>
                      <div className="sg-bar-num">{t.count}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Where - real geographic breakdown. */}
            <div className="sg-blk">
              <div className="sg-ph sg-sub">
                <i style={{ background: "var(--sg-violet)" }} />
                WHERE (BY COUNTRY)
              </div>
              <div style={{ padding: "8px 14px" }}>
                {!data || data.byCountry.length === 0 ? (
                  <div className="sg-empty" style={{ padding: 0 }}>
                    {data ? "No source reported a country." : "—"}
                  </div>
                ) : (
                  <>
                    {data.byCountry.slice(0, 8).map((c) => (
                      <div key={c.key} className="sg-bar">
                        <div className="sg-bar-label">
                          {c.flag ? `${c.flag} ` : ""}
                          {c.label}
                        </div>
                        <div className="sg-bar-track">
                          <div
                            className="sg-bar-fill"
                            style={{ width: `${(c.count / maxCountry) * 100}%`, background: "var(--sg-cyan)" }}
                          />
                        </div>
                        <div className="sg-bar-num">{c.count}</div>
                      </div>
                    ))}
                    {data.countryUnknown > 0 && (
                      <div style={{ fontSize: 10, color: "var(--sg-dim)", marginTop: 6 }}>
                        {data.countryUnknown} with no reported country.
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Who's talking - most-active ACCOUNTS/outlets (never people). */}
            <div className="sg-blk">
              <div className="sg-ph sg-sub">
                <i style={{ background: "var(--sg-rose)" }} />
                MOST ACTIVE ACCOUNTS
              </div>
              <div>
                {!data || data.talkers.length === 0 ? (
                  <div className="sg-empty">—</div>
                ) : (
                  data.talkers.map((t, i) => (
                    <div key={i} className="sg-talker">
                      <b dir="auto">{t.name}</b>{" "}
                      <span style={{ color: "var(--sg-dim)", fontSize: 10 }}>· {t.source}</span>
                      <em>{t.count} mention{t.count === 1 ? "" : "s"}</em>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Sources - honest connected / not-connected (rule 7). */}
            {data && (
              <div className="sg-blk" style={{ borderBottom: 0 }}>
                <div className="sg-ph sg-sub">
                  <i style={{ background: "var(--sg-sky)" }} />
                  SOURCES
                </div>
                <div className="sg-sources">
                  {data.sources.map((s) => (
                    <span
                      key={s.source}
                      className={`sg-srcchip ${s.connected ? "" : "sg-off"}`}
                      title={s.connected ? s.error || "" : s.reason || "not connected"}
                    >
                      {s.source}
                      {s.connected ? ` · ${s.count}` : " · off"}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* ---- mobile tabs ---- */}
        <div className="sg-tabs">
          <button className={pane === "left" ? "sg-on" : ""} onClick={() => setPane("left")}>
            FEED
          </button>
          <button className={pane === "right" ? "sg-on" : ""} onClick={() => setPane("right")}>
            ANALYSIS
          </button>
        </div>

        {/* ---- timeline ticker ---- */}
        <div className="sg-ticker">
          <div className="sg-lbl">TIMELINE</div>
          <div className="sg-tickitems" style={data && data.timeline.length ? undefined : { animation: "none" }}>
            {data && data.timeline.length ? (
              [...data.timeline, ...data.timeline].map((e, i) => (
                <span key={i} className="sg-tk">
                  <b>{e.date}</b>
                  <span dir="auto">{e.event}</span>
                </span>
              ))
            ) : (
              <span className="sg-tk">No dated events yet — run a scan.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Scoped console styling (all selectors under .sg / .sg-* so nothing leaks into
// the rest of the app). Ported from the uploaded dashboard, dark grid aesthetic.
const CSS = `
.sg{
  --sg-ink:#070B12; --sg-panel:#0C1220; --sg-panel-2:#101829; --sg-line:#1B2740;
  --sg-dot:#22314F; --sg-text:#C9D6EA; --sg-dim:#5E7194; --sg-cyan:#5EEAD4;
  --sg-amber:#FFB454; --sg-rose:#F472B6; --sg-violet:#A78BFA; --sg-sky:#7DD3FC;
  --sg-pos:#4ADE80; --sg-neg:#FB7185;
  --sg-mono:ui-monospace,"SF Mono","JetBrains Mono",Consolas,monospace;
  color:var(--sg-text); font-family:var(--sg-mono); font-size:13px; line-height:1.5;
}
.sg *{box-sizing:border-box}
.sg a{color:var(--sg-cyan);text-decoration:none}
.sg a:hover{text-decoration:underline}
.sg-app{
  display:grid; height:min(82vh,860px); min-height:560px;
  grid-template-rows:52px 1fr 34px; grid-template-columns:320px 1fr 288px;
  grid-template-areas:"top top top" "left map right" "tick tick tick";
  border:1px solid var(--sg-line); border-radius:12px; overflow:hidden; background:var(--sg-ink);
}
.sg-header{grid-area:top;display:flex;align-items:center;gap:14px;padding:0 14px;
  border-bottom:1px solid var(--sg-line);background:var(--sg-panel)}
.sg-brandmark{display:flex;align-items:baseline;gap:8px;white-space:nowrap}
.sg-brandmark b{font-size:15px;letter-spacing:.32em;color:var(--sg-cyan);font-weight:700}
.sg-brandmark span{font-size:9px;color:var(--sg-dim);letter-spacing:.12em}
.sg-searchwrap{flex:1;display:flex;gap:8px;max-width:520px}
.sg-q{flex:1;background:var(--sg-ink);border:1px solid var(--sg-line);color:var(--sg-text);
  padding:8px 12px;font-size:13px;border-radius:2px;font-family:var(--sg-mono);outline:none}
.sg-q::placeholder{color:var(--sg-dim)}
.sg-q:focus{border-color:var(--sg-cyan)}
.sg-go{background:var(--sg-cyan);color:#04211C;border:0;padding:8px 18px;font-weight:700;
  letter-spacing:.14em;border-radius:2px;font-size:12px;font-family:var(--sg-mono);cursor:pointer}
.sg-go:disabled{background:var(--sg-line);color:var(--sg-dim);cursor:wait}
.sg-status{margin-left:auto;font-size:11px;color:var(--sg-dim);letter-spacing:.1em;white-space:nowrap}
.sg-live{color:var(--sg-pos)}
.sg-left,.sg-right{background:var(--sg-panel);overflow:hidden;display:flex;flex-direction:column;min-height:0}
.sg-left{grid-area:left;border-right:1px solid var(--sg-line)}
.sg-right{grid-area:right;border-left:1px solid var(--sg-line)}
.sg-ph{padding:10px 14px;border-bottom:1px solid var(--sg-line);font-size:10px;letter-spacing:.24em;
  color:var(--sg-dim);display:flex;align-items:center;gap:8px;flex-shrink:0}
.sg-ph.sg-sub{border-top:0}
.sg-ph i{width:6px;height:6px;background:var(--sg-cyan);display:inline-block;border-radius:50%}
.sg-scroll{overflow-y:auto;flex:1;min-height:0}
.sg-scroll::-webkit-scrollbar{width:8px}
.sg-scroll::-webkit-scrollbar-thumb{background:var(--sg-line)}
.sg-empty{padding:20px 16px;color:var(--sg-dim);font-size:12px}
.sg-chips{display:flex;gap:6px;padding:8px 12px;border-bottom:1px solid var(--sg-line);flex-wrap:wrap;flex-shrink:0}
.sg-chip{background:transparent;border:1px solid var(--sg-line);color:var(--sg-dim);font-size:10px;
  letter-spacing:.08em;padding:3px 9px;border-radius:2px;font-family:var(--sg-mono);cursor:pointer}
.sg-chip.sg-on{color:var(--sg-ink)}
.sg-chip[data-t="all"].sg-on{background:var(--sg-text);border-color:var(--sg-text)}
.sg-chip[data-t="news"].sg-on{background:var(--sg-amber);border-color:var(--sg-amber)}
.sg-chip[data-t="social"].sg-on{background:var(--sg-rose);border-color:var(--sg-rose)}
.sg-chip[data-t="forum"].sg-on{background:var(--sg-violet);border-color:var(--sg-violet)}
.sg-chip[data-t="video"].sg-on{background:var(--sg-sky);border-color:var(--sg-sky)}
.sg-m{padding:11px 14px;border-bottom:1px solid var(--sg-line);cursor:pointer;position:relative}
.sg-m:hover,.sg-m.sg-sel{background:var(--sg-panel-2)}
.sg-m.sg-sel::before{content:"";position:absolute;left:0;top:0;bottom:0;width:2px;background:var(--sg-cyan)}
.sg-src{font-size:10px;letter-spacing:.1em;display:flex;gap:8px;align-items:center;margin-bottom:3px}
.sg-t{font-weight:700}
.sg-t-news{color:var(--sg-amber)} .sg-t-social{color:var(--sg-rose)}
.sg-t-forum{color:var(--sg-violet)} .sg-t-video{color:var(--sg-sky)}
.sg-geo{color:var(--sg-dim);margin-left:auto}
.sg-m h4{font-size:12.5px;font-weight:600;color:var(--sg-text);margin:0}
.sg-m p{font-size:11.5px;color:var(--sg-dim);margin-top:3px}
.sg-foot{display:flex;gap:10px;margin-top:5px;font-size:10px;color:var(--sg-dim)}
.sg-blk{border-bottom:1px solid var(--sg-line)}
.sg-summary{padding:12px 14px;font-size:12px;color:var(--sg-text);border-bottom:1px solid var(--sg-line)}
.sg-bar{display:flex;align-items:center;gap:8px;margin:5px 0;font-size:11px}
.sg-bar-label{width:92px;flex-shrink:0;color:var(--sg-text);text-transform:capitalize;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sg-bar-track{flex:1;height:6px;background:var(--sg-ink);border-radius:3px;overflow:hidden}
.sg-bar-fill{height:6px;border-radius:3px;transition:width .5s ease;min-width:2px}
.sg-bar-num{width:26px;text-align:right;color:var(--sg-dim)}
.sg-gauge{padding:12px 14px}
.sg-gval{text-align:center;font-size:22px;font-weight:700;margin-bottom:8px;letter-spacing:.05em}
.sg-gtrack{height:6px;background:var(--sg-ink);border:1px solid var(--sg-line);position:relative;border-radius:3px}
.sg-gtrack::after{content:"";position:absolute;left:50%;top:-3px;bottom:-3px;width:1px;background:var(--sg-line)}
.sg-gfill{position:absolute;top:0;bottom:0;border-radius:3px;transition:all .9s ease}
.sg-glabels{display:flex;justify-content:space-between;font-size:9px;color:var(--sg-dim);margin-top:6px;letter-spacing:.08em}
.sg-gmeta{display:flex;gap:12px;font-size:10.5px;color:var(--sg-dim);margin-top:8px}
.sg-galt{font-size:9.5px;color:var(--sg-dim);margin-top:7px;line-height:1.45}
.sg-spos{color:var(--sg-pos)} .sg-sneg{color:var(--sg-neg)} .sg-sneu{color:var(--sg-dim)}
.sg-talker{padding:8px 14px;border-bottom:1px solid var(--sg-line);font-size:11.5px}
.sg-talker:last-child{border-bottom:0}
.sg-talker b{color:var(--sg-text)}
.sg-talker em{color:var(--sg-dim);font-style:normal;font-size:10.5px;display:block}
.sg-sources{display:flex;flex-wrap:wrap;gap:6px;padding:10px 14px}
.sg-srcchip{border:1px solid var(--sg-line);color:var(--sg-dim);font-size:10px;padding:2px 7px;border-radius:2px}
.sg-srcchip.sg-off{border-color:#4a3a12;color:#b9902f;background:rgba(255,180,84,.05)}
.sg-mapzone{grid-area:map;position:relative;overflow:hidden;
  background:radial-gradient(ellipse at 50% 40%, #0B1322 0%, var(--sg-ink) 70%)}
.sg-stage{position:absolute;inset:0}
.sg-canvas,.sg-overlay{position:absolute;left:0;top:0;width:100%;height:100%}
.sg-overlay{overflow:visible}
.sg-sweep{position:absolute;inset:-40%;pointer-events:none;opacity:.5;
  background:conic-gradient(from 0deg, transparent 0deg, transparent 342deg, rgba(94,234,212,.05) 356deg, rgba(94,234,212,.14) 360deg);
  animation:sg-spin 14s linear infinite}
@keyframes sg-spin{to{transform:rotate(360deg)}}
.sg-marker{cursor:pointer}
.sg-pulse{transform-origin:center;animation:sg-pulse 2.4s ease-out infinite}
@keyframes sg-pulse{0%{opacity:.7;transform:scale(.4)}80%{opacity:0;transform:scale(2.6)}100%{opacity:0}}
@media (prefers-reduced-motion:reduce){.sg-sweep{animation:none;display:none}.sg-pulse{animation:none}}
.sg-idle{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:10px;pointer-events:none;text-align:center;padding:20px}
.sg-idle h1{font-size:12px;letter-spacing:.4em;color:var(--sg-dim);font-weight:400;margin:0}
.sg-idle .sg-big{font-size:24px;letter-spacing:.18em;color:var(--sg-text);font-weight:700}
.sg-idle .sg-hint{font-size:11px;color:var(--sg-dim)}
.sg-scanlog{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
  background:rgba(7,11,18,.88);border:1px solid var(--sg-line);min-width:320px;max-width:88%;
  padding:16px 18px;backdrop-filter:blur(3px)}
.sg-lt{font-size:10px;letter-spacing:.3em;color:var(--sg-cyan);margin-bottom:10px}
.sg-ln{font-size:11.5px;color:var(--sg-dim);padding:1.5px 0}
.sg-ln.sg-ok{color:var(--sg-text)}
.sg-cur::after{content:"▌";color:var(--sg-cyan);animation:sg-blink 1s steps(1) infinite;margin-left:4px}
@keyframes sg-blink{50%{opacity:0}}
.sg-detail{position:absolute;background:var(--sg-panel-2);border:1px solid var(--sg-line);
  width:288px;padding:12px 14px;z-index:30;box-shadow:0 10px 30px rgba(0,0,0,.5)}
.sg-detail .sg-x{position:absolute;top:6px;right:8px;background:none;border:0;color:var(--sg-dim);font-size:14px;cursor:pointer}
.sg-detail h4{font-size:12.5px;margin:2px 0 4px;padding-right:14px}
.sg-detail .sg-src{font-size:10px;letter-spacing:.1em}
.sg-detail p{font-size:11.5px;color:var(--sg-dim);margin:6px 0}
.sg-dfoot{font-size:10px;color:var(--sg-dim);display:flex;gap:10px}
.sg-err{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);
  background:#2A1220;border:1px solid var(--sg-neg);color:#FFD7DE;padding:10px 16px;font-size:12px;max-width:80%}
.sg-ticker{grid-area:tick;border-top:1px solid var(--sg-line);background:var(--sg-panel);
  display:flex;align-items:center;overflow:hidden;white-space:nowrap}
.sg-lbl{padding:0 14px;font-size:10px;letter-spacing:.24em;color:var(--sg-dim);
  border-right:1px solid var(--sg-line);flex-shrink:0;height:100%;display:flex;align-items:center;background:var(--sg-panel)}
.sg-tickitems{display:flex;gap:34px;padding:0 20px;animation:sg-roll 40s linear infinite}
.sg-ticker:hover .sg-tickitems{animation-play-state:paused}
@keyframes sg-roll{from{transform:translateX(0)}to{transform:translateX(-50%)}}
.sg-tk{font-size:11px;color:var(--sg-dim)}
.sg-tk b{color:var(--sg-cyan);font-weight:600;margin-right:8px}
.sg-tabs{display:none}
@media (max-width:940px){
  .sg-app{grid-template-rows:auto 40vh 38px 1fr 34px;grid-template-columns:1fr;
    grid-template-areas:"top" "map" "tabs" "panels" "tick";height:auto}
  .sg-header{flex-wrap:wrap;padding:8px 12px;gap:8px}
  .sg-status{display:none}
  .sg-searchwrap{max-width:none;width:100%}
  .sg-tabs{grid-area:tabs;display:flex;border-bottom:1px solid var(--sg-line);background:var(--sg-panel)}
  .sg-tabs button{flex:1;background:none;border:0;border-right:1px solid var(--sg-line);
    color:var(--sg-dim);font-size:10px;letter-spacing:.2em;padding:10px 0;font-family:var(--sg-mono);cursor:pointer}
  .sg-tabs button.sg-on{color:var(--sg-cyan);box-shadow:inset 0 -2px 0 var(--sg-cyan)}
  .sg-left,.sg-right{grid-area:panels;border:0;display:none;min-height:340px}
  .sg-left.sg-show,.sg-right.sg-show{display:flex}
}
`;
