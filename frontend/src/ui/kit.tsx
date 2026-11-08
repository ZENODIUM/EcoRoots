import { create } from 'zustand'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import './ui.css'

// Shared building blocks: zoomable images + one lightbox, a book-style pager, stat shapes and a sortable table.

/* ---------------------------------------------------------------- lightbox */
export type Zoom = { src: string; alt: string; caption?: ReactNode; altSrc?: string; altLabel?: string }
const useZoom = create<{ item: Zoom | null; open: (z: Zoom) => void; close: () => void }>((set) => ({
  item: null, open: (item) => set({ item }), close: () => set({ item: null }),
}))
export const openZoom = (z: Zoom) => useZoom.getState().open(z)

/** An image that opens full size. Rendered as a button so it works with the keyboard. Never put it inside another button. */
export function ZoomImg({ src, alt, caption, altSrc, altLabel, className, testid }: Zoom & { className?: string; testid?: string }) {
  return (
    <button type="button" className={`zoom ${className ?? ''}`} onClick={() => openZoom({ src, alt, caption, altSrc, altLabel })} aria-label={`Enlarge: ${alt}`}>
      <img src={src} alt={alt} loading="lazy" data-testid={testid} />
      <span className="zoom-hint" aria-hidden>⤢</span>
    </button>
  )
}

export function Lightbox() {
  const { item, close } = useZoom()
  const [showAlt, setShowAlt] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!item) return
    setShowAlt(false)
    const prev = document.activeElement as HTMLElement | null
    btn.current?.focus()
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('keydown', key); prev?.focus?.() }
  }, [item, close])
  if (!item) return null
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={item.alt} onClick={close}>
      <figure onClick={(e) => e.stopPropagation()}>
        <img src={showAlt && item.altSrc ? item.altSrc : item.src} alt={item.alt} />
        <figcaption>
          <div>{item.caption ?? item.alt}</div>
          <div className="lb-actions">
            {item.altSrc && <button type="button" className="btn sm" aria-pressed={showAlt} onClick={() => setShowAlt(!showAlt)}>{showAlt ? 'Show annotated' : (item.altLabel ?? 'Show original')}</button>}
            <button type="button" className="btn sm" ref={btn} onClick={close}>Close ✕</button>
          </div>
        </figcaption>
      </figure>
    </div>
  )
}

/* ---------------------------------------------------------------- book pager */
export type Page = { key: string; title: ReactNode; body: ReactNode; tag?: ReactNode }

/** Long material shown one page at a time. Every page stays in the DOM (hidden), so search and print still see it. */
export function Book({ pages, index, onIndex, label, testid }: { pages: Page[]; index?: number; onIndex?: (i: number) => void; label: string; testid?: string }) {
  const [own, setOwn] = useState(0)
  const i = Math.min(index ?? own, Math.max(0, pages.length - 1))
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd')
  const go = (j: number) => { const k = (j + pages.length) % pages.length; setDir(k >= i ? 'fwd' : 'back'); (onIndex ?? setOwn)(k) }
  if (!pages.length) return null
  return (
    <section className="book" aria-label={label} data-testid={testid}
      onKeyDown={(e) => { if (e.key === 'ArrowRight') go(i + 1); if (e.key === 'ArrowLeft') go(i - 1) }}>
      <header className="book-head">
        <button type="button" className="book-turn" onClick={() => go(i - 1)} aria-label="Previous page" disabled={pages.length < 2}>‹</button>
        <div className="book-title">{pages[i].tag}<span>{pages[i].title}</span></div>
        <span className="book-no mono">{i + 1} / {pages.length}</span>
        <button type="button" className="book-turn" onClick={() => go(i + 1)} aria-label="Next page" disabled={pages.length < 2}>›</button>
      </header>
      {pages.map((p, j) => (
        <article key={p.key} className={`book-page ${j === i ? `in ${dir}` : ''}`} hidden={j !== i} aria-label={`Page ${j + 1}`}>{p.body}</article>
      ))}
      {pages.length > 1 && pages.length <= 24 && (
        <nav className="book-dots" aria-label="Pages">
          {pages.map((p, j) => <button type="button" key={p.key} aria-label={`Go to page ${j + 1}`} aria-current={j === i ? 'page' : undefined} onClick={() => go(j)} />)}
        </nav>
      )}
    </section>
  )
}

