import type { Layer, LonLat } from './catalog'

export type OpticalObservation = {
  id: string
  sensor: 'Sentinel-2' | 'Landsat'
  acquiredAt: string
  productId: string
  sourceUrl: string
  coveragePercent: number
  resolutionMeters: number
  qualityFlags: string[]
  attribution?: string
  assets: Record<string, string>
  coordinates: Layer['coordinates']
}
export type OpticalDerived = {
  id: string; kind: string; observationIds: string[]; assets: Record<string, string>;
  coordinates?: Layer['coordinates']; resolutionMeters?: number; coveragePercent?: number; formula?: string
}
export type OpticalCatalog = { observations: OpticalObservation[]; derivedProducts: OpticalDerived[] }
export type ContextRaster = { url: string; coordinates: [LonLat, LonLat, LonLat, LonLat] }
