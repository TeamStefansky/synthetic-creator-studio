import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { StoryCard } from "@/components/StoryCard";
import { StoryBody } from "@/components/StoryBody";
import { makeStory } from "./fixtures";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

/**
 * Legal extract gate: no component may render a text node built from `extract_en`
 * that is longer than what the API supplied, and `extract_en` and `blurb` must
 * never be concatenated into a single node.
 */
describe("extract-length gate", () => {
  const story = makeStory();

  it("story page renders extract_en verbatim in its own node", () => {
    const { container } = render(<StoryBody story={story} />);
    const node = container.querySelector('[data-extract="true"]');
    expect(node).toBeTruthy();
    expect(node!.textContent).toBe(story.extract_en);
    // exactly the API length — never longer
    expect((node!.textContent ?? "").length).toBeLessThanOrEqual(
      (story.extract_en ?? "").length,
    );
  });

  it("never concatenates extract_en and blurb into one node", () => {
    const { container } = render(<StoryBody story={story} />);
    const extractNode = container.querySelector('[data-extract="true"]');
    const blurbText = story.blurb ?? "";
    const extractText = story.extract_en ?? "";
    // The extract node must not also contain the blurb text.
    expect(extractNode!.textContent).not.toContain(blurbText);
    // No single element contains both the full blurb and the full extract.
    const all = Array.from(container.querySelectorAll("*"));
    const combined = all.find((el) => {
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? "")
        .join("");
      return own.includes(blurbText) && own.includes(extractText) && blurbText && extractText;
    });
    expect(combined).toBeUndefined();
  });

  it("the front-page card never renders extract_en (only the blurb)", () => {
    const { container } = render(<StoryCard story={story} variant="lead" />);
    expect(container.querySelector('[data-extract="true"]')).toBeNull();
    expect(container.textContent).not.toContain(story.extract_en);
  });

  it("renders no extract node when the API supplied none", () => {
    const { container } = render(<StoryBody story={makeStory({ extract_en: null })} />);
    expect(container.querySelector('[data-extract="true"]')).toBeNull();
  });
});
