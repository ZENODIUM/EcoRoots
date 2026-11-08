import { useEffect, useState } from 'react'
import { api, type SpeciesImage } from '../api'
import './shared.css'

// Module-level de-duplication: many cards can ask for the same species at once.
const cache = new Map<string, Promise<SpeciesImage>>()
export function loadSpeciesImage(name: string) {
  const k = name.trim().toLowerCase()
  if (!cache.has(k)) cache.set(k, api.speciesImage(name).catch(() => ({ status: 'error', reason: 'photo service unreachable' }) as SpeciesImage))
  return cache.get(k)!
}

type Props = { name: string; size?: 'xs' | 'sm' | 'md' | 'lg'; fallbackLabel?: string }

export default function SpeciesPhoto({ name, size = 'sm', fallbackLabel }: Props) {
  const [img, setImg] = useState<SpeciesImage | null>(null)
  const [open, setOpen] = useState(false)
  const [broken, setBroken] = useState(false)
  useEffect(() => {
    let live = true
    setImg(null); setBroken(false)
    loadSpeciesImage(name).then((r) => live && setImg(r))
    return () => { live = false }
  }, [name])

  const ok = img?.status === 'ok' && img.url && !broken
  return (
    <figure className={`sp-photo sp-${size}`} data-testid="species-photo" data-status={img ? (ok ? 'ok' : 'none') : 'loading'}>
      {!img ? <div className="sp-ph sp-loading" aria-label={`Loading photo of ${name}`} />
        : ok ? <img src={img.url} alt={`Photograph of ${img.accepted_name ?? name}`} loading="lazy" onError={() => setBroken(true)} />
          : <div className="sp-ph" role="img" aria-label={`No verified photo of ${name}`}><LeafGlyph /><span>{fallbackLabel ?? 'No verified photo'}</span></div>}
      {/* xs thumbnails sit inside list buttons, so they carry no credit button; the larger photo on the same page does */}
      {ok && size !== 'xs' && (
        <button type="button" className="sp-credit" aria-expanded={open} onClick={() => setOpen(!open)} title="Photo source and licence">©</button>
      )}
      {ok && open && (
        <figcaption className="sp-pop" role="note">
          <b>{img.licence}</b> · {img.source}<br />
          {img.attribution}<br />
          {img.attribution_url && <a href={img.attribution_url} target="_blank" rel="noreferrer noopener">source page</a>}
          {img.licence_url && <> · <a href={img.licence_url} target="_blank" rel="noreferrer noopener">licence</a></>}
          <br /><span className="dim">Match: {img.taxonomic_confidence}</span>
        </figcaption>
      )}
    </figure>
  )
}

function LeafGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14Z M5 19l8-8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
