import { useEffect, useRef, useState, type PointerEvent } from 'react'
import maplibre, { type StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { asset, type Catalog, type LonLat } from './catalog'
import type { ContextRaster } from './context'
import { loadRaster, rasterSwipe } from './RasterSwipe'

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

function addInfrastructure(view: maplibre.Map) {
  view.addSource('local-waterway', { type: 'geojson', data: asset('context/pallikaranai-waterway.geojson'),
    attribution: '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>' })
  view.addLayer({ id: 'local-waterway', type: 'line', source: 'local-waterway',
    paint: { 'line-color': '#7ccaff', 'line-width': 1.5, 'line-opacity': .82 } }, 'site-outline')
  view.addSource('infrastructure', { type: 'vector', url: 'https://tiles.openfreemap.org/planet',
    attribution: '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a> · OpenFreeMap' })
  view.addSource('building-overview', { type: 'geojson', data: asset('context/pallikaranai-buildings.geojson'),
    attribution: '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a> · OpenFreeMap' })
  view.addLayer({ id: 'building-overview', type: 'fill', source: 'building-overview', maxzoom: 13,
    paint: { 'fill-color': '#e6a26c', 'fill-opacity': .54 } }, 'site-outline')
  view.addLayer({ id: 'buildings', minzoom: 13, type: 'fill', source: 'infrastructure', 'source-layer': 'building',
    paint: { 'fill-color': '#e6a26c', 'fill-opacity': .42, 'fill-outline-color': '#bc825e' } }, 'site-outline')
  view.addLayer({ id: 'waterways', type: 'line', source: 'infrastructure', 'source-layer': 'waterway',
    paint: { 'line-color': '#7ccaff', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, .95, 15, 2], 'line-opacity': .82 } }, 'site-outline')
}

export type Annotation = {
  id: string; point: LonLat; title: string; description: string; evidence: string
  source: string; sourceUrl: string; verification: string; limitation: string; observationId?: string
}

type Props = {
  site: Catalog['site']; raster?: ContextRaster; hideBasemap: boolean
  swipe?: { raster: ContextRaster; left: string; right: string }
  buildings: boolean; waterways: boolean; boundary: boolean
  cameraRevision: number; annotations: Annotation[]
}

function padding() {
  return window.innerWidth < 720
    ? { top: 112, bottom: 195, left: 44, right: 44 }
    : { top: 90, bottom: 166, left: 160, right: 160 }
}

