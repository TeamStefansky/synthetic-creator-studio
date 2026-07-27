import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TranslationTag } from "@/components/TranslationTag";

describe("translation tag", () => {
  it("shows 'Translated from Hebrew' for a translated Hebrew story", () => {
    render(
      <TranslationTag
        sourceLang="he"
        headlineOriginal="כותרת מקורית"
        translationStatus="ok"
      />,
    );
    expect(screen.getByText(/Translated from Hebrew/)).toBeInTheDocument();
  });

  it("reveals the original headline RTL-correct on interaction", () => {
    render(
      <TranslationTag
        sourceLang="he"
        headlineOriginal="כותרת מקורית"
        translationStatus="ok"
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("כותרת מקורית");
    // dir="auto" lets the browser render Hebrew right-to-left inside the LTR page
    expect(tip.getAttribute("dir")).toBe("auto");
    expect(tip.getAttribute("lang")).toBe("he");
  });

  it("renders nothing for English (passthrough) stories", () => {
    const { container } = render(
      <TranslationTag
        sourceLang="en"
        headlineOriginal="A headline"
        translationStatus="passthrough"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the source language is missing", () => {
    const { container } = render(
      <TranslationTag sourceLang={null} headlineOriginal={null} translationStatus="ok" />,
    );
    expect(container.firstChild).toBeNull();
  });
});
