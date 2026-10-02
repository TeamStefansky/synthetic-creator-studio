// Consolidated tools: several former stand-alone tools are now VIEWS of one
// tool. Each view keeps its own route (deep links, history reopen and shared
// links still work); the sidebar shows a single entry per set and every view
// renders the same tab strip. One source of truth for both the Nav and the tabs.

export interface View { href: string; label: string }
export interface ViewSet { id: string; views: View[] }

export const VIEW_SETS = {
  // Same /api/mentions collection, three presentations + the forecast on top of it.
  signal: {
    id: "signal",
    views: [
      { href: "/tools/signal", label: "Live grid" },
      { href: "/tools/mentions", label: "List & markets" },
      { href: "/tools/radar", label: "Early-warning forecast" },
    ],
  },
  // Same /api/origin-exposure audit, as a report and as a map.
  origin: {
    id: "origin",
    views: [
      { href: "/tools/origin", label: "Exposure audit" },
      { href: "/tools/origin-map", label: "Map" },
    ],
  },
  // Integration keys and RSS feeds are both "what is connected".
  connections: {
    id: "connections",
    views: [
      { href: "/status", label: "Integrations" },
      { href: "/connections", label: "RSS feeds" },
    ],
  },
  // Your own check history and the public gallery of shared checks.
  history: {
    id: "history",
    views: [
      { href: "/history", label: "My history" },
      { href: "/checks", label: "Shared checks" },
    ],
  },
} satisfies Record<string, ViewSet>;

export type ViewSetId = keyof typeof VIEW_SETS;

function onRoute(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Does `pathname` belong to any view of the set? (Nav highlighting) */
export function inViewSet(id: ViewSetId, pathname: string): boolean {
  return VIEW_SETS[id].views.some((v) => onRoute(pathname, v.href));
}

/** The active view of a set for `pathname` (longest matching href wins). */
export function activeView(id: ViewSetId, pathname: string): View | undefined {
  return VIEW_SETS[id].views
    .filter((v) => onRoute(pathname, v.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
