# Neerthadam · நீர்த்தடம்

Neerthadam is an interactive explorer for NASA–ISRO NISAR radar observations of Pallikaranai Marsh, a Ramsar wetland in Chennai, India. Use the map to browse acquisitions, compare radar and optical imagery, and see how wetland vegetation, open water, and buildings can produce different radar returns.



[Neerthadam Presentation.pdf](https://github.com/user-attachments/files/34896367/Neerthadam.Presentation.1.pdf)

https://github.com/user-attachments/assets/19805e37-d532-4173-87b2-6e9217c5f9d1



## Explore the map

- **Acquisition timeline** — Browse 15 NISAR acquisitions from June 25 to November 11, 2026, across Tracks 84, 149, and 156. Use **Layers** to switch between the 10 m Frequency A and 80 m Frequency B views where available.
- **Reading the radar** — Learn how the false-color composite assigns HH to red, HV to green, and HH−HV to blue. Each channel is scaled for display. Similar colors can occur over different surfaces. [NASA guide to NISAR polarimetry](https://science.nasa.gov/mission/nisar/polarimetry/)
- **Radar examples** — Open three optional map markers for wetland vegetation, open water, and a built-up area. The popovers show dated reference evidence and native HH/HV measurements in dB for the selected acquisition, where available.
- **Optical imagery** — Use the swipe divider to compare a Sentinel-2 image with the radar view. The divider labels show the acquisition date of each image.
- **Inundation estimate** — Explore two **experimental, locally unvalidated** 10 m estimates for July 6 and July 18, 2026. The map falls back to radar when the selected acquisition has no classification raster.

## Data and methods

The app uses calibrated NISAR Level-2 Geocoded Covariance (GCOV) products. The archive contains **28 false-color composites and 28 native measurement grids**, with **12.45 million valid paired HH/HV pixel samples**. The sample count includes repeat observations of the same location across dates and frequencies. [Observation catalog](public/data/catalog.json) · [Radar example coordinates and provenance](RADAR_EXAMPLES.md)

The inundation prototype applies experimental thresholds to radar-derived features to identify candidate open water and possible inundated vegetation. Some candidate vegetation pixels overlap mapped buildings. A developed-land exclusion is under evaluation for future estimates. Confirmed flooding, water depth, and vegetation condition require independent evidence. [Published raster manifest](public/context/inundation/manifest.json) · [Upstream NISAR inundation methodology](https://github.com/NISAR-Science-Algorithms/NISAR_Inundation/blob/main/notebooks/NISAR_L3_Inundation_ProductGeneration.ipynb)

## Run locally

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. To create a production build, run `npm run build`. The build output is written to `dist/`.

## Acknowledgments

Neerthadam’s code and derived data products were generated with SI assistance. Source observations and reference data come from NASA–ISRO NISAR, Copernicus Sentinel-2, USGS Landsat, ESA WorldCover, OpenStreetMap contributors, and the Ramsar Sites Information Service. The app and its provenance records identify the sources used for each layer and example.