/* ---------------------------------------------------------------- stat shapes and cards */
export type Tone = 'green' | 'sky' | 'gold' | 'rose' | 'plum' | 'lime' | 'clay' | 'grey'
export function Stat({ label, value, hint, tone = 'green', shape = 'round', icon }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: Tone; shape?: 'round' | 'hex' | 'square' | 'leaf'; icon?: ReactNode }) {
  return (
    <div className={`stat t-${tone}`}>
      <span className={`stat-shape s-${shape}`} aria-hidden>{icon}</span>
      <div><div className={`stat-v ${typeof value === 'string' && !/^[\d.,%+\-−×\s]+$/.test(value) ? 'word' : ''}`}>{value}</div><div className="stat-l">{label}</div>{hint && <div className="stat-h">{hint}</div>}</div>
    </div>
  )
}

export function Card({ title, tone = 'green', icon, children, className, testid }: { title?: ReactNode; tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string; testid?: string }) {
  return (
    <section className={`kcard t-${tone} ${className ?? ''}`} data-testid={testid}>
      {title && <h3 className="kcard-h">{icon && <span className="kcard-i" aria-hidden>{icon}</span>}{title}</h3>}
      {children}
    </section>
  )
}

/* ---------------------------------------------------------------- sortable table */
export type Col<R> = { key: string; label: ReactNode; num?: boolean; render?: (r: R) => ReactNode; sort?: (r: R) => number | string }
export function Table<R>({ cols, rows, caption, rowKey, testid, max }: { cols: Col<R>[]; rows: R[]; caption?: ReactNode; rowKey: (r: R, i: number) => string; testid?: string; max?: number }) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)
  const [all, setAll] = useState(false)
  const sorted = useMemo(() => {
    if (!sort) return rows
    const c = cols.find((x) => x.key === sort.key)
    const f = c?.sort ?? ((r: R) => (r as Record<string, unknown>)[sort.key] as number | string)
    return [...rows].sort((a, b) => { const x = f(a), y = f(b); return (x > y ? 1 : x < y ? -1 : 0) * sort.dir })
  }, [rows, sort, cols])
  const shown = max && !all ? sorted.slice(0, max) : sorted
  return (
    <div className="ktable-wrap" data-testid={testid}>
      <table className="ktable">
        {caption && <caption>{caption}</caption>}
        <thead><tr>{cols.map((c) => (
          <th key={c.key} className={c.num ? 'num' : ''} aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
            <button type="button" onClick={() => setSort(sort?.key === c.key ? { key: c.key, dir: sort.dir === 1 ? -1 : 1 } : { key: c.key, dir: 1 })}>
              {c.label}<i aria-hidden>{sort?.key === c.key ? (sort.dir === 1 ? '▲' : '▼') : '↕'}</i>
            </button>
          </th>))}</tr></thead>
        <tbody>{shown.map((r, i) => <tr key={rowKey(r, i)}>{cols.map((c) => <td key={c.key} className={c.num ? 'num' : ''}>{c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? '—')}</td>)}</tr>)}</tbody>
      </table>
      {max && rows.length > max && <button type="button" className="btn sm quiet ktable-more" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${rows.length}`}</button>}
    </div>
  )
}

/** A bar meter for a 0..1 share, with the number written out. */
export function Meter({ value, tone = 'green', label, text }: { value: number; tone?: Tone; label: string; text?: string }) {
  const v = Math.max(0, Math.min(1, value))
  return (
    <span className={`meter t-${tone}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} aria-label={label}>
      <i style={{ width: `${v * 100}%` }} /><b>{text ?? `${Math.round(v * 100)}%`}</b>
    </span>
  )
}
