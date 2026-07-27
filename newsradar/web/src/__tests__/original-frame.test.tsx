import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { OriginalFrame } from "@/components/OriginalFrame";

/**
 * Legal frame gate: frameable === true renders the sandboxed iframe with the
 * required sandbox attributes; frameable false / null render the fallback CTA and
 * NO iframe. We never render an article body the API didn't supply.
 */
describe("original-frame gate", () => {
  const url = "https://example.com/article";

  it("frameable=true renders the sandboxed iframe with required attrs", () => {
    const { container } = render(
      <OriginalFrame url={url} sourceName="Example" frameable={true} />,
    );
    const iframe = container.querySelector("iframe");
    expect(iframe).toBeTruthy();
    expect(iframe!.getAttribute("src")).toBe(url);
    expect(iframe!.getAttribute("sandbox")).toBe(
      "allow-scripts allow-same-origin allow-popups",
    );
    expect(iframe!.getAttribute("loading")).toBe("lazy");
    expect(iframe!.getAttribute("referrerpolicy")).toBe("strict-origin-when-cross-origin");
    expect(container.querySelector('[data-frame-fallback="true"]')).toBeNull();
  });

  it("frameable=false renders the fallback CTA and no iframe", () => {
    const { container, getByText } = render(
      <OriginalFrame url={url} sourceName="Example" frameable={false} />,
    );
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector('[data-frame-fallback="true"]')).toBeTruthy();
    const cta = getByText(/Read the full article on Example/);
    expect(cta.getAttribute("href")).toBe(url);
    expect(cta.getAttribute("target")).toBe("_blank");
    expect(cta.getAttribute("rel")).toContain("noopener");
  });

  it("frameable=null renders the fallback CTA and no iframe", () => {
    const { container } = render(
      <OriginalFrame url={url} sourceName="Example" frameable={null} />,
    );
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector('[data-frame-fallback="true"]')).toBeTruthy();
  });

  it("always exposes an outbound Open button to the original", () => {
    const { getAllByText } = render(
      <OriginalFrame url={url} sourceName="Example" frameable={true} />,
    );
    const open = getAllByText(/Open on Example/)[0] as HTMLAnchorElement;
    expect(open.getAttribute("href")).toBe(url);
    expect(open.getAttribute("rel")).toContain("noreferrer");
  });
});
