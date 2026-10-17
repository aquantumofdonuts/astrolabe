import type { HTMLAttributes, ReactNode } from 'react'
import { Check } from 'lucide-react'
import type { Instrument } from '../lib/catalog'

export type LaunchFeedback = { id: string; label: string; sequence: number }

type Props = Pick<
  HTMLAttributes<HTMLElement>,
  'title' | 'tabIndex' | 'onPointerEnter' | 'onPointerLeave' | 'onFocus' | 'onBlur'
> & {
  site: Instrument
  className?: string
  children: ReactNode
  onRemember: (site: Instrument) => void
  onLaunch: (site: Instrument) => void
  launching?: boolean
  descriptionId?: string
}

/** Every launch surface preserves native new-tab and middle-click behavior. */
export default function LaunchLink({
  site,
  className = '',
  children,
  onRemember,
  onLaunch,
  launching = false,
  descriptionId,
  ...events
}: Props) {
  const content = (
    <>
      {children}
      {launching && (
        <span className="launch-acknowledgement" aria-hidden="true">
          <Check size={15} />
        </span>
      )}
    </>
  )
  const common = {
    ...events,
    className: `${className}${launching ? ' is-launching' : ''}`,
    'aria-describedby': descriptionId,
    'data-launching': launching || undefined,
  }
  return site.url ? (
    <a
      {...common}
      href={site.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => onRemember(site)}
      onAuxClick={(event) => {
        if (event.button === 1) onRemember(site)
      }}
      aria-label={`Launch ${site.name} in a new tab`}
    >
      {content}
    </a>
  ) : (
    <button {...common} onClick={() => onLaunch(site)} aria-label={`Preview ${site.name} demo`}>
      {content}
    </button>
  )
}
