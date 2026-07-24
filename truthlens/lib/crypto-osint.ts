// Crypto address OSINT - look up a public blockchain address's balance + activity
// from official block explorers (keyless): Bitcoin via Blockstream Esplora,
// EVM/Ethereum via Blockscout. Read-only public ledger data (rules 5/6); an
// unreachable explorer is reported honestly, never simulated (rule 7).
//
// Ported idea from OSIRIS (github.com/simplifaisoul/osiris, MIT); implemented
// natively against the official explorer APIs.

import { getJson } from "./http";
import { cacheGet, cacheSet } from "./cache";

export interface CryptoInfo {
  address: string;
  chain: "bitcoin" | "ethereum" | "unknown";
  found: boolean;
  balance?: string;
  balanceUnit?: string;
  txCount?: number;
  firstSeen?: string;
  url?: string;      // public explorer page (citation)
  note?: string;
}

const BTC_RE = /^(bc1[a-z0-9]{25,90}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/;
const EVM_RE = /^0x[a-fA-F0-9]{40}$/;
const CACHE_MS = 10 * 60_000; // short - balances change

export async function lookupCryptoAddress(input: string): Promise<CryptoInfo> {
  const a = (input || "").trim();
  if (!a) return { address: a, chain: "unknown", found: false, note: "Enter a Bitcoin or EVM (0x) address." };

  const ck = `crypto:${a}`;
  const cached = await cacheGet<CryptoInfo>(ck, CACHE_MS);
  if (cached) return cached;

  let out: CryptoInfo;

  if (BTC_RE.test(a)) {
    const d = await getJson<any>(`https://blockstream.info/api/address/${encodeURIComponent(a)}`, { timeoutMs: 9000 });
    if (!d || !d.chain_stats) {
      out = { address: a, chain: "bitcoin", found: false, note: "Bitcoin explorer unreachable or address not found." };
    } else {
      const cs = d.chain_stats || {}, ms = d.mempool_stats || {};
      const sats = Number(cs.funded_txo_sum || 0) - Number(cs.spent_txo_sum || 0);
      out = {
        address: a, chain: "bitcoin", found: true,
        balance: (sats / 1e8).toFixed(8), balanceUnit: "BTC",
        txCount: Number(cs.tx_count || 0) + Number(ms.tx_count || 0),
        url: `https://blockstream.info/address/${a}`,
      };
    }
  } else if (EVM_RE.test(a)) {
    const [d, c] = await Promise.all([
      getJson<any>(`https://eth.blockscout.com/api/v2/addresses/${a}`, { timeoutMs: 9000 }),
      getJson<any>(`https://eth.blockscout.com/api/v2/addresses/${a}/counters`, { timeoutMs: 9000 }).catch(() => null),
    ]);
    if (!d) {
      out = { address: a, chain: "ethereum", found: false, note: "EVM explorer unreachable or address not found." };
    } else {
      let eth = 0;
      try { eth = Number(BigInt(d.coin_balance || "0")) / 1e18; } catch { eth = 0; }
      out = {
        address: a, chain: "ethereum", found: true,
        balance: eth.toFixed(6), balanceUnit: "ETH",
        txCount: c?.transactions_count != null ? Number(c.transactions_count) : undefined,
        url: `https://eth.blockscout.com/address/${a}`,
      };
    }
  } else {
    out = { address: a, chain: "unknown", found: false, note: "Not a recognized Bitcoin or EVM (0x) address." };
  }

  if (out.found) await cacheSet(ck, out);
  return out;
}
