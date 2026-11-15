import type { LonLat } from './catalog'

export type RadarExample = {
  id: string; number: number; point: LonLat; title: string; description: string
  sources: { label: string; href: string }[]
  evidenceDate: string; evidence: string; note?: string
}

const sentinel = {
  label: 'Sentinel-2 L2A · 15 Jul 2026',
  href: 'https://stac.dataspace.copernicus.eu/v1/collections/sentinel-2-l2a/items/S2A_MSIL2A_20260715T050241_N0512_R119_T44PMV_20260715T100502',
}
const worldCover = { label: 'ESA WorldCover 2021', href: 'https://esa-worldcover.org/en/data-access' }

export const radarExamples: RadarExample[] = [
  {
    id: 'wetland-vegetation', number: 1, point: [80.219902429, 12.947373175],
    title: 'Wetland vegetation',
    description: 'Plant structure, surface conditions and moisture can all affect the radar return here.',
    sources: [sentinel, worldCover],
    evidenceDate: '2026-07-15',
    evidence: 'WorldCover maps herbaceous wetland here. The July 15 optical image shows a vegetated patch.',
    note: 'The optical evidence supports vegetation. Flooding at this point remains unverified.',
  },
  {
    id: 'open-water', number: 2, point: [80.225932650, 12.964932630],
    title: 'Open water',
    description: 'Smooth water often returns little radar energy toward the satellite. Wind and viewing conditions can change the return.',
    sources: [{
      label: 'Landsat 9 · 30 Jun 2026',
      href: 'https://planetarycomputer.microsoft.com/api/stac/v1/collections/landsat-c2-l2/items/LC09_L2SP_142051_20260630_02_T1',
    }, {
      label: 'Sentinel-2 L2A · 13 Jul 2026',
      href: 'https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/S2C_44PMV_20260713_0_L2A',
    }, sentinel, worldCover],
    evidenceDate: '2026-07-15',
    evidence: 'WorldCover maps permanent water here. Optical observations before and after July 6 support open water at this location.',
    note: 'The July 6 interpretation comes from bracketing optical dates. Water conditions can vary between observations.',
  },
  {
    id: 'built-up', number: 3, point: [80.210688787, 12.945717887],
    title: 'Built-up area',
    description: 'Buildings and nearby ground can create strong reflections resembling signatures from vegetation standing in water.',
    sources: [sentinel, worldCover, {
      label: 'OpenStreetMap building snapshot · 1 Nov 2026',
      href: 'context/pallikaranai-buildings.provenance.json',
    }],
    evidenceDate: '2026-07-15',
    evidence: 'The marker sits within a mapped building. WorldCover flags built-up land and the July 15 optical image shows a developed surface.',
    note: 'The July 6 and 18 Track 149 Frequency A estimates flag this building pixel as possible inundated vegetation, illustrating an urban false positive.',
  },
]
