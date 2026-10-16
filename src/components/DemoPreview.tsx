import { ArrowUpRight, FlaskConical, Settings2 } from 'lucide-react'
import type { Category, Instrument } from '../lib/catalog'
import { InstrumentIcon } from './InstrumentIcon'
import { Modal } from './Modal'

export default function DemoPreview({
  site,
  category,
  onClose,
  onEdit,
}: {
  site: Instrument
  category: Category
  onClose: () => void
  onEdit: () => void
}) {
  return (
    <Modal
      title={site.name}
      subtitle={`${category.name} / Demo instrument`}
      onClose={onClose}
      className="demo-modal"
    >
      <div className="demo-content" style={{ '--accent': category.color } as React.CSSProperties}>
        <div className="demo-badge">
          <FlaskConical size={14} />
          Demo instrument · no live data
        </div>
        <div className="demo-hero">
          <div className="demo-hero-icon">
            <InstrumentIcon site={site} size={36} />
          </div>
          <p>{site.description}</p>
        </div>
        <div className="demo-ready">
          <FlaskConical size={18} />
          <div>
            <strong>No destination URL assigned</strong>
            <p>Add a URL in Catalog studio to launch this application directly.</p>
          </div>
        </div>
        <div className="demo-footer">
          <button className="secondary-button" onClick={onClose}>
            Close preview
          </button>
          <button className="primary-button" onClick={onEdit}>
            <Settings2 size={16} />
            Open catalog studio
            <ArrowUpRight size={16} />
          </button>
        </div>
      </div>
    </Modal>
  )
}
