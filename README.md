# Neerthadam · Pallikaranai Marsh

Explore repeated NISAR observations of Pallikaranai Marsh, Chennai. The map opens with the 10 m Detailed Marsh radar view, the Ramsar designation, mapped buildings and waterways.

SI assisted in generating Neerthadam’s code and derived data products. [Project repository](https://github.com/sam9111/neerthadam)

```sh
npm ci
npm run dev
npm run build
```

Open the Vite URL printed by the development server. The production build writes the static application to `dist/`. Radar, optical imagery and local context are served from `public/`. The satellite basemap and detailed infrastructure use Esri and OpenFreeMap.

- Use the timeline to browse acquisitions. **Play** advances through a verified compatible sequence.
- **Compare** opens a catalog-approved pair. Drag the divider or move the slider with the keyboard.
- **Layers** switches between 10 m Frequency A and 80 m Frequency B and controls optical imagery and geographic overlays.
- **Reading the radar** explains the false-color display. **Imagery Details** lists acquisition metadata, coverage, display ranges and provenance.
- **Help** replays the six-chapter first-visit tour.

The three existing manifests in `public/data/` supply observation metadata and verified pairs, false-color rasters and native sample grids. The supplemental product metadata adds source registry information by granule ID. The native sidecars hold little-endian Float32 HH and HV layers, with NaN for NoData.

See the [acquisition audit](../docs/v2-acquisition-audit.md) for dates, coverage and scientific limits and the [implementation and verification report](../docs/neerthadam-v2.md) for the browser checks, screenshots and ingestion contract.
