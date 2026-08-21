"use client";

// Meta Assets - monitoring view over the Facebook Pages and the linked Instagram
// professional account the signed-in user ALREADY manages. Read/monitor only:
// TruthLens never posts, publishes, advertises, or messages. Each panel names
// the exact Meta permission that powers it, so a reviewer can map grant → screen.
// Not connected → an honest connect state (never simulated data).

import { useCallback, useEffect, useState } from "react";
import { Facebook, Instagram, Loader2, LogOut, MessagesSquare, RefreshCw, ThumbsUp, Share2, Eye } from "lucide-react";
import ToolIntro from "@/components/ToolIntro";
import Disclaimer from "@/components/Disclaimer";

type Profile = { id: string; name: string; picture?: string };
type IgAccount = { id: string; username?: string; name?: string; profile_picture_url?: string; followers_count?: number; media_count?: number };
type Page = { id: string; name: string; category?: string; link?: string; picture?: string; instagram?: IgAccount | null };
type Post = { id: string; message?: string; created_time?: string; permalink_url?: string; reactions: number; comments: number; shares: number };

function PermissionTag({ name }: { name: string }) {
  return (
    <span title={`This panel is powered by the ${name} permission.`} className="inline-flex items-center gap-1 rounded border border-brand-soft/30 px-1.5 py-0.5 text-[10px] font-medium text-brand-soft">
      <Eye className="h-3 w-3" /> {name}
    </span>
  );
}

