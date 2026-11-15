import type { Group } from './catalog'

export type RadarSwatches = Record<Group['frequency'], { samples: string[]; sources: string[] }>

const examples = [
  ['Magenta', 'The red HH and blue HH−HV channels stand out more than the green HV channel.'],
  ['Olive green', 'The green HV channel stands out. Leaves and branches can scatter the signal into this channel, so some vegetation can have an olive-green appearance.'],
  ['Dark blue', 'HH and HV contribute weakly, while contrast remains visible. Smooth water can return weak signals under some viewing conditions.'],
  ['Pale pink', 'HH contributes strongly, with visible contributions from HV and contrast. Several kinds of surfaces can produce this mix.'],
]

export function RadarLegend({ frequency, swatches, expanded, onToggle }: {
  frequency: Group['frequency']; swatches?: RadarSwatches; expanded: boolean; onToggle: () => void
}) {
  const colors = swatches?.[frequency].samples ?? []
  return <section className="reading floating" aria-labelledby="reading-title">
    <button className="reading-toggle" aria-expanded={expanded} aria-controls="radar-interpretation" onClick={onToggle}>
      <strong id="reading-title">Reading the radar</strong><span aria-hidden="true">{expanded ? '−' : '+'}</span>
    </button>
    <div className="radar-key"><span className="sample-strip" aria-hidden="true">
      {colors.map(color => <i key={color} style={{ background: color }} />)}
    </span><span>HH · HV · HH−HV</span></div>
    <p>Color shows how strongly the surface returns radar signals.</p>
    <div id="radar-interpretation" hidden={!expanded}>
      <dl className="radar-channels">
        <dt>Red · HH</dt><dd>NISAR sends a horizontal signal and measures the horizontal echo. Buildings oriented toward the radar and rough ground can give strong returns.</dd>
        <dt>Green · HV</dt><dd>NISAR sends a horizontal signal and measures the vertical part of the echo. Leaves and branches can scatter radar into this channel.</dd>
        <dt>Blue · HH−HV</dt><dd>Shows HH minus HV in decibels. More blue means a larger gap in favor of HH.</dd>
      </dl>
      {colors.length > 0 && <ul>{examples.map(([label, body], index) => <li key={label}>
        <i aria-hidden="true" style={{ background: colors[index] }} /><div><strong>{label}</strong> {body}{index === 3 && frequency === 'A' && ' You can see pale pink around many mapped buildings in the July 10 m images. Turn on Buildings in Layers to see their footprints.'}</div>
      </li>)}</ul>}
      <p>These Frequency {frequency} examples show radar responses. Different surfaces can share a color, and moisture and viewing angle can change it.</p>
      <p><a href="https://science.nasa.gov/mission/nisar/polarimetry/" target="_blank" rel="noreferrer">NASA guide to radar polarization</a></p>
    </div>
  </section>
}
