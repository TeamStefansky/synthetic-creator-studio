"use client";

import { useState } from "react";
import { BatchImport } from "@/components/sources/BatchImport";
import { Discovery } from "@/components/sources/Discovery";
import { OpmlImport } from "@/components/sources/OpmlImport";
import { SubscriptionTable } from "@/components/sources/SubscriptionTable";
import { GlobalSources } from "@/components/sources/GlobalSources";
import { t } from "@/lib/strings.en";

type Tab = "my" | "global";

export default function SourcesPage() {
  const [tab, setTab] = useState<Tab>("my");

  return (
    <div>
      <h1 className="mb-6 font-headline text-3xl text-ink">{t.sources.title}</h1>

      <div role="tablist" className="mb-8 flex gap-1 border-b border-line">
        <button
          role="tab"
          aria-selected={tab === "my"}
          onClick={() => setTab("my")}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
            tab === "my"
              ? "border-accent text-ink"
              : "border-transparent text-ink-muted hover:text-ink"
          }`}
        >
          {t.sources.tabMyFeeds}
        </button>
        <button
          role="tab"
          aria-selected={tab === "global"}
          onClick={() => setTab("global")}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
            tab === "global"
              ? "border-accent text-ink"
              : "border-transparent text-ink-muted hover:text-ink"
          }`}
        >
          {t.sources.tabGlobal}
        </button>
      </div>

      {tab === "my" ? (
        <div className="space-y-8">
          <div className="grid gap-6 lg:grid-cols-2">
            <BatchImport />
            <div className="space-y-6">
              <Discovery />
              <OpmlImport />
            </div>
          </div>
          <SubscriptionTable />
        </div>
      ) : (
        <GlobalSources />
      )}
    </div>
  );
}
