import { useState } from 'react'
import { asset, observationDate, type Layer, type LonLat } from './catalog'

const radius = 6378137
const windowMeters = 600

// Catalog assets are north-up Web Mercator rasters with geographic corner coordinates.
function mercator([lon, lat]: LonLat) {
  return [radius * lon * Math.PI / 180, radius * Math.asinh(Math.tan(lat * Math.PI / 180))]
}

function ImageAtPoint({ layer, center }: { layer: Layer; center: LonLat }) {
  const [west, north] = mercator(layer.coordinates[0])
  const [east, south] = mercator(layer.coordinates[2])
  const [x, y] = mercator(center)
  const width = windowMeters / Math.cos(center[1] * Math.PI / 180)
  const percent = (value: number) => `${100 * value / width}%`
  return <img src={asset(layer.url)} alt="" draggable={false} style={{
    left: percent(west - x + width / 2), top: percent(y + width / 2 - north),
    width: percent(east - west), height: percent(north - south),
  }} />
}

export function BackscatterSwipe({ before, after, center, beforeDate, afterDate, channel }: {
  before: Layer; after: Layer; center: LonLat; beforeDate: string; afterDate: string; channel: string
}) {
  const [split, setSplit] = useState(50)
  const shortDate = (date: string) => observationDate(date, { year: undefined })
  if (before.min !== after.min || before.max !== after.max) {
    return <p>Comparison unavailable on a shared display scale.</p>
  }
  return <section className="backscatter-swipe" aria-label="Before and after NISAR images">
    <h3>NISAR before &amp; after</h3>
    <div className="swipe-frame">
      <div className="swipe-image"><ImageAtPoint layer={after} center={center} /></div>
      <div className="swipe-image" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
        <ImageAtPoint layer={before} center={center} />
      </div>
      <span className="swipe-date swipe-before">{shortDate(beforeDate)}</span>
      <span className="swipe-date swipe-after">{shortDate(afterDate)}</span>
      <span className="swipe-location" aria-hidden="true">+</span>
      <span className="swipe-divider" style={{ left: `${split}%` }} aria-hidden="true"><b>↔</b></span>
      <input type="range" min="0" max="100" value={split} onChange={event => setSplit(Number(event.target.value))}
        aria-label={`Compare NISAR ${channel} images from ${shortDate(beforeDate)} and ${shortDate(afterDate)}`}
        aria-valuetext={`${split}% earlier image, ${100 - split}% later image`} />
    </div>
    <p>Drag to compare the same 600 m view. {channel} backscatter · {before.min} to {before.max} dB.</p>
  </section>
}
