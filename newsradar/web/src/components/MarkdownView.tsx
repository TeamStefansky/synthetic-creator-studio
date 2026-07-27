"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders trusted, server-generated digest Markdown. react-markdown does NOT use
 * dangerouslySetInnerHTML — it parses to React elements — and we do not enable
 * raw-HTML plugins, so no source-derived HTML is ever injected.
 */
export function MarkdownView({ markdown }: { markdown: string }) {
  return (
    <div className="markdown reading-column">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </div>
  );
}
