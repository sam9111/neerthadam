import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import maplibre, { type StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { asset, type Catalog, type LonLat } from './catalog'
import type { ContextRaster } from './context'

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

type Swipe = { raster: ContextRaster; left: string; right: string }

type Props = {
  site: Catalog['site']; raster?: ContextRaster; optical: boolean; opacity: number
  coverage?: string; missing?: string; swipe?: Swipe
  leftCoverage?: string; leftMissing?: string
  selected?: LonLat; onInspect: (point: LonLat) => void
  infrastructure: boolean
}

function padding() {
  return window.innerWidth < 720
    ? { top: 110, bottom: 190, left: 30, right: 54 }
    : { top: 80, bottom: 120, left: 345, right: 100 }
}

function rasterLayer(view: maplibre.Map, raster: ContextRaster | undefined, opacity: number) {
  const source = view.getSource<maplibre.ImageSource>('observation')
  if (source) {
    const current = source.serialize()
    if (raster && (current.type !== 'image' || current.url !== asset(raster.url))) {
      source.updateImage({ url: asset(raster.url), coordinates: raster.coordinates })
    }
    view.setLayoutProperty('observation', 'visibility', raster ? 'visible' : 'none')
    view.setPaintProperty('observation', 'raster-opacity', opacity)
  } else if (raster) {
    view.addSource('observation', { type: 'image', url: asset(raster.url), coordinates: raster.coordinates })
    view.addLayer({ id: 'observation', type: 'raster', source: 'observation', paint: {
      'raster-opacity': opacity, 'raster-resampling': 'nearest', 'raster-fade-duration': 0,
    } }, 'site-outline')
  }
}

function addBoundary(view: maplibre.Map, site: Catalog['site']) {
  view.addSource('site', { type: 'geojson', data: asset(site.boundaryUrl) })
  view.addLayer({ id: 'site-outline', type: 'line', source: 'site',
    paint: { 'line-color': '#f2e1b0', 'line-width': 1.8 } })
}

function setFootprint(view: maplibre.Map, id: string, path: string | undefined, color: string) {
  const source = view.getSource<maplibre.GeoJSONSource>(id)
  if (!path) {
    if (source) view.setLayoutProperty(id, 'visibility', 'none')
    return
  }
  if (source) {
    void source.setData(asset(path))
    view.setLayoutProperty(id, 'visibility', 'visible')
    return
  }
  view.addSource(id, { type: 'geojson', data: asset(path) })
  view.addLayer({ id, type: 'fill', source: id, paint: {
    'fill-color': color, 'fill-opacity': .35, 'fill-outline-color': color,
  } }, 'site-outline')
}

function addInfrastructure(view: maplibre.Map) {
  view.addSource('infrastructure', { type: 'vector', url: 'https://tiles.openfreemap.org/planet',
    attribution: '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a> · OpenFreeMap' })
  view.addLayer({ id: 'roads', type: 'line', source: 'infrastructure', 'source-layer': 'transportation',
    filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']]],
    paint: { 'line-color': '#ffdb89', 'line-width': 1.7 } }, 'site-outline')
  view.addLayer({ id: 'waterways', type: 'line', source: 'infrastructure', 'source-layer': 'waterway',
    paint: { 'line-color': '#7ccaff', 'line-width': 2 } }, 'site-outline')
}

export function RadarMap({ site, raster, optical, opacity, coverage, missing, leftCoverage, leftMissing, swipe, selected, onInspect, infrastructure }: Props) {
  const shell = useRef<HTMLDivElement>(null)
  const primaryNode = useRef<HTMLDivElement>(null)
  const overlayNode = useRef<HTMLDivElement>(null)
  const primary = useRef<maplibre.Map | null>(null)
  const overlay = useRef<maplibre.Map | null>(null)
  const [ready, setReady] = useState(false)
  const [overlayReady, setOverlayReady] = useState(false)
  const [failure, setFailure] = useState(false)
  const [primaryError, setPrimaryError] = useState(false)
  const [overlayError, setOverlayError] = useState(false)
  const [split, setSplit] = useState(50)
  const inspecting = useRef(onInspect)
  const hasSwipe = Boolean(swipe)

  useLayoutEffect(() => { inspecting.current = onInspect }, [onInspect])
  const bounds: maplibre.LngLatBoundsLike = [[site.bounds[0], site.bounds[1]], [site.bounds[2], site.bounds[3]]]

  useEffect(() => {
    let view: maplibre.Map
    try {
      view = new maplibre.Map({ container: primaryNode.current!, style, bounds,
        fitBoundsOptions: { padding: padding(), duration: 0 }, maxPitch: 0, dragRotate: false,
        attributionControl: { compact: true } })
    } catch {
      setFailure(true)
      return
    }
    primary.current = view
    view.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right')
    view.addControl(new maplibre.ScaleControl({ maxWidth: 95, unit: 'metric' }), 'bottom-right')
    view.on('click', event => inspecting.current([event.lngLat.lng, event.lngLat.lat]))
    view.on('error', event => {
      if ('sourceId' in event && ['observation', 'site', 'valid', 'missing'].includes(String(event.sourceId))) setPrimaryError(true)
    })
    view.on('load', () => {
      addBoundary(view, site)
      setReady(true)
    })
    return () => { view.remove(); primary.current = null }
  }, [site])

  useEffect(() => {
    const master = primary.current
    if (!ready || !hasSwipe || !master || !overlayNode.current) return
    let view: maplibre.Map
    try {
      view = new maplibre.Map({ container: overlayNode.current, style, interactive: false,
        attributionControl: false, maxPitch: 0 })
    } catch {
      setOverlayError(true)
      return
    }
    overlay.current = view
    const sync = () => view.jumpTo({ center: master.getCenter(), zoom: master.getZoom(),
      bearing: master.getBearing(), padding: master.getPadding() })
    master.on('move', sync)
    master.on('resize', sync)
    view.on('error', event => {
      if ('sourceId' in event && event.sourceId === 'observation') setOverlayError(true)
    })
    view.on('load', () => {
      sync()
      addBoundary(view, site)
      setOverlayReady(true)
    })
    sync()
    return () => {
      master.off('move', sync)
      master.off('resize', sync)
      view.remove()
      overlay.current = null
      setOverlayReady(false)
      setOverlayError(false)
    }
  }, [ready, hasSwipe, site])

  useEffect(() => {
    if (!ready || !primary.current) return
    setPrimaryError(false)
    rasterLayer(primary.current, raster, opacity)
    primary.current.setPaintProperty('satellite', 'raster-saturation', optical ? 0 : -.58)
  }, [ready, raster, opacity, optical])

  const leftRaster = swipe?.raster
  useEffect(() => {
    if (!overlayReady || !overlay.current) return
    setOverlayError(false)
    rasterLayer(overlay.current, leftRaster, opacity)
  }, [overlayReady, leftRaster, opacity])

  useEffect(() => {
    if (!ready || !primary.current) return
    for (const view of [primary.current, overlayReady ? overlay.current : null]) {
      if (!view) continue
      setFootprint(view, 'valid', view === overlay.current ? leftCoverage ?? coverage : coverage, '#53e4ce')
      setFootprint(view, 'missing', view === overlay.current ? leftMissing ?? missing : missing, '#ecad61')
    }
  }, [ready, overlayReady, coverage, missing, leftCoverage, leftMissing])

  useEffect(() => {
    const view = primary.current
    if (!ready || !view) return
    if (infrastructure && !view.getSource('infrastructure')) addInfrastructure(view)
    for (const id of ['roads', 'waterways']) {
      if (view.getLayer(id)) view.setLayoutProperty(id, 'visibility', infrastructure ? 'visible' : 'none')
    }
  }, [ready, infrastructure])

  useEffect(() => {
    if (!ready || !primary.current || !selected) return
    const view = primary.current
    const pin = document.createElement('span')
    pin.className = 'inspection-marker'
    pin.setAttribute('aria-hidden', 'true')
    const marker = new maplibre.Marker({ element: pin }).setLngLat(selected).addTo(view)
    return () => { marker.remove() }
  }, [ready, selected])

  function moveDivider(event: PointerEvent<HTMLDivElement>) {
    const rect = shell.current?.getBoundingClientRect()
    if (rect?.width) setSplit(Math.round(Math.max(0, Math.min(100, (event.clientX - rect.left) * 100 / rect.width))))
  }

  return <div ref={shell} className="map-shell">
    <div ref={primaryNode} className="map-canvas" aria-label="Interactive map of Pallikaranai Marsh" />
    {swipe && !failure && <>
      <div ref={overlayNode} className="map-canvas swipe-map" aria-hidden="true"
        style={{ clipPath: `inset(0 ${100 - split}% 0 0)`, visibility: overlayReady ? 'visible' : 'hidden' }} />
      <div className="map-divider" style={{ left: `${split}%` }} aria-hidden="true"
        onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); moveDivider(event) }}
        onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) moveDivider(event) }}>
        <span>↔</span>
      </div>
      <div className="map-swipe floating">
        <div><span>{swipe.left}</span><span>{swipe.right}</span></div>
        <input type="range" min="0" max="100" value={split} aria-label="Map swipe divider"
          aria-valuetext={`${split}% ${swipe.left}`} onChange={event => setSplit(Number(event.target.value))} />
      </div>
    </>}
    {failure && <div className="map-fallback">{raster && <img src={asset(raster.url)} alt="Observation raster preview" />}
      <p>Interactive mapping requires WebGL.</p></div>}
    {(primaryError || overlayError) && <p className="map-status floating" role="status">A selected map layer could not load.</p>}
    {!ready && !failure && <p className="map-status floating" role="status">Loading map…</p>}
    <button type="button" className="fit floating" onClick={() => primary.current?.fitBounds(bounds,
      { padding: padding(), duration: 350 })} disabled={!ready} aria-label="Fit map to Ramsar site" title="Fit to marsh">⌖</button>
  </div>
}
