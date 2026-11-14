import { observationDate } from './catalog'

type Window = { total: number | null; validDays: number; start: string; end: string }
export type Rainfall = {
  source: string; sourceUrl: string; daily?: Record<string, number | null>;
  windows: Record<string, Window & { periods?: Record<string, Window> }>
}
const days = [3, 7, 14]

export function RainfallContext({ rain, dates }: { rain?: Rainfall; dates: string[] }) {
  if (!rain) return <p>Rainfall data unavailable.</p>
  const windows = dates.map(date => rain.windows[date.slice(0, 10)])
  const period = windows.at(-1)?.periods?.['14']
  const series = period ? Object.entries(rain.daily ?? {}).filter(([date]) => date >= period.start && date <= period.end) : []
  const maximum = Math.max(1, ...series.flatMap(([, value]) => value ?? []))
  return <section className="rainfall-context">
    <h3>Rainfall near Pallikaranai</h3>
    {series.some(([, value]) => value !== null) && <svg viewBox="0 0 260 58" role="img" aria-label="Daily precipitation in millimeters before the latest selected acquisition">
      {series.map(([date, value], index) => value !== null && <rect key={date}
        x={4 + index * 18} y={52 - 46 * value / maximum} width="14" height={Math.max(.5, 46 * value / maximum)}>
        <title>{date}: {value} mm</title>
      </rect>)}
    </svg>}
    <table><thead><tr><th>Date</th>{days.map(d => <th key={d}>{d} days</th>)}</tr></thead>
      <tbody>{dates.map((date, index) => <tr key={date}><th scope="row">{observationDate(date, { year: undefined })}</th>
        {days.map(d => {
          const period = windows[index]?.periods?.[String(d)]
          return <td key={d}>{period?.total == null ? '—' : `${period.total.toFixed(1)} mm`}
            <small>{period?.validDays ?? 0}/{d} days</small></td>
        })}</tr>)}</tbody></table>
    <p>Complete UTC days before each acquisition date. The ~10 km grid represents the surrounding area. A dash marks an incomplete window.</p>
    <a href={rain.sourceUrl} target="_blank" rel="noreferrer">{rain.source}</a>
  </section>
}
