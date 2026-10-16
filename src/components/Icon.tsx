import {
  Activity,
  Bot,
  Code2,
  Database,
  Globe2,
  Network,
  Radar,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
  Workflow,
} from 'lucide-react'
import type { IconName } from '../lib/catalog'

const icons = {
  radar: Radar,
  network: Network,
  terminal: Terminal,
  bot: Bot,
  activity: Activity,
  shield: ShieldCheck,
  workflow: Workflow,
  database: Database,
  code: Code2,
  search: Search,
  globe: Globe2,
  sparkles: Sparkles,
}
export function Icon({
  name,
  size = 20,
  className,
}: {
  name: IconName
  size?: number
  className?: string
}) {
  const Component = icons[name] || Sparkles
  return <Component size={size} strokeWidth={1.5} className={className} aria-hidden="true" />
}

export function AstrolabeMark({ size = 35 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <circle cx="24" cy="24" r="17" stroke="currentColor" strokeWidth="1" />
      <ellipse cx="24" cy="24" rx="8" ry="21" transform="rotate(38 24 24)" stroke="currentColor" />
      <ellipse cx="24" cy="24" rx="8" ry="21" transform="rotate(-38 24 24)" stroke="currentColor" />
      <path d="M3 24h42M24 3v42" stroke="currentColor" strokeWidth=".5" opacity=".5" />
      <circle cx="24" cy="24" r="3" fill="currentColor" />
    </svg>
  )
}