export function RadarMap({ site, raster, hideBasemap, swipe, buildings, waterways, boundary, cameraRevision, annotations }: Props) {
  const shell = useRef<HTMLDivElement>(null)
  const node = useRef<HTMLDivElement>(null)
  const map = useRef<maplibre.Map | null>(null)
  const renderer = useRef<ReturnType<typeof rasterSwipe> | null>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [pending, setPending] = useState(false)
  const [rasterError, setRasterError] = useState(false)
  const [contextError, setContextError] = useState(false)
  const [split, setSplit] = useState(50)
  const [presentedSwipe, setPresentedSwipe] = useState<Props['swipe']>()
  const leftRaster = swipe?.raster

  const bounds: maplibre.LngLatBoundsLike = [
    [site.bounds[0] - .025, site.bounds[1] - .009],
    [site.bounds[2] + .025, site.bounds[3] + .009],
  ]

  useEffect(() => {
    let view: maplibre.Map
    try {
      view = new maplibre.Map({ container: node.current!, style, bounds, renderWorldCopies: false,
        fitBoundsOptions: { padding: padding(), duration: 0 }, maxPitch: 0, dragRotate: false,
        attributionControl: { compact: true } })
    } catch {
      setFailed(true)
      return
    }
    map.current = view
    view.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right')
    view.addControl(new maplibre.ScaleControl({ maxWidth: 90, unit: 'metric' }), 'bottom-right')
    view.on('error', event => {
      if ('sourceId' in event && ['infrastructure', 'building-overview', 'local-waterway', 'satellite', 'site'].includes(String(event.sourceId))) {
        setContextError(true)
      }
    })
    view.on('load', () => {
      view.addSource('site', { type: 'geojson', data: asset(site.boundaryUrl) })
      view.addLayer({ id: 'site-outline', type: 'line', source: 'site',
        paint: { 'line-color': '#ddf4b1', 'line-width': 1.4 } })
      addInfrastructure(view)
      renderer.current = rasterSwipe(view)
      try { view.addLayer(renderer.current.layer, 'local-waterway') }
      catch { setFailed(true) }
      setReady(true)
    })
    return () => { view.remove(); map.current = null; renderer.current = null }
  }, [site])

  useEffect(() => {
    const view = map.current
    const imageLayer = renderer.current
    if (!ready || !view || !imageLayer) return
    let current = true
    setRasterError(false)
    if (!raster) {
      setPending(false)
      setPresentedSwipe(undefined)
      imageLayer.setFrames()
      view.setLayoutProperty('satellite', 'visibility', 'visible')
      return
    }
    setPending(true)
    Promise.all([loadRaster(raster), leftRaster ? loadRaster(leftRaster) : undefined]).then(([right, left]) => {
      if (!current) return
      setPending(false)
      setPresentedSwipe(swipe)
      view.setLayoutProperty('satellite', 'visibility', hideBasemap ? 'none' : 'visible')
      imageLayer.setFrames(right, left)
    }).catch(() => {
      if (!current) return
      setPending(false)
      setRasterError(true)
      setPresentedSwipe(undefined)
      view.setLayoutProperty('satellite', 'visibility', 'visible')
      imageLayer.setFrames()
    })
    return () => { current = false }
  }, [ready, raster, leftRaster, swipe?.left, swipe?.right, hideBasemap])

  useEffect(() => { renderer.current?.setSplit(split) }, [ready, split])

  function fit() {
    map.current?.fitBounds(bounds, { padding: padding(),
      duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 450 })
  }

  useEffect(() => { if (ready && cameraRevision) fit() }, [ready, cameraRevision])

  useEffect(() => {
    if (!ready || !map.current) return
    for (const [id, visible] of [['buildings', buildings], ['building-overview', buildings], ['waterways', waterways], ['local-waterway', waterways], ['site-outline', boundary]] as const) {
      map.current.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')
    }
  }, [ready, buildings, waterways, boundary])

  useEffect(() => {
    const view = map.current
    if (!ready || !view || !boundary || annotations.some(item => item.id === 'ramsar')) return
    const caption = document.createElement('span')
    caption.className = 'boundary-label'
    caption.textContent = 'Ramsar site'
    const marker = new maplibre.Marker({ element: caption, anchor: 'right', offset: [-7, 0] })
      .setLngLat(site.center).addTo(view)
    caption.removeAttribute('aria-label')
    caption.setAttribute('role', 'presentation')
    return () => { marker.remove() }
  }, [ready, site, boundary, annotations])

  useEffect(() => {
    const view = map.current
    if (!ready || !view) return
    const markers = annotations.map(annotation => {
      const button = document.createElement('button')
      button.className = 'annotation annotation-' + annotation.id
      button.type = 'button'
      button.textContent = annotation.title
      const content = document.createElement('div')
      const title = document.createElement('strong')
      title.textContent = annotation.title
      const body = document.createElement('p')
      body.textContent = annotation.description
      const source = document.createElement('a')
      source.textContent = annotation.source
      source.href = annotation.sourceUrl.startsWith('https:') ? annotation.sourceUrl : asset(annotation.sourceUrl)
      source.target = '_blank'
      source.rel = 'noreferrer'
      const note = document.createElement('p')
      note.textContent = annotation.evidence + ' · ' + annotation.limitation
      content.append(title, body, source, note)
      const narrow = window.innerWidth <= 720
      const popup = new maplibre.Popup({
        offset: narrow ? 12 : 27, maxWidth: narrow ? '175px' : '255px',
        anchor: narrow ? 'top-right' : undefined,
      }).setDOMContent(content)
      const marker = new maplibre.Marker({ element: button, anchor: 'bottom', offset: [0, -13] })
        .setLngLat(annotation.point).setPopup(popup).addTo(view)
      button.setAttribute('aria-label', annotation.title)
      return marker
    })
    return () => markers.forEach(marker => marker.remove())
  }, [ready, annotations])

  function moveDivider(event: PointerEvent<HTMLDivElement>) {
    const rect = shell.current?.getBoundingClientRect()
    if (rect?.width) setSplit(Math.round(Math.max(0, Math.min(100, (event.clientX - rect.left) * 100 / rect.width))))
  }

  return <div ref={shell} className="map-shell">
    <div ref={node} className="map-canvas" aria-label="Interactive map of Pallikaranai Marsh" />
    {swipe && presentedSwipe && !failed && <>
      <div className="map-divider" style={{ left: `clamp(1px, ${split}%, calc(100% - 1px))` }} aria-hidden="true"
        onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); moveDivider(event) }}
        onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) moveDivider(event) }}>
        <span>↔</span>
      </div>
      <div className="map-swipe floating">
        <div><span>{presentedSwipe.left}</span><span>{presentedSwipe.right}</span></div>
        <input type="range" min="0" max="100" value={split} aria-label="Map swipe divider"
          aria-valuetext={`${split}% ${presentedSwipe.left}`} onChange={event => setSplit(Number(event.target.value))} />
      </div>
    </>}
    {failed && <div className="map-fallback">{raster && <img src={asset(raster.url)} alt="Observation raster preview" />}
      <p>Interactive mapping requires WebGL.</p></div>}
    <div className="map-notices" role="status">
      {!failed && (rasterError ? <p>Selected imagery failed to load.</p> : !ready || pending ? <p>Loading map imagery…</p> : null)}
      {contextError && <p>Some geographic context tiles are unavailable.</p>}
    </div>
    <button type="button" className="fit floating" onClick={fit} disabled={!ready} aria-label="Fit map to Ramsar site" title="Fit to marsh">⌖</button>
  </div>
}
