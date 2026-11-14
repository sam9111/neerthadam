import { useEffect, useRef } from 'react'

export const chapters = [
  ['A wetland worth observing', 'Pallikaranai Marsh sits within Chennai’s urban landscape. The ivory Ramsar outline marks the designated site. Repeated observations establish where this baseline can be measured.'],
  ['The observation challenge', 'On July 18, Sentinel-2’s cloud mask excluded the entire Ramsar site. Swipe to see where NISAR measured backscatter later that day. A clearer July 15 optical view adds natural color and spectral context in Chapter 5.'],
  ['What radar sees', 'The July 6 NISAR image shows gamma-zero backscatter in dB. HH and HV describe the transmitted and received polarizations. The footprint shows where measurements passed the data screen.'],
  ['Every change leaves a trace', 'Drag the divider to compare July 6 and 18 on one dB scale. Try the difference layer to see later minus earlier backscatter. Changes in roughness, moisture and vegetation structure can all affect the radar return.'],
  ['Investigate the evidence', 'The selected location shows native radar values. The July 15 optical image and antecedent rainfall give separately dated context. Local field observations would help resolve the cause of the radar difference.'],
  ['Your workspace', 'Use Observe to select dates, Compare to review compatible pairs, and Investigate to inspect measurements alongside environmental context. Click the map to start an inspection.'],
]

export function Tour({ step, onStep, onComplete }: { step: number; onStep: (step: number) => void; onComplete: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [step])
  return <section className="tour floating" aria-labelledby="tour-heading">
    <span className="kicker">Guided tour · {step + 1} / {chapters.length}</span>
    <h2 id="tour-heading" ref={heading} tabIndex={-1}>{chapters[step][0]}</h2>
    <p>{chapters[step][1]}</p>
    <div className="tour-actions">
      <button type="button" disabled={step === 0} onClick={() => onStep(step - 1)}>Back</button>
      <button type="button" className="primary" onClick={() => step === chapters.length - 1 ? onComplete() : onStep(step + 1)}>
        {step === chapters.length - 1 ? 'Enter workspace' : 'Continue'}
      </button>
    </div>
  </section>
}
