// "Is this post fake?" endpoint. Accepts pasted text, or a URL to fetch + extract.

import { NextRequest, NextResponse } from "next/server";
import { checkPost } from "@/lib/post-check";
import { fetchPage } from "@/lib/page-fetch";
import { extractArticle } from "@/lib/fingerprint";
import { normalizeUrl } from "@/lib/normalizeUrl";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let text = String(body.text || "").trim();

  // Screenshot path: Claude reads the post text from the image directly.
  const image =
    body.imageBase64 && body.mediaType
      ? { data: String(body.imageBase64), mediaType: String(body.mediaType) }
      : undefined;
  if (image) {
    const result = await checkPost({ text: text || undefined, image });
    return NextResponse.json(result);
  }

  // If a URL was pasted (and no separate text), fetch and extract the article.
  if (!text && body.url) {
    try {
      const { url } = normalizeUrl(String(body.url));
      const page = await fetchPage(url);
      if (page.html) text = extractArticle(page.html).text;
    } catch {
      /* fall through */
    }
  } else if (/^https?:\/\/\S+$/i.test(text)) {
    try {
      const { url } = normalizeUrl(text);
      const page = await fetchPage(url);
      if (page.html) text = extractArticle(page.html).text || text;
    } catch {
      /* keep original text */
    }
  }

  if (!text || text.length < 10) {
    return NextResponse.json({ error: "Provide a post text, a screenshot, or a fetchable URL." }, { status: 400 });
  }

  const result = await checkPost({ text });
  return NextResponse.json(result);
}
