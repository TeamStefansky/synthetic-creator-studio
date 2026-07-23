// Land dot-grid for the SIGNAL console world map. The rowsHex bitmap is a
// coarse Natural-Earth-derived land mask (each set bit = a land cell) used to
// draw a dotted continent silhouette on a <canvas>, matching the equirectangular
// projection used to plot mention markers. Data only - no network, no secrets.

export interface LandGrid {
  cols: number;
  rows: number;
  latTop: number;
  latBot: number;
  rowsHex: string[];
}

export const GRID: LandGrid = {
  cols: 200,
  rows: 88,
  latTop: 75.0,
  latBot: -56.0,
  rowsHex: [
    "1fff0000c0000000001fffff00000000180000000",
    "40ffffffe2c0600000000007fffe0007cb92b80000000",
    "ffefffffffee060000000000ffffc00ffc83f980000001",
    "381fffffffffffee00001f8000007fff403e51aff9781ffe00",
    "fffffffffffffffffa13ffe000000fff807877a31fffffff81",
    "ffffffffffffffefffe7fff0000001ffc3f83ffffffffffc1f",
    "fffffffffffffffffffc7cfc000f003f817c1fffffffffff8c",
    "7fffffffffffffffffffff7e0003001f80f073fffffffff800",
    "bfffffffffffffffffffff3f8000000f004221ffffffffff00",
    "f87ffffffffffffffffff3f8000000e001e00ffffffffff00",
    "637ffffffffffffffffe3f80000000011e007fffffc03c00",
    "3803fffffffffffffffc5c0200000001fe00fffffc003000",
    "7801ffffffffffffffff1b0600000003fe07fffff8000800",
    "3c007fffffffffffffff82070000000fff3ffffff8000200",
    "1803ffffffffffffffffff8f8000001fff3ffffff4000000",
    "80bffffffffffffffffffde8000001fff7fffffe0000000",
    "bffffffffffffffffffe200000017ffffffffe0000000",
    "3fffffffffffffffffff800000038bfffffff40000000",
    "1fffffffffffffffffffc00000060ffffffff80000000",
    "1fffffffffffc7e1ffff800000005ffffffff80000000",
    "8ffffffffffff3e0ff7f800000001bfffffff80000000",
    "c1ffffffffffe3807cc3f800000001fffffff80000000",
    "ffffffffffc78cf981f800000001fffffff80000000",
    "4077ffffffffefff9800f8000000007ffffff80000000",
    "61ffffffffc7ff9000f8000000003ffffff80000000",
    "20cfffffffffcfff902878000000003ffffff00000000",
    "3cc3fffffffffff0003f80000000003fffffe00000000",
    "e07fffffffffff0003ff0000000001fffffc00000000",
    "107fffffffffff818fff80000000007ffff800000000",
    "ffffffffffffbf9fff80000000007fffe800000000",
    "ffffffffff7fffffffc00000000042fff000000000",
    "7ffffffffe7fbfffffe000000000403fc000000000",
    "7ffffffff4ff7ffffff000000001c03fa000000000",
    "bffffffe01fe7ffffff000000000003f0000000000",
    "1ffffffc0ffefffffff800000000003e0000000000",
    "7ffbffc1ffcfffffff800000001803e0000000000",
    "7f8ff01ffdfffffff8000000020c3e0000000000",
    "17f07f00ff9fffffff800000030067c0000002000",
    "807f03e007f9fffffff80000000007f80000000000",
    "80fd01e001f3fffffff80000000007e00000000000",
    "81fc00e000f7fffffffc000000003e000000000000",
    "101f801c0001ffffffff80000000038000000000000",
    "201e000c0000ffffffff80000000030000000000000",
    "100c000c000fffffffff00000017c30000000000000",
    "20048010000ffffffffe0000003ffc0000000000000",
    "20008010000ffffffffe000000ffe00000000000000",
    "230100000007fffff8fc000003ffe00000000000000",
    "38160000007ffffe800000007ffe00000000000000",
    "1c3c0000003ffffe00000000fffe00000000000000",
    "23e380000001ffffe00000000ffff00000000000000",
    "1e380000000ffffe00000001ffff80000000000000",
    "60de3000000007fffe00000007ffff80000000000000",
    "7ccdc6000000003fffc0000003fffff80000000000000",
    "11f00406000000003fffc0000007fffff80000000000000",
    "be00008000000003fff8000001ffffff80000000000000",
    "3e00070000000003fff8000001ffffff00000000000000",
    "204c02000000000003fff8000000ffffff00000000000000",
    "8000000000000003fff0000000fffffe00000000000000",
    "8c0000000000003fff00000007ffffe00000000000000",
    "8f0000000000087fff80000003ffffc00000000000000",
    "187e0000000000c7fff80000003ffffc00000000000000",
    "80001dfe0000000000e3fffc0000003ffff800000000000000",
    "1fff000000000071fff80000003fffe000000000000000",
    "3fff800000000060fff80000003fffe000000000000000",
    "7ffff000000000707ff80000001fffe000000000000000",
    "fffff80000000070fff00000001fffe000000000000000",
    "fffff80000000030fff000000003ffe000000000000000",
    "1fffff800000000003ff000000001ffe000000000000000",
    "1fffff800000000003ff000000001ffe000000000000000",
    "1fffff000000000003fe000000001fff000000000000000",
    "1fffff000000000001fc000000000fff000000000000000",
    "1fffff000000000001fc000000000fff000000000000000",
    "ff81f000000000000fc0000000007ff000000000000000",
    "ff8030000000000000c0000000003ff000000000000000",
    "10007e000000000000000000000000000ff000000000000000",
    "20007c000000000000000000000000000ff800000000000000",
    "6000000000000000000000000000000001f800000000000000",
    "2000000000000000000000000000000001f800000000000000",
    "1800200000000000000000000000000000f800000000000000",
    "c00200000000000000000000000000000f800000000000000",
    "600000000000000000000000000000000f800000000000000",
    "2000000000000000000000000000000003c00000000000000",
    "7c00000000000000",
    "40000000000000000003c00000000000000",
    "3c00000000000000",
    "3c00000000000000",
    "3800000000000000",
    "6000000000000000",
  ],
};

