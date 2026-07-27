"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Read/unread state persisted in localStorage by story id — the ONLY client-side
 * persistence permitted in the reader surface.
 */
const KEY = "newsradar:read";

function load(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? new Set(arr.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function save(ids: Set<string>): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify([...ids]));
  } catch {
    /* quota / private mode — read-state is best-effort */
  }
}

export function useReadState() {
  const [ids, setIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setIds(load());
  }, []);

  const markRead = useCallback((id: string) => {
    setIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      save(next);
      return next;
    });
  }, []);

  const isRead = useCallback((id: string) => ids.has(id), [ids]);

  return { isRead, markRead };
}
