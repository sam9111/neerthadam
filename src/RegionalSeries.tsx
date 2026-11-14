import { observationDate, type Group, type Polarization } from './catalog'

export function RegionalSeries({ group, pol, selected, onSelect }: {
  group: Group; pol: Polarization; selected: number; onSelect: (index: number) => void
}) {
  const samples = group.observations.map((item, index) => ({
    index, date: item.date, time: Date.parse(item.date), value: item.fixedFootprint[pol].median,
  })).filter((item): item is { index: number; date: string; time: number; value: number } =>
    item.value !== null && Number.isFinite(item.value))
  if (!samples.length) return <p>No regional statistics on a shared valid footprint.</p>
  const minimum = Math.min(...samples.map(item => item.value))
  const maximum = Math.max(...samples.map(item => item.value))
  const middle = (minimum + maximum) / 2
  const span = Math.max(maximum - minimum, 1)
  const first = Date.parse(group.observations[0].date)
  const last = Date.parse(group.observations.at(-1)!.date)
  return <section className="regional-series" aria-label="Fixed footprint regional statistics">
    <h3>Regional backscatter · {pol}</h3>
    <p>{samples.length} valid observations · {group.coveragePct.toFixed(1)}% shared site area</p>
    <svg viewBox="0 0 270 94" role="img" aria-label="Observed median backscatter by acquisition date">
      {[17, 47, 77].map((y, index) => <g key={y}>
        <text x="0" y={y + 3}>{(middle + span * (1 - index) / 2).toFixed(1)}</text>
        <path d={`M39 ${y}H264`} />
      </g>)}
      {samples.map(sample => <circle key={sample.index}
        cx={last === first ? 152 : 44 + 215 * (sample.time - first) / (last - first)}
        cy={47 - 60 * (sample.value - middle) / span}
        r={sample.index === selected ? 5.5 : 4} className={sample.index === selected ? 'selected' : ''}>
        <title>{observationDate(sample.date)} · {sample.value.toFixed(2)} dB</title>
      </circle>)}
    </svg>
    <ul>{samples.map(sample => <li key={sample.index}><button type="button"
      aria-pressed={sample.index === selected} onClick={() => onSelect(sample.index)}>
      {observationDate(sample.date)} <strong>{sample.value.toFixed(2)} dB</strong>
    </button></li>)}</ul>
  </section>
}
