"use client";

import { useEffect } from "react";

// Opts a single page out of the shared `main.max-w-6xl` container so a wide
// console (the SIGNAL map) can use the full width of the content column instead
// of being squeezed into the reading-width box (which distorts the world map).
// Restores the original constraints on unmount, so every other page is unaffected.
export default function FullBleed() {
  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    const prev = main.getAttribute("style") || "";
    main.style.maxWidth = "none";
    main.style.paddingLeft = "1rem";
    main.style.paddingRight = "1rem";
    return () => {
      main.setAttribute("style", prev);
    };
  }, []);
  return null;
}
