"use client";

// Access-gate login. Two REAL ways in: (1) the shared access password (posts to
// /api/auth/login, which sets an httpOnly cookie), and (2) "Continue with
// Facebook" - standard Meta OAuth via /api/auth/facebook/login, which shows
// Meta's own permission dialog (public_profile, pages_show_list,
// pages_read_engagement, instagram_basic) and lands on the Meta Assets
// monitoring view. No password or token is stored client-side. Errors from
// either path are reported honestly (never a faked success).

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Lock, ArrowRight, Facebook } from "lucide-react";

const FB_ERRORS: Record<string, string> = {
  not_configured: "Facebook Login is not configured on this deployment (FACEBOOK_APP_ID / FACEBOOK_APP_SECRET are not set).",
  denied: "Facebook sign-in was cancelled - no permissions were granted.",
  state_mismatch: "Facebook sign-in could not be verified (state mismatch). Please try again.",
  exchange_failed: "Facebook sign-in failed while exchanging the code for a token. Please try again.",
};

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const fbError = FB_ERRORS[params.get("fb") || ""] || "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { setError(j.error || "Sign-in failed."); return; }
      router.replace(next.startsWith("/") ? next : "/");
      router.refresh();
    } catch {
      setError("Network error - please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#07080f] px-4 text-[#e8eaf2]">
      {/* Ambient violet/cyan glow */}
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[#4755a5]/20 blur-[120px]" />
      <div aria-hidden className="pointer-events-none absolute -bottom-40 right-10 h-[420px] w-[420px] rounded-full bg-[#66cbe6]/10 blur-[120px]" />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-wordmark.svg" alt="TruthLens" className="h-7 w-auto" />
        </div>

        <div className="rounded-2xl border border-[#4755a5]/20 bg-[#0e1020]/80 p-6 shadow-2xl backdrop-blur">
          <h1 className="text-xl font-semibold">Sign in</h1>
          <p className="mt-1 text-sm text-[#6b6e8a]">Enter the access password to open the platform.</p>

          <form onSubmit={submit} className="mt-5 space-y-3">
            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-[#a5a8c2]"><Lock className="h-3.5 w-3.5" /> Access password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                autoFocus
                placeholder="••••••••••"
                className="w-full rounded-xl border border-[#4755a5]/25 bg-[#161828] px-3 py-2.5 text-sm text-[#e8eaf2] outline-none transition focus:border-[#4755a5] focus:ring-2 focus:ring-[#4755a5]/30"
              />
            </label>
            {error && <p className="text-sm text-[#f87171]">{error}</p>}
            <button
              type="submit"
              disabled={loading || !password.trim()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#4755a5] to-[#3c4890] px-4 py-2.5 text-sm font-medium text-white shadow-[0_0_24px_rgba(71,85,165,0.35)] transition hover:brightness-110 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Enter <ArrowRight className="h-4 w-4" /></>}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wide text-[#6b6e8a]">
            <span className="h-px flex-1 bg-[#4755a5]/20" /> or <span className="h-px flex-1 bg-[#4755a5]/20" />
          </div>

          {/* Real Meta OAuth - the server route redirects to Facebook's own
              permission dialog; the callback exchanges the code server-side. */}
          <a
            href={`/api/auth/facebook/login?next=${encodeURIComponent("/tools/meta")}`}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#1877F2] px-4 py-2.5 text-sm font-medium text-white transition hover:brightness-110"
          >
            <Facebook className="h-4 w-4" /> Continue with Facebook
          </a>
          <p className="mt-2 text-center text-[11px] text-[#6b6e8a]">
            Connects the Pages and Instagram account you manage, for read-only monitoring.
          </p>
          {fbError && <p className="mt-2 text-sm text-[#f87171]">{fbError}</p>}
        </div>

        <p className="mt-6 text-center text-xs text-[#6b6e8a]">
          Decision-support platform - indicators with evidence, never a verdict.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#07080f]" />}>
      <LoginForm />
    </Suspense>
  );
}
