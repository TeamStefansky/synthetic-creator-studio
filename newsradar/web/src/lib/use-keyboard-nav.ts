"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Keyboard navigation over the rendered story list:
 *   j / k  move between stories, Enter opens the story page, o opens the source,
 *   /      focuses the filter search input.
 * Uses [data-story-id] + [data-story-href] / [data-source-url] attributes so it
 * works over whatever the page rendered, without a shared store.
 */
export function useKeyboardNav(enabled: boolean = true) {
  const idx = useRef(-1);
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;

    function stories(): HTMLElement[] {
      return Array.from(document.querySelectorAll<HTMLElement>("[data-story-id]"));
    }

    function focusAt(next: number) {
      const list = stories();
      if (list.length === 0) return;
      idx.current = Math.max(0, Math.min(next, list.length - 1));
      const el = list[idx.current];
      if (el) {
        el.setAttribute("tabindex", "-1");
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        el.focus();
        list.forEach((n) => n.classList.toggle("ring-2", n === el));
        list.forEach((n) => n.classList.toggle("ring-accent", n === el));
      }
    }

    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "j") {
        e.preventDefault();
        focusAt(idx.current + 1);
      } else if (e.key === "k") {
        e.preventDefault();
        focusAt(idx.current - 1);
      } else if (e.key === "Enter") {
        const el = stories()[idx.current];
        const href = el?.getAttribute("data-story-href");
        if (href) {
          e.preventDefault();
          router.push(href);
        }
      } else if (e.key === "o") {
        const el = stories()[idx.current];
        const url = el?.getAttribute("data-source-url");
        if (url) {
          e.preventDefault();
          window.open(url, "_blank", "noopener,noreferrer");
        }
      } else if (e.key === "/") {
        const input = document.querySelector<HTMLElement>("[data-filter-focus]");
        if (input) {
          e.preventDefault();
          input.focus();
        }
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, router]);
}
