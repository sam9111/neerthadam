# Neerthadam · Pallikaranai Marsh

Neerthadam is a map-first Earth observation workspace for establishing a wetland monitoring baseline. It compares measured radar returns and provides independently dated optical and rainfall context.

```sh
npm ci
npm run dev
npm run build
```

Open the Vite URL printed by the development server. The build runs TypeScript checks and writes the static application to `dist/`. Core observations are served locally from `public/`. The reference imagery and infrastructure overlays use Esri and OpenFreeMap tile services.

## Workflows

- **Observe** selects actual acquisition dates, compatible groups and HH/HV. Toggle valid and missing footprints and expand the source metadata and opacity controls.
- **Compare** uses catalog-approved pairs. Drag the map divider or use the slider with a keyboard. Switch to native later-minus-earlier backscatter, and click the map for both dates' native samples and per-channel differences.
- **Investigate** uses the same map and observation selection. Radar vs. Optical swipes radar against the independently dated, cloud-screened July 15 Sentinel-2 RGB. Optical mode includes NDVI and MNDWI. Click for the evidence drawer and its 3-, 7-, and 14-complete-UTC-day regional rainfall windows. Roads and waterways are optional geographic context.
- **Guided tour** walks first-time visitors through the real layers. Replay it using Tour in the workspace header.

## Data and limitations

The default pair is July 6 and 18, 2026, provisional NISAR L-band Frequency A, descending track 149/frame 82. The catalog reports 100% joint site support before optional noise screening and area-weighted native differences of +0.701 dB HH and +0.236 dB HV. The separate validated track 84 Frequency B example has about 39.12% paired valid coverage. The October and November rainfall windows are incomplete. Harmony-only acquisitions need source-quality checks before publication in this catalog.

Radar coverage uses area-weighted Ramsar overlap with the applicable masks. Optical RGB coverage uses 10 m site pixel centers retained by the scene classification mask. The dates and denominators are listed separately. Native grid posting and physical resolving power are distinct. Radar differences have several possible causes, and the available optical and rainfall observations supply context with limited causal evidence.

`public/data/catalog.json` supplies rendered NISAR layers, coverage, and provenance. `public/data/samples.json` indexes little-endian Float32 sidecars (HH followed by HV, NaN for NoData) by group and granule. From the full research workspace, regenerate the sidecars and supplemental footprints with `.venv/bin/python scripts/export_web_inspection.py`, after generating the observation catalog. The shipped assets can be served without the Python pipeline.
