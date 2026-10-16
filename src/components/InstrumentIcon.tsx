import type { Instrument } from '../lib/catalog'
import { Icon } from './Icon'

export function InstrumentIcon({ site, size }: { site: Instrument; size: number }) {
  return site.image ? (
    <img src={site.image} width={size} height={size} alt="" className="instrument-image" />
  ) : (
    <Icon name={site.icon} size={size} />
  )
}
