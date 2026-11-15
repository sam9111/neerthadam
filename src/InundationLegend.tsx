import { observationDate } from './catalog'

const classes = [
  ['Not classified as inundated', 'Valid pixels outside the algorithm’s inundation criteria.'],
  ['Likely open water', 'Radar signatures consistent with exposed water.'],
  ['Possible inundated vegetation', 'Radar signatures potentially associated with vegetation standing in water.'],
  ['NoData', 'Areas without valid classification data stay transparent.'],
]

export function InundationLegend({ date, colors, available, loading, tour }: {
  date?: string; colors?: string[]; available: boolean; loading: boolean; tour: boolean
}) {
  return <section className="reading floating inundation-key" aria-labelledby="inundation-title">
    <strong id="inundation-title">Inundation estimate</strong>
    <div className="radar-key">{date ? observationDate(date) : 'No acquisition selected'} · 10 m · NISAR L-band</div>
    <p className="inundation-status">Experimental · Unvalidated</p>
    <p>This classification highlights radar signatures potentially associated with open water or vegetation standing in water.</p>
    {!available && <p role="status">{loading ? 'Loading inundation estimates…' : 'Inundation estimate unavailable for this observation.'}</p>}
    <div className="interpretation-note">
      <strong>Urban false positives</strong>
      <p>Buildings and developed surfaces can reflect radar like inundated vegetation. In Pallikaranai, some candidate vegetation pixels overlap mapped buildings. We’re evaluating a developed-land exclusion for future estimates.</p>
      <p>Confirmed flooding, water depth and vegetation condition require independent evidence.</p>
    </div>
    {colors && <ul className="interpretation-cards">{classes.map(([label, description], index) => <li key={label}>
      <i aria-hidden="true" className={index === 3 ? 'nodata-swatch' : undefined} style={{ backgroundColor: colors[index] }} />
      <div><strong>{label}</strong><p>{description}</p></div>
    </li>)}</ul>}
    <details key={tour ? 'tour' : 'workspace'} className="inundation-info" open={tour}>
      <summary>Why does this matter?</summary>
      <p>With more observations and independent validation, these estimates could support research on seasonal water distribution in Pallikaranai, conditions near Okkiyam Maduvu, and wetland restoration and management.</p>
    </details>
    <details className="inundation-info">
      <summary>How classification works</summary>
      <p>Neerthadam adapts an experimental method using calibrated HH and HV measurements from NISAR Level-2 GCOV. Radar-derived features and thresholds flag candidate water-related signatures. The thresholds need local validation, especially around developed areas.</p>
      <p><a href="https://github.com/NISAR-Science-Algorithms/NISAR_Inundation/blob/main/notebooks/NISAR_L3_Inundation_ProductGeneration.ipynb"
        target="_blank" rel="noreferrer">NISAR inundation methodology</a></p>
    </details>
  </section>
}
