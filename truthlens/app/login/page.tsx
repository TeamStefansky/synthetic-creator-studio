"use client";

// Access-gate login. Posts the shared password to /api/auth/login, which sets an
// httpOnly cookie; on success we go to ?next= (or the home dashboard). Styled in the
// new design language (near-black, violet primary, cyan accent). No password is
// stored client-side. When the gate isn't configured the API says so honestly.

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Lock, ArrowRight } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
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
