// Robust JSON extraction for LLM output - pure + testable. Handles markdown
// fences, surrounding prose, and JSON truncated by the token limit (balances
// open strings/brackets and retreats from the end until it parses).

/** Balance a possibly-truncated JSON string: close an open string, drop a
 * trailing comma or a dangling "key": with no value, and close open
 * braces/brackets. */
export function autoClose(s: string): string {
  let inStr = false, escp = false;
  const opens: string[] = [];
  for (const ch of s) {
    if (escp) { escp = false; continue; }
    if (ch === "\\") { if (inStr) escp = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "{" || ch === "[") opens.push(ch);
    else if (ch === "}" || ch === "]") opens.pop();
  }
  let out = s;
  if (inStr) out += '"';
  out = out.replace(/,\s*$/, "");
  out = out.replace(/,?\s*"[^"\n]*"\s*:\s*[^,}\]"]*$/, ""); // dangling key with no value
  out = out.replace(/,\s*$/, "");
  while (opens.length) out += opens.pop() === "{" ? "}" : "]";
  return out;
}

/** Parse the first JSON object out of arbitrary model text, repairing a
 * truncated tail if necessary. Returns null when nothing usable is found. */
export function extractJson(text: string): any | null {
  const cleaned = (text || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  const a = cleaned.indexOf("{");
  if (a < 0) return null;
  const t = cleaned.slice(a);
  const b = t.lastIndexOf("}");
  if (b > 0) { try { return JSON.parse(t.slice(0, b + 1)); } catch { /* try repair */ } }
  let cut = t.length;
  for (let i = 0; i < 40 && cut > 1; i++) {
    try { return JSON.parse(autoClose(t.slice(0, cut))); } catch { /* keep cutting */ }
    const p = Math.max(t.lastIndexOf("}", cut - 2), t.lastIndexOf(",", cut - 2));
    if (p <= 0) break;
    cut = p + 1;
  }
  return null;
}
