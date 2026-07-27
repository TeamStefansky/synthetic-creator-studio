import { describe, it, expect, vi } from "vitest";
import { render, within } from "@testing-library/react";
import { StoryCard } from "@/components/StoryCard";
import { CompactHeadline } from "@/components/CompactHeadline";
import { StoryBody } from "@/components/StoryBody";
import { makeStory } from "./fixtures";

// next/link -> plain anchor so the internal story link doesn't need a router.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

/**
 * Legal attribution gate: EVERY story-rendering component must output the
 * source name, a favicon slot, and an external
 * <a target="_blank" rel="noopener noreferrer"> to the original article — on the
 * front-page card, the story page, and the read-only public (/p) variants.
 */
function assertAttribution(container: HTMLElement, sourceName: string, originalUrl: string) {
  // 1. source name is present
  expect(within(container).getAllByText(sourceName).length).toBeGreaterThan(0);

  // 2. a favicon slot exists
  expect(container.querySelector("[data-favicon-slot]")).toBeTruthy();

  // 3. an external link to the original article with the required rel/target
  const outbound = Array.from(container.querySelectorAll("a")).find(
    (a) => a.getAttribute("href") === originalUrl,
  );
  expect(outbound).toBeTruthy();
  expect(outbound!.getAttribute("target")).toBe("_blank");
  const rel = outbound!.getAttribute("rel") ?? "";
  expect(rel).toContain("noopener");
  expect(rel).toContain("noreferrer");
}

describe("attribution gate", () => {
  const story = makeStory();

  it("front-page StoryCard (lead) attributes the source", () => {
    const { container } = render(
      <StoryCard story={story} variant="lead" storyHref="/site/story/event/x" />,
    );
    assertAttribution(container, story.source_name, story.url);
  });

  it("front-page StoryCard (top) attributes the source", () => {
    const { container } = render(
      <StoryCard story={story} variant="top" storyHref="/site/story/event/x" />,
    );
    assertAttribution(container, story.source_name, story.url);
  });

  it("compact headline attributes the source", () => {
    const { container } = render(
      <CompactHeadline story={story} storyHref="/site/story/event/x" />,
    );
    assertAttribution(container, story.source_name, story.url);
  });

  it("story page StoryBody attributes the source", () => {
    const { container } = render(<StoryBody story={story} />);
    assertAttribution(container, story.source_name, story.url);
  });

  it("public read-only card attributes the source (no internal link)", () => {
    const { container } = render(<StoryCard story={story} variant="lead" />);
    assertAttribution(container, story.source_name, story.url);
  });

  it("public read-only StoryBody attributes the source", () => {
    const { container } = render(<StoryBody story={story} readOnly />);
    assertAttribution(container, story.source_name, story.url);
  });
});
