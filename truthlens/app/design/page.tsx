"use client";

// Aurora Dark - component showcase (Phase 2 verification). Renders every canonical
// component + variant/state in the new look. Not linked in nav; a reference surface
// for the design system. Tokens only - no raw hex/px.

import { useState } from "react";
import { Radar, ShieldCheck, Bot, Sparkles } from "lucide-react";
import ConfidenceBadge from "@/components/ConfidenceBadge";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-4">
      <h2 className="label-muted">{title}</h2>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </section>
  );
}

export default function DesignShowcase() {
  const [seg, setSeg] = useState("day");
  const [tab, setTab] = useState("signals");

  return (
    <div className="animate-fade-up space-y-6">
      <header>
        <div className="label-muted mb-1">Aurora Dark</div>
        <h1 className="font-display text-h1-a text-white">
          Component <span className="gradient-text">showcase</span>
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-ink-secondary">
          Every canonical component and state, built from tokens. The gradient stays a scarce accent;
          the near-black canvas carries the rest.
        </p>
      </header>

      <Section title="Type scale (display / body / mono)">
        <div className="space-y-2">
          <div className="font-display text-hero text-white">Hero 60</div>
          <div className="font-display text-display text-white">Display 44</div>
          <div className="font-display text-h1-a text-white">Heading 34</div>
          <p className="text-body text-ink">Body 15 - soft off-white, calm and readable.</p>
          <p className="label-muted">Label - mono, uppercase, tracked</p>
        </div>
      </Section>

      <Section title="Buttons">
        <button className="btn">Primary</button>
        <button className="btn-secondary">Secondary</button>
        <button className="btn-ghost">Ghost</button>
        <button className="btn" disabled>Disabled</button>
      </Section>

      <Section title="Fields">
        <input className="field max-w-xs" placeholder="Focus me for the glow ring" />
        <textarea className="field max-w-xs" rows={2} placeholder="Textarea, same field system" />
      </Section>

      <Section title="Cards">
        <div className="card w-56"><div className="font-medium text-ink">Card</div><p className="mt-1 text-sm text-ink-secondary">surface + hairline, hover raises the border.</p></div>
        <div className="card-elev w-56"><div className="font-medium text-ink">Card-elev</div><p className="mt-1 text-sm text-ink-secondary">the raised step.</p></div>
        <div className="card-featured w-56"><div className="font-semibold">Featured</div><p className="mt-1 text-sm text-white/85">the one highlighted item - full gradient.</p></div>
      </Section>

      <Section title="Icon tiles + tag badges">
        <div className="tile"><Sparkles className="h-5 w-5" /></div>
        <div className="tile"><Radar className="h-5 w-5" /></div>
        <div className="tile-flat"><Bot className="h-5 w-5" /></div>
        <span className="tag">New</span>
        <span className="tag">Priority</span>
        <span className="tag-soft">soft</span>
      </Section>

      <Section title="Pill toggle + tabs">
        <div className="pill">
          {["day", "week", "month"].map((s) => (
            <button key={s} className="pill-seg" data-active={seg === s} onClick={() => setSeg(s)}>{s}</button>
          ))}
        </div>
        <div className="flex gap-1 border-b border-line">
          {["signals", "evidence", "sources"].map((t) => (
            <button key={t} className="tab" data-active={tab === t} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>
      </Section>

      <Section title="Two-tone headings">
        <h3 className="font-display text-h2-a text-white">Coordination <span className="gradient-text">detected</span></h3>
        <h3 className="font-display text-h2-a text-white">Site <span className="gradient-text">Report</span></h3>
      </Section>

      <Section title="Confidence badges (retuned risk tokens)">
        <ConfidenceBadge level="High" />
        <ConfidenceBadge level="Medium" />
        <ConfidenceBadge level="Low" />
        <ConfidenceBadge level="Unknown" />
        <span className="inline-flex items-center gap-1.5 text-sm text-risk-legit"><ShieldCheck className="h-4 w-4" /> legit</span>
        <span className="text-sm text-risk-unknown">unknown</span>
        <span className="text-sm text-risk-high">high</span>
      </Section>

      <p className="text-xs text-ink-muted">
        Data-viz signature elements (radial tick gauge, milestone progress curve) arrive in Phase 4.
      </p>
    </div>
  );
}
