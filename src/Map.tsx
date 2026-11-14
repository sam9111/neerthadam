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

export type ChangePoint = {
  polarization: Polarization
  pixel_centroid_lon_lat: [number, number]
  median_change_db: number
  site_area_ha: number
  tail: 'upper' | 'lower'
}

type Props = {
  site: Catalog['site']; layer: Layer; coverage: string; showCoverage: boolean
  optical: boolean; points: ChangePoint[]; selected?: ChangePoint
  onSelect: (point: ChangePoint) => void
}

function sitePadding() {
  return window.innerWidth < 720
    ? { top: 75, bottom: 240, left: 24, right: 24 }
    : { top: 76, bottom: 40, left: 365, right: 92 }
}

export function RadarMap({ site, layer, coverage, showCoverage, optical, points, selected, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<maplibre.Map | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  function reset() {
    if (!map.current) return
    map.current.fitBounds([[site.bounds[0], site.bounds[1]], [site.bounds[2], site.bounds[3]]],
      { padding: sitePadding(), duration: 350 })
  }

  useEffect(() => {
    if (!container.current) return
    let view
    try {
      view = new maplibre.Map({
        container: container.current, style,
        bounds: [[site.bounds[0], site.bounds[1]], [site.bounds[2], site.bounds[3]]],
        fitBoundsOptions: { padding: sitePadding(), duration: 0 },
        attributionControl: { compact: true }, maxPitch: 0, dragRotate: false,
      })
    } catch {
      setFailed(true)
      return
    }
    map.current = view
    view.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right')
    view.addControl(new maplibre.ScaleControl({ maxWidth: 95, unit: 'metric' }), 'bottom-right')
    view.on('load', () => {
      view.fitBounds([[site.bounds[0], site.bounds[1]], [site.bounds[2], site.bounds[3]]],
        { padding: sitePadding(), duration: 0 })
      requestAnimationFrame(() => {
        if (map.current !== view) return
        view.resize()
        view.fitBounds([[site.bounds[0], site.bounds[1]], [site.bounds[2], site.bounds[3]]],
          { padding: sitePadding(), duration: 0 })
      })
      view.addSource('site', { type: 'geojson', data: asset(site.boundaryUrl) })
      view.addLayer({ id: 'site-outline-shadow', type: 'line', source: 'site',
        paint: { 'line-color': '#142227', 'line-width': 4, 'line-opacity': 0.9 } })
      view.addLayer({ id: 'site-outline', type: 'line', source: 'site',
        paint: { 'line-color': '#f2e1b0', 'line-width': 1.8 } })
      view.addSource('infrastructure', { type: 'vector', url: 'https://tiles.openfreemap.org/planet',
        attribution: '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a> · OpenFreeMap' })
      view.addLayer({ id: 'buildings', type: 'fill', source: 'infrastructure', 'source-layer': 'building', minzoom: 14,
        layout: { visibility: 'none' },
        paint: { 'fill-color': '#5ee9dc', 'fill-outline-color': '#a8fff0', 'fill-opacity': .50 } })
      view.addLayer({ id: 'roads', type: 'line', source: 'infrastructure', 'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor']]], layout: { visibility: 'none' },
        paint: { 'line-color': '#ffdb89', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.5, 17, 3],
          'line-opacity': .92 } })
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
    view.setPaintProperty('radar', 'raster-opacity', optical ? 0 : .88)
    view.setPaintProperty('satellite', 'raster-opacity', optical ? 1 : .82)
    view.setPaintProperty('satellite', 'raster-saturation', optical ? 0 : -.52)
    view.setPaintProperty('satellite', 'raster-brightness-max', optical ? 1 : .8)
    for (const id of ['roads', 'buildings']) view.setLayoutProperty(id, 'visibility', optical ? 'visible' : 'none')
  }, [layer, optical, loaded])

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
    const markers = points.map((point, index) => {
      const element = document.createElement('button')
      const stronger = point.tail === 'upper'
      const title = stronger ? 'Stronger radar return' : 'Weaker radar return'
      const amount = `${point.median_change_db > 0 ? '+' : ''}${point.median_change_db.toFixed(1)} dB`
      element.type = 'button'
      element.className = `change-marker ${point.tail}`
      element.textContent = String(index + 1)
      element.setAttribute('aria-pressed', String(selected === point))
      element.setAttribute('aria-label', `Candidate ${index + 1}: ${title}, ${amount}`)
      const tooltip = document.createElement('span')
      tooltip.className = 'marker-tip'
      tooltip.textContent = `${title} · ${amount}`
      element.append(tooltip)
      element.addEventListener('click', event => {
        event.stopPropagation()
        onSelect(point)
        view.easeTo({ center: point.pixel_centroid_lon_lat, zoom: Math.max(15.2, view.getZoom()),
          offset: window.innerWidth < 720 ? [0, -95] : [-105, 5], duration: 500 })
      })
      const marker = new maplibre.Marker({ element }).setLngLat(point.pixel_centroid_lon_lat).addTo(view)
      return marker
    })
    return () => markers.forEach(marker => marker.remove())
  }, [loaded, points, onSelect, selected])

  return <div className="map-shell">
    <div ref={container} className="map-canvas" aria-label="Interactive map of Pallikaranai Marsh" />
    {failed && <div className="map-fallback"><img src={asset(layer.url)} alt="Radar layer preview" />
      <p>Interactive mapping requires WebGL. Showing the selected radar raster.</p></div>}
    <button type="button" className="fit floating" onClick={reset} disabled={failed} aria-label="Fit map to Ramsar site" title="Fit to marsh">⌖</button>
    {selected && <span className="sr-only">Selected candidate {selected.median_change_db.toFixed(1)} dB</span>}
  </div>
}
