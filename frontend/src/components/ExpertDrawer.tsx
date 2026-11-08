import { useState, type ReactNode } from 'react'
import './shared.css'

// "Science behind this": technical values stay one click away instead of on the first screen.
export default function ExpertDrawer({ title = 'Science behind this', children, testid }: { title?: string; children: ReactNode; testid?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <section className={`expert ${open ? 'open' : ''}`} data-testid={testid}>
      <button type="button" className="expert-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M5 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
        {title}
      </button>
      {open && <div className="expert-body">{children}</div>}
    </section>
  )
}
