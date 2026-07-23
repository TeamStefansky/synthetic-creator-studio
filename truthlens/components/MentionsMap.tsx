"use client";

// Interactive world map of brand mentions (deck.gl). Plots one bubble per source
// country at its centroid, sized by mention count, over a keyless CARTO dark
// basemap (no Mapbox token). Client-only (loaded via next/dynamic ssr:false).
// Country granularity by design - source countries, never a person's location.

import { useMemo } from "react";
import { DeckGL, TileLayer, BitmapLayer, ScatterplotLayer } from "deck.gl";
import type { CountryCount } from "@/lib/mentions-map";

const INITIAL_VIEW_STATE = {
  longitude: 10, latitude: 25, zoom: 1.1, minZoom: 0.5, maxZoom: 8, pitch: 0, bearing: 0,
};

export default function MentionsMap({ data }: { data: CountryCount[] }) {
  const points = useMemo(
    () => data.filter((d) => typeof d.lat === "number" && typeof d.lon === "number"),
    [data],
  );
  const max = useMemo(() => Math.max(1, ...points.map((p) => p.count)), [points]);

  if (points.length === 0) {
    return (
      <div className="grid h-[300px] place-items-center rounded-xl border border-white/10 text-sm text-ink-secondary">
        No mapped source countries for these mentions.
      </div>
    );
  }

  const basemap = new TileLayer<any>({
    id: "carto-dark",
    data: "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
    minZoom: 0,
    maxZoom: 19,
    tileSize: 256,
    renderSubLayers: (props: any) => {
      const bb = props.tile.boundingBox;
      return new BitmapLayer(props, {
        data: undefined,
        image: props.data,
        bounds: [bb[0][0], bb[0][1], bb[1][0], bb[1][1]],
      });
    },
  });

  const bubbles = new ScatterplotLayer<CountryCount>({
    id: "mention-bubbles",
    data: points,
    getPosition: (d: CountryCount) => [d.lon as number, d.lat as number],
    getRadius: (d: CountryCount) => 5 + (d.count / max) * 34,
    radiusUnits: "pixels",
    radiusMinPixels: 4,
    getFillColor: [225, 128, 74, 150], // warm orange (Aurora), translucent
    getLineColor: [127, 73, 225, 230], // primary purple
    lineWidthMinPixels: 1,
    stroked: true,
    filled: true,
    pickable: true,
  });

  return (
    <div className="relative h-[420px] w-full overflow-hidden rounded-xl border border-white/10">
      <DeckGL
        initialViewState={INITIAL_VIEW_STATE}
        controller={true}
        layers={[basemap, bubbles]}
        getTooltip={({ object }: any) =>
          object && { text: `${object.flag ? object.flag + " " : ""}${object.label}: ${object.count}` }
        }
      />
    </div>
  );
}
