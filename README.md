# Neerthadam observation explorer

Install with `npm ci`, then run `npm run dev`. Use `npm run build` for a production build in `dist/`.

The app reads `public/data/catalog.json`, versioned independently through its schema version. The catalog supplies compatible group boundaries, dated observation rasters, native pair differences, coverage geometry and statistics over fixed common support. Each displayed raster includes image coordinates and display limits. Candidate outlines represent the separate noise-screened analysis where present. Optional gridded precipitation windows come from `public/context/rainfall.json`.