/** Equirectangular projection matched to the land grid (lat clamped to the grid
 * band). Returns pixel [x, y] within a VW x VH viewport. */
export function project(lat: number, lon: number, vw: number, vh: number): [number, number] {
  const clat = Math.max(GRID.latBot, Math.min(GRID.latTop, lat));
  const wlon = ((lon + 540) % 360) - 180;
  const x = ((wlon + 180) / 360) * vw;
  const y = ((GRID.latTop - clat) / (GRID.latTop - GRID.latBot)) * vh;
  return [x, y];
}

/** Draw the graticule + land dots onto a 2D canvas context sized to vw x vh
 * (already transformed for DPR by the caller). `dotColor` is the land dot fill. */
export function drawLand(ctx: CanvasRenderingContext2D, vw: number, vh: number, dotColor: string): void {
  ctx.clearRect(0, 0, vw, vh);
  // graticule
  ctx.strokeStyle = "rgba(27,39,64,.5)";
  ctx.lineWidth = 1;
  for (let lon = -150; lon <= 150; lon += 30) {
    const [x] = project(0, lon, vw, vh);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, vh);
    ctx.stroke();
  }
  for (let lat = -40; lat <= 70; lat += 20) {
    const [, y] = project(lat, 0, vw, vh);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(vw, y);
    ctx.stroke();
  }
  // land dots
  const cw = vw / GRID.cols;
  const chh = vh / GRID.rows;
  const rad = Math.max(0.9, Math.min(cw, chh) * 0.28);
  ctx.fillStyle = dotColor;
  for (let row = 0; row < GRID.rows; row++) {
    const hex = GRID.rowsHex[row];
    if (!hex) continue;
    const bits = BigInt("0x" + hex);
    if (bits === 0n) continue;
    const y = (row + 0.5) * chh;
    for (let c = 0; c < GRID.cols; c++) {
      if ((bits >> BigInt(c)) & 1n) {
        ctx.beginPath();
        ctx.arc((c + 0.5) * cw, y, rad, 0, 6.2832);
        ctx.fill();
      }
    }
  }
}
