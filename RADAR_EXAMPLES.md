# Radar example provenance

Coordinates are WGS84 longitude and latitude. Each marker is centered on a native 10 m grid cell in EPSG:32644. The reference is the provisional NISAR L2 GCOV P05023 descending Track 149, frame 82, Frequency A observations at 13:11:05 UTC on July 6 and July 18, 2026.

| Example | Longitude, latitude | UTM easting, northing (m) | Native row, column (zero-based) | July 6 HH / HV (dB) | July 18 HH / HV (dB) |
| --- | --- | --- | --- | --- | --- |
| Wetland vegetation | 80.219902429, 12.947373175 | 415385, 1431445 | 232, 130 | −6.873 / −16.798 | −7.547 / −16.106 |
| Open water | 80.225932650, 12.964932630 | 416045, 1433385 | 38, 196 | −11.989 / −21.883 | −10.617 / −22.115 |
| Built-up area | 80.210688787, 12.945717887 | 414385, 1431265 | 250, 30 | +6.312 / −11.864 | +8.367 / −14.470 |

- **Wetland vegetation.** The ESA WorldCover 2021 v200 tile N12E078 (local crop `data/reference/worldcover_2021_pallikaranai.tif` from the workspace root) assigns class 90, herbaceous wetland. This center is within a contiguous patch where the July 15, 2026 cloud-screened Sentinel-2 image shows green vegetation and the displayed NDVI layer shows a strong vegetation signal. The Sentinel-2 date is nine days after July 6 and three days before July 18. These sources establish the vegetation example. Flooding would require separate evidence. [ESA WorldCover](https://esa-worldcover.org/en/data-access) · [Sentinel-2 scene and screening provenance](public/context/sentinel/manifest.json)
- **Built-up area.** The native center falls inside an OpenStreetMap building polygon from the November 1, 2026 OpenFreeMap snapshot. WorldCover assigns class 50, built-up, and the July 15 Sentinel-2 RGB image shows a developed surface at the point. Both archived native classification rasters have class 3, possible inundated vegetation, at this cell. This overlap illustrates the urban interpretation failure. Geographic alignment, radar layover, and the dates of the reference layers limit inference about the exact structures returning the signal. [Building geometry](public/context/pallikaranai-buildings.geojson) · [Snapshot provenance](public/context/pallikaranai-buildings.provenance.json) · [Classification manifest](public/context/inundation/manifest.json)

## Measurement path

The reference granules are:

- `NISAR_L2_PR_GCOV_024_149_D_082_4005_DHDH_A_20260706T131105_20260706T131137_P05023_N_F_J_001`
- `NISAR_L2_PR_GCOV_025_149_D_082_4005_DHDH_A_20260718T131105_20260718T131136_P05023_N_F_J_001`

The source GCOV power is linear gamma-zero. The existing export uses 10 × log₁₀(power) before publishing the quality-screened dB samples. The [sample catalog](public/data/samples.json) indexes north-up UTM grids containing consecutive little-endian Float32 HH and HV planes. The popup uses the existing native pixel sampler for the selected acquisition and displays finite samples in dB. A masked cell or absent measurement asset yields an unavailable reading. The composite uses independently clipped and normalized HH, HV, and HH−HV in its red, green, and blue channels. Display colors play no role in selecting or measuring the locations.

## Open water evidence

The open-water center intersects WorldCover class 80, permanent water. In both the July 13 and July 15 Sentinel-2 L2A products, all nine cells in the 3 × 3 native 20 m SCL window centered on the marker are class 6 (water). The June 30 Landsat 9 Collection 2 Level-2 scene has the clear bit set and the cloud, dilated cloud, shadow and cirrus flags clear at the marker. Its 3 × 3 native 30 m neighborhood has MNDWI from 0.16 to 0.20 and NDVI from 0.09 to 0.18. These optical indices use surface reflectance (DN × 0.0000275 − 0.2) and ratios (green − SWIR1)/(green + SWIR1) and (NIR − red)/(NIR + red). The broader positive MNDWI signal supports the water interpretation alongside the land-cover map and later optical classifications. Landsat QA itself leaves the water bit unset.

The June 30 and July 13 observations bracket July 6 by six and seven days. The July 8 Landsat pixel carries cloud and cirrus flags, and the July 3, 8 and 18 Sentinel-2 scenes have zero retained Ramsar site centers. The open-water label is an inference from the independent bracketing records and permanent water mapping. The archives provide no clear same-day optical confirmation for July 6 or July 18. [June 30 Landsat 9 STAC item](https://planetarycomputer.microsoft.com/api/stac/v1/collections/landsat-c2-l2/items/LC09_L2SP_142051_20260630_02_T1) · [July 13 Sentinel-2 STAC item](https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/S2C_44PMV_20260713_0_L2A) · [July 15 Sentinel-2 provenance](public/context/sentinel/manifest.json)
