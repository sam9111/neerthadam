import { useEffect, useRef, useState } from 'react'
import maplibre, { type StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { asset, type Catalog, type Layer, type Polarization } from './catalog'

const style: StyleSpecification = {
  version: 8,
  sources: {
    satellite: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256, maxzoom: 18,
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics and GIS community',
    },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#213434' } },
    { id: 'satellite', source: 'satellite', type: 'raster', paint: {
      'raster-opacity': 0.73, 'raster-saturation': -0.58, 'raster-brightness-max': 0.8,
    } },
  ],
}

type Props = {
  site: Catalog['site']; layer: Layer; coverage: string; candidateUrl?: string
  showCoverage: boolean; showCandidates: boolean; mode: 'observation' | 'change'
  opacity: number; polarization: Polarization; onCoverage: () => void
}

export function RadarMap({ site, layer, coverage, candidateUrl, showCoverage, showCandidates,
  mode, opacity, polarization, onCoverage }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<maplibre.Map | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  function reset() {
    if (!map.current) return
    map.current.fitBounds([[site.bounds[0], site.bounds[1]], [site.bounds[2], site.bounds[3]]],
      { padding: { top: 56, bottom: 52, left: 64, right: 64 }, duration: 350 })
  }

  useEffect(() => {
    if (!container.current) return
    let view
    try {
      view = new maplibre.Map({
        container: container.current, style,
        bounds: [[site.bounds[0], site.bounds[1]], [site.bounds[2], site.bounds[3]]],
        fitBoundsOptions: { padding: { top: 56, bottom: 52, left: 64, right: 64 }, duration: 0 },
        attributionControl: { compact: true }, maxPitch: 0, dragRotate: false,
      })
    } catch {
      setFailed(true)
      return
    }
    map.current = view
    view.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right')
    view.addControl(new maplibre.ScaleControl({ maxWidth: 95, unit: 'metric' }), 'bottom-left')
    view.on('load', () => {
      view.fitBounds([[site.bounds[0], site.bounds[1]], [site.bounds[2], site.bounds[3]]],
        { padding: { top: 56, bottom: 52, left: 64, right: 64 }, duration: 0 })
      requestAnimationFrame(() => {
        if (map.current !== view) return
        view.resize()
        view.fitBounds([[site.bounds[0], site.bounds[1]], [site.bounds[2], site.bounds[3]]],
          { padding: { top: 56, bottom: 52, left: 64, right: 64 }, duration: 0 })
      })
      view.addSource('site', { type: 'geojson', data: asset(site.boundaryUrl) })
      view.addLayer({ id: 'site-outline-shadow', type: 'line', source: 'site',
        paint: { 'line-color': '#142227', 'line-width': 4, 'line-opacity': 0.9 } })
      view.addLayer({ id: 'site-outline', type: 'line', source: 'site',
        paint: { 'line-color': '#f2e1b0', 'line-width': 1.8 } })
      setLoaded(true)
    })
    return () => {
      view.remove()
      map.current = null
    }
  }, [site])

  useEffect(() => {
    const view = map.current
    if (!loaded || !view) return
    const existing = view.getSource<maplibre.ImageSource>('radar')
    if (existing) existing.updateImage({ url: asset(layer.url), coordinates: layer.coordinates })
    else {
      view.addSource('radar', { type: 'image', url: asset(layer.url), coordinates: layer.coordinates })
      view.addLayer({ id: 'radar', type: 'raster', source: 'radar', paint: {
        'raster-fade-duration': 0, 'raster-resampling': 'nearest',
      } }, 'site-outline-shadow')
    }
  }, [layer, loaded])

  useEffect(() => {
    const view = map.current
    if (!loaded || !view?.getLayer('radar')) return
    view.setPaintProperty('radar', 'raster-opacity', opacity)
  }, [layer, opacity, loaded])

  useEffect(() => {
    const view = map.current
    if (!loaded || !view) return
    const current = view.getSource<maplibre.GeoJSONSource>('coverage')
    if (current) void current.setData(asset(coverage))
    else {
      view.addSource('coverage', { type: 'geojson', data: asset(coverage) })
      view.addLayer({ id: 'coverage-fill', type: 'fill', source: 'coverage',
        paint: { 'fill-color': '#32cfbd', 'fill-opacity': 0.26 } }, 'site-outline')
      view.addLayer({ id: 'coverage-outline', type: 'line', source: 'coverage',
        paint: { 'line-color': '#66f9e3', 'line-width': 2 } })
    }
    for (const id of ['coverage-fill', 'coverage-outline']) {
      view.setLayoutProperty(id, 'visibility', showCoverage ? 'visible' : 'none')
    }
  }, [loaded, coverage, showCoverage])

  useEffect(() => {
    const view = map.current
    if (!loaded || !view) return
    if (view.getLayer('candidates')) view.removeLayer('candidates')
    if (view.getSource('candidates')) view.removeSource('candidates')
    if (mode !== 'change' || !showCandidates || !candidateUrl) return
    view.addSource('candidates', { type: 'geojson', data: asset(candidateUrl) })
    view.addLayer({ id: 'candidates', type: 'line', source: 'candidates',
      filter: ['==', ['get', 'polarization'], polarization],
      paint: { 'line-color': '#d28dfc', 'line-width': 1.55 } })
  }, [loaded, mode, polarization, showCandidates, candidateUrl])

  return <div className="map-shell">
    <div ref={container} className="map-canvas" aria-label="Interactive map of Pallikaranai Marsh" />
    {failed && <div className="map-fallback"><img src={asset(layer.url)} alt="Radar layer preview" />
      <p>WebGL is unavailable. Showing the selected radar raster.</p></div>}
    <div className="map-actions">
      <button type="button" aria-pressed={showCoverage} onClick={onCoverage}>
        <span className="coverage-icon" aria-hidden="true">◈</span> Coverage
      </button>
      <button type="button" onClick={reset} disabled={failed} aria-label="Fit map to Ramsar site" title="Fit to site">⌖</button>
    </div>
    <div className="map-place"><span aria-hidden="true" /> Pallikaranai Marsh <small>RAMSAR SITE {site.id}</small></div>
  </div>
}
