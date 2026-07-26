// Minimal declaration for d3-force-3d (no bundled types, no @types package).
// We use only forceCollide, applied to the react-force-graph simulation to give
// each node a label-width-aware collision radius so labels never overlap.
declare module "d3-force-3d" {
  type RadiusAccessor = number | ((node: any, i: number, nodes: any[]) => number);
  interface CollideForce {
    (alpha: number): void;
    radius(r: RadiusAccessor): CollideForce;
    strength(s: number): CollideForce;
    iterations(n: number): CollideForce;
  }
  export function forceCollide(radius?: RadiusAccessor): CollideForce;
}