export default function MetaAssetsPage() {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsError, setPostsError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/meta/overview", { cache: "no-store" });
      const j = await r.json();
      setConnected(Boolean(j.connected));
      setProfile(j.profile || null);
      setPages(j.pages || []);
      if (j.error) setError(j.error);
      if ((j.pages || []).length && !selected) setSelected(j.pages[0].id);
    } catch {
      setError("Network error - please try again.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selected) { setPosts(null); return; }
    let cancelled = false;
    setPostsLoading(true); setPostsError(""); setPosts(null);
    fetch(`/api/meta/engagement?pageId=${encodeURIComponent(selected)}`, { cache: "no-store" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (cancelled) return;
        if (!ok) { setPostsError(j.error || "Could not load engagement."); return; }
        setPosts(j.posts || []);
      })
      .catch(() => { if (!cancelled) setPostsError("Network error - please try again."); })
      .finally(() => { if (!cancelled) setPostsLoading(false); });
    return () => { cancelled = true; };
  }, [selected]);

  const disconnect = async () => {
    await fetch("/api/meta/overview", { method: "DELETE" });
    setConnected(false); setProfile(null); setPages([]); setSelected(""); setPosts(null);
  };

  const igAccounts = pages.filter((p) => p.instagram).map((p) => ({ page: p, ig: p.instagram as IgAccount }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Facebook className="h-6 w-6 text-brand-soft" />
          <h1 className="font-display text-2xl font-bold">Meta Assets</h1>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-ink-secondary">
          Monitor the Facebook Pages and the linked Instagram professional account you already manage - the
          surfaces where fake-news and impersonation campaigns target a brand first. Read-only: TruthLens never
          posts, publishes, runs ads, or messages anyone.
        </p>
      </div>

      {loading ? (
        <div className="card flex items-center gap-2 text-sm text-ink-secondary"><Loader2 className="h-4 w-4 animate-spin" /> Checking the Meta connection…</div>
      ) : !connected ? (
        <div className="card space-y-3">
          <div className="label-muted">Meta - not connected</div>
          <p className="text-sm text-ink-secondary">
            Connect with Facebook Login to see your managed Pages, their post engagement, and the linked
            Instagram professional account. You will see Meta&apos;s own permission dialog and can review exactly
            what is requested: <span className="text-ink">public_profile, pages_show_list, pages_read_engagement, instagram_basic</span> - nothing more.
          </p>
          {error && <p className="text-sm text-risk-high">{error}</p>}
          <a href="/api/auth/facebook/login?next=/tools/meta" className="inline-flex items-center gap-2 rounded-xl bg-[#1877F2] px-5 py-2.5 text-sm font-medium text-white transition hover:brightness-110">
            <Facebook className="h-4 w-4" /> Continue with Facebook
          </a>
        </div>
      ) : (
        <>
          {/* public_profile - who connected */}
          <div className="card flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {profile?.picture
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={profile.picture} alt="" className="h-9 w-9 rounded-full border border-line" />
                : <div className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-elev"><Facebook className="h-4 w-4 text-brand-soft" /></div>}
              <div>
                <div className="text-sm text-ink">Connected as <span className="font-medium">{profile?.name}</span></div>
                <div className="text-[11px] text-ink-muted">Meta user id {profile?.id} · token held server-side only</div>
              </div>
              <PermissionTag name="public_profile" />
            </div>
            <div className="flex items-center gap-2">
              <button onClick={load} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink-secondary hover:text-white"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
              <button onClick={disconnect} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink-secondary hover:text-white"><LogOut className="h-3.5 w-3.5" /> Disconnect</button>
            </div>
          </div>

          {/* pages_show_list - managed Pages */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <div className="label-muted">Managed Facebook Pages</div>
              <PermissionTag name="pages_show_list" />
            </div>
            <p className="text-[12px] text-ink-muted">This list uses <span className="text-ink-secondary">pages_show_list</span>: the Pages your Meta account manages, read from /me/accounts.</p>
            {pages.length === 0 ? (
              <p className="text-sm text-ink-secondary">Your Meta account manages no Pages (or none was shared in the login dialog). Re-connect and select Pages to monitor.</p>
            ) : (
              <ul className="divide-y divide-line">
                {pages.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="flex items-center gap-3">
                      {p.picture
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={p.picture} alt="" className="h-8 w-8 rounded-lg border border-line" />
                        : <div className="h-8 w-8 rounded-lg bg-bg-elev" />}
                      <div>
                        <div className="text-sm text-ink">{p.name}</div>
                        <div className="text-[11px] text-ink-muted">{p.category || "Page"} · id {p.id}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelected(p.id)}
                      className={`rounded-lg px-2.5 py-1.5 text-xs ${selected === p.id ? "bg-bg-elev text-white" : "border border-line text-ink-secondary hover:text-white"}`}
                    >
                      {selected === p.id ? "Selected" : "View engagement"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* pages_read_engagement - posts + counts of the selected Page */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <div className="label-muted">Page posts &amp; engagement{selected && pages.find((p) => p.id === selected) ? ` - ${pages.find((p) => p.id === selected)!.name}` : ""}</div>
              <PermissionTag name="pages_read_engagement" />
            </div>
            <p className="text-[12px] text-ink-muted">This panel uses <span className="text-ink-secondary">pages_read_engagement</span>: recent posts of the selected managed Page with reaction, comment, and share counts - the baseline for spotting engagement anomalies.</p>
            {!selected ? (
              <p className="text-sm text-ink-secondary">Select a Page above to load its recent posts.</p>
            ) : postsLoading ? (
              <div className="flex items-center gap-2 text-sm text-ink-secondary"><Loader2 className="h-4 w-4 animate-spin" /> Loading posts…</div>
            ) : postsError ? (
              <p className="text-sm text-risk-high">{postsError}</p>
            ) : !posts || posts.length === 0 ? (
              <p className="text-sm text-ink-secondary">This Page has no recent posts to show.</p>
            ) : (
              <ul className="divide-y divide-line">
                {posts.map((post) => (
                  <li key={post.id} className="space-y-1 py-2">
                    <div className="text-sm text-ink">{post.message ? (post.message.length > 180 ? post.message.slice(0, 180) + "…" : post.message) : <span className="text-ink-muted">(no text - media post)</span>}</div>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-ink-muted">
                      {post.created_time && <span>{new Date(post.created_time).toLocaleString("en-GB")}</span>}
                      <span className="inline-flex items-center gap-1"><ThumbsUp className="h-3 w-3" /> {post.reactions} reactions</span>
                      <span className="inline-flex items-center gap-1"><MessagesSquare className="h-3 w-3" /> {post.comments} comments</span>
                      <span className="inline-flex items-center gap-1"><Share2 className="h-3 w-3" /> {post.shares} shares</span>
                      {post.permalink_url && <a href={post.permalink_url} target="_blank" rel="noreferrer" className="text-brand-soft hover:underline">Open on Facebook</a>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* instagram_basic - linked IG professional account */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <div className="label-muted">Linked Instagram professional account</div>
              <PermissionTag name="instagram_basic" />
            </div>
            <p className="text-[12px] text-ink-muted">This panel uses <span className="text-ink-secondary">instagram_basic</span>: the Instagram professional account linked to your managed Page - the identity impersonators copy first.</p>
            {igAccounts.length === 0 ? (
              <p className="text-sm text-ink-secondary">No managed Page has a linked Instagram professional account. Link one in Meta Business Suite to monitor it here.</p>
            ) : (
              <ul className="divide-y divide-line">
                {igAccounts.map(({ page, ig }) => (
                  <li key={ig.id} className="flex items-center gap-3 py-2">
                    {ig.profile_picture_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={ig.profile_picture_url} alt="" className="h-9 w-9 rounded-full border border-line" />
                      : <div className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-elev"><Instagram className="h-4 w-4 text-brand-soft" /></div>}
                    <div>
                      <div className="text-sm text-ink">@{ig.username || ig.id}{ig.name ? <span className="text-ink-muted"> · {ig.name}</span> : null}</div>
                      <div className="text-[11px] text-ink-muted">
                        IG id {ig.id} · linked to Page “{page.name}”
                        {typeof ig.followers_count === "number" ? ` · ${ig.followers_count.toLocaleString("en-US")} followers` : ""}
                        {typeof ig.media_count === "number" ? ` · ${ig.media_count.toLocaleString("en-US")} posts` : ""}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <ToolIntro
        what={<>A read-only monitoring view over the Meta assets you already manage, via official <span className="text-ink">Facebook Login + Graph API</span>. Permissions requested: exactly <span className="text-ink">public_profile, pages_show_list, pages_read_engagement, instagram_basic</span> - each panel above names the one it uses.</>}
        steps={[
          <>Press <span className="text-ink">Continue with Facebook</span> and approve Meta&apos;s permission dialog.</>,
          <>Your managed Pages appear (pages_show_list); pick one to see post engagement (pages_read_engagement).</>,
          <>The linked Instagram professional account renders alongside (instagram_basic).</>,
        ]}
        note="Official Meta endpoints only. Tokens are held server-side and never reach the browser. TruthLens reads and monitors - it never posts, publishes, advertises, or messages. Indicators with evidence, never a verdict."
      />

      <Disclaimer />
    </div>
  );
}
