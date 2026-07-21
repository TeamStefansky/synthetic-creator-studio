// ISO 3166-1 alpha-2 helpers: flag emoji + full country name. Works on both
// server and client (Intl.DisplayNames is available in modern Node and browsers).

export function flagEmoji(code?: string): string {
  const c = (code || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return "🌐";
  const A = 0x1f1e6; // regional indicator "A"
  return String.fromCodePoint(A + (c.charCodeAt(0) - 65), A + (c.charCodeAt(1) - 65));
}

export function countryName(code?: string): string | undefined {
  if (!code) return undefined;
  const c = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return code;
  try {
    const dn = new Intl.DisplayNames(["en"], { type: "region" });
    return dn.of(c) || code;
  } catch {
    return code;
  }
}

/** "🇮🇱 Israel (IL)" or " - ". */
export function countryLabel(code?: string): string {
  if (!code) return " - ";
  const name = countryName(code);
  return name && name !== code ? `${flagEmoji(code)} ${name} (${code.toUpperCase()})` : `${flagEmoji(code)} ${code}`;
}
