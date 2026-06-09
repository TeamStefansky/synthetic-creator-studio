"use client";

import { useEffect, useState } from "react";
import { Send, CheckCircle2, Instagram, Music2 } from "lucide-react";
import { api, assetFileUrl, type Asset, type Post } from "../lib/api";
import { PersonaPicker, usePersonas, useFirstPersona } from "../components/PersonaPicker";
import { Alert, EmptyState, PageHeader, StatusChip } from "../components/ui";

const PLATFORMS = [
  { id: "instagram", label: "Instagram", icon: Instagram },
  { id: "tiktok", label: "TikTok", icon: Music2 },
];

export default function DistributionPage() {
  const { personas } = usePersonas();
  const [persona, setPersona] = useFirstPersona(personas);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [platform, setPlatform] = useState("instagram");
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  const loadPosts = () => api.listPosts().then(setPosts).catch(() => {});

  useEffect(() => {
    loadPosts();
  }, []);
  useEffect(() => {
    if (persona) api.listAssets(persona).then(setAssets).catch(() => {});
  }, [persona]);

  async function run(asset: Asset) {
    setMsg(null);
    try {
      const post = await api.schedule(asset.id, platform, "Hello — I'm an AI persona.");
      await api.approve(post.id);
      await api.publish(post.id); // hard gate runs server-side first
      setMsg({ kind: "success", text: `Published to ${platform} with the AI-generated label set.` });
      loadPosts();
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    }
  }

  const tagged = assets.filter((a) => a.disclosure_status === "tagged");

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Distribution"
        subtitle="Official-API publishing only. The server-side gate refuses any asset lacking valid provenance + a visible label."
        action={<div className="w-full sm:w-64"><PersonaPicker personas={personas} value={persona} onChange={setPersona} /></div>}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate-500">Platform:</span>
        {PLATFORMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setPlatform(id)}
            className={`btn ${platform === id ? "btn-primary" : "btn-ghost"}`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {msg && <div className="mb-5"><Alert kind={msg.kind}>{msg.text}</Alert></div>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Publishable assets (tagged)</h2>
          {tagged.length === 0 ? (
            <EmptyState icon={<Send className="h-8 w-8" />} title="Nothing ready to publish" hint="Generate disclosed assets in the Studio first." />
          ) : (
            <div className="space-y-3">
              {tagged.map((a) => (
                <div key={a.id} className="card flex items-center gap-4 p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={assetFileUrl(a.id)} alt="asset" className="h-14 w-14 rounded-lg object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs text-slate-400">{a.id.slice(0, 12)}…</p>
                    <StatusChip status={a.disclosure_status} />
                  </div>
                  <button className="btn-primary" onClick={() => run(a)}>
                    <Send className="h-4 w-4" /> Publish
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Recent posts</h2>
          {posts.length === 0 ? (
            <EmptyState icon={<CheckCircle2 className="h-8 w-8" />} title="No posts yet" hint="Published posts appear here with their state." />
          ) : (
            <div className="space-y-3">
              {posts.map((p) => (
                <div key={p.id} className="card flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="font-medium capitalize text-ink-900">{p.platform}</p>
                    <p className="truncate text-xs text-slate-400">
                      {p.external_post_id ? `id: ${p.external_post_id}` : p.id.slice(0, 12) + "…"}
                    </p>
                  </div>
                  <StatusChip status={p.approval_state} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
