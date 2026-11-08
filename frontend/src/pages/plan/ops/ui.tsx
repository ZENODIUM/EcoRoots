import { useEffect, useRef, useState, type ReactNode } from 'react'

// Small presentational pieces for HarvestOps: headline numbers, a stage ring and staggered reveals. Motion is CSS-only
// and switched off under prefers-reduced-motion (see ops.css).

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/** Number that counts up to its value once (no animation under reduced motion). */
export function CountUp({ value, format = (n) => Math.round(n).toLocaleString() }: { value: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(reduced() ? value : 0)
  const from = useRef(0)
  useEffect(() => {
    if (reduced()) { setShown(value); return }
    const start = performance.now(), a = from.current
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 600), e = 1 - (1 - p) ** 3
      setShown(a + (value - a) * e)
      if (p < 1) raf = requestAnimationFrame(tick); else from.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <>{format(shown)}</>
}

export function StatTile({ value, label, tone, format, hint }: { value: number; label: string; tone?: 'good' | 'review' | 'bad' | 'accent'; format?: (n: number) => string; hint?: string }) {
  return (
    <div className={`ops-tile ${tone ?? ''}`} title={hint}>
      <b className="num"><CountUp value={value} format={format} /></b>
      <span>{label}</span>
    </div>
  )
}

/** Ring that fills to done/total, with the current stage in the middle. */
export function StageRing({ done, total, label }: { done: number; total: number; label: string }) {
  const r = 38, c = 2 * Math.PI * r, frac = total ? done / total : 0
  return (
    <div className="ops-ring" role="img" aria-label={`Stage ${done} of ${total}: ${label}`}>
      <svg viewBox="0 0 96 96" width="96" height="96">
        <circle cx="48" cy="48" r={r} className="ops-ring-bg" />
        <circle cx="48" cy="48" r={r} className="ops-ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} transform="rotate(-90 48 48)" />
      </svg>
      <div className="ops-ring-c"><b className="num">{done}/{total}</b><span>{label}</span></div>
    </div>
  )
}

export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`ops-stagger ${className ?? ''}`}>{children}</div>
}
