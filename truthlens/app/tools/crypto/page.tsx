"use client";

import { useState } from "react";
import { Coins, ArrowRight, ExternalLink } from "lucide-react";
import Disclaimer from "@/components/Disclaimer";
import ToolIntro from "@/components/ToolIntro";
import type { CryptoInfo } from "@/lib/crypto-osint";

// Crypto OSINT - public blockchain address lookup (Bitcoin via Blockstream, EVM
// via Blockscout). Read-only public ledger facts, cited to the explorer.

const CHAIN_LABEL: Record<string, string> = { bitcoin: "Bitcoin", ethereum: "Ethereum (EVM)", unknown: "Unknown" };

export default function CryptoPage() {
  const [addr, setAddr] = useState("");
  const [result, setResult] = useState<CryptoInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const lookup = async (value?: string) => {
    const a = (value ?? addr).trim();
    if (!a) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const r = await fetch(`/api/crypto?address=${encodeURIComponent(a)}`, { cache: "no-store" });
      const txt = await r.text();
      let data: any; try { data = JSON.parse(txt); } catch { throw new Error(txt.slice(0, 160) || "unreadable response"); }
      setResult(data);
    } catch (e: any) { setError(e?.message || "lookup failed"); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Coins className="h-6 w-6 text-brand-soft" />
          <h1 className="font-display text-2xl font-bold">Crypto <span className="gradient-text">OSINT</span></h1>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-ink-secondary">
          Look up a public blockchain address - balance and activity - straight from the official
          explorers (Bitcoin via Blockstream, Ethereum/EVM via Blockscout). Public ledger facts,
          cited to source. No wallet is contacted; nothing is de-anonymized.
        </p>
      </div>

      <div className="card">
        <form onSubmit={(e) => { e.preventDefault(); lookup(); }} className="flex flex-col gap-2 sm:flex-row">
          <input
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
            placeholder="Bitcoin (bc1…/1…/3…) or EVM (0x…) address"
            className="w-full rounded-xl border border-white/15 bg-bg-elev px-4 py-3 font-mono text-sm outline-none transition focus:border-brand"
          />
          <button type="submit" className="btn shrink-0" disabled={loading || !addr.trim()}>
            {loading ? "Looking up…" : <>Look up <ArrowRight className="h-4 w-4" /></>}
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-risk-high">{error}</p>}
        <p className="mt-2 text-xs text-ink-secondary">Public on-chain data only. Balances cached briefly.</p>
      </div>

      {!result && !loading && (
        <ToolIntro
          heading="What's on this address?"
          what={<>Paste a <span className="text-ink">Bitcoin</span> or <span className="text-ink">EVM/Ethereum</span> address and TruthLens pulls its balance and transaction count from the official public explorer, with a link to the full ledger. The blockchain is public by design - this is reading it, not surveilling anyone.</>}
          examplesLabel="Try it"
          examples={[
            { label: "Genesis BTC address", onClick: () => { setAddr("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"); lookup("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"); } },
          ]}
          note="On-chain balances/activity are public facts. An address is not a person - attributing an address to an individual requires separate, authorized evidence and is out of scope here."
        />
      )}

      {result && (
        <div className="card">
          {!result.found ? (
            <p className="text-sm text-ink-secondary">{result.note || "No data for this address."}</p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-brand/30 bg-brand/5 px-2.5 py-0.5 text-xs text-brand-soft">{CHAIN_LABEL[result.chain]}</span>
                <span className="break-all font-mono text-sm text-ink">{result.address}</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <div className="label-muted">Balance</div>
                  <div className="mt-1 text-xl font-bold">{result.balance} <span className="text-sm font-normal text-ink-secondary">{result.balanceUnit}</span></div>
                </div>
                <div>
                  <div className="label-muted">Transactions</div>
                  <div className="mt-1 text-xl font-bold">{result.txCount != null ? result.txCount.toLocaleString() : "—"}</div>
                </div>
                <div className="flex items-end">
                  {result.url && (
                    <a href={result.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-brand-soft hover:underline">
                      Open on explorer <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </div>
              <p className="mt-3 text-[11px] text-ink-secondary">Public ledger data via {result.chain === "bitcoin" ? "Blockstream" : "Blockscout"}. An address is not a person; balances are current at lookup time.</p>
            </>
          )}
        </div>
      )}

      <Disclaimer variant="inline" />
    </div>
  );
}
