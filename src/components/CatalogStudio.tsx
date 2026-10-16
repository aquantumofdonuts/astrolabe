import { useEffect, useRef, useState } from 'react'
import { Check, Download, Plus, Trash2, Upload } from 'lucide-react'
import { downloadCatalog, iconNames, uniqueId, validateCatalog } from '../lib/catalog'
import type { Catalog, Category, Instrument } from '../lib/catalog'
import { Icon } from './Icon'
import { InstrumentIcon } from './InstrumentIcon'
import { Modal } from './Modal'
import { MAX_CATALOG_BYTES, NODE_IMAGE_ACCEPT, normalizeNodeImage } from '../lib/nodeImages'

export default function CatalogStudio({
  catalog,
  onApply,
  onReset,
  onClose,
}: {
  catalog: Catalog
  onApply: (catalog: Catalog) => boolean
  onReset: () => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<Catalog>(() => structuredClone(catalog))
  const [tab, setTab] = useState<'sites' | 'categories'>('sites')
  const [selected, setSelected] = useState(catalog.sites[0]?.id || '')
  const [selectedCategory, setSelectedCategory] = useState(catalog.categories[0].id)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [imageBusy, setImageBusy] = useState(false)
  const imageRequest = useRef(0)
  useEffect(
    () => () => {
      imageRequest.current++
    },
    []
  )
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const site = draft.sites.find((entry) => entry.id === selected)
  const category = draft.categories.find((entry) => entry.id === selectedCategory)
  const dirty = JSON.stringify(draft) !== JSON.stringify(catalog)
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  const guardedClose = () => {
    if (
      !dirty ||
      window.confirm(
        'Discard unapplied catalog changes? Export or apply your preview to keep them.'
      )
    )
      onClose()
  }
  const updateSite = (changes: Partial<Instrument>) => {
    setDraft((current) => ({
      ...current,
      sites: current.sites.map((entry) =>
        entry.id === selected ? { ...entry, ...changes } : entry
      ),
    }))
    setNotice('')
    setError('')
  }
  const uploadImage = async (file?: File) => {
    if (!file || !site) return
    const id = site.id
    const request = ++imageRequest.current
    setImageBusy(true)
    setError('')
    setNotice('')
    try {
      const image = await normalizeNodeImage(file)
      if (request !== imageRequest.current) return
      // Capture the destination at upload start; changing selection cannot reassign it.
      setDraft((current) => ({
        ...current,
        sites: current.sites.map((entry) => (entry.id === id ? { ...entry, image } : entry)),
      }))
      setNotice('Image ready. Apply local preview to see it on the globe.')
    } catch (error) {
      if (request === imageRequest.current) setError((error as Error).message)
    } finally {
      if (request === imageRequest.current) setImageBusy(false)
    }
  }
  const updateCategory = (changes: Partial<Category>) => {
    setDraft((current) => ({
      ...current,
      categories: current.categories.map((entry) =>
        entry.id === selectedCategory ? { ...entry, ...changes } : entry
      ),
    }))
    setNotice('')
    setError('')
  }
  const perform = (action: (valid: Catalog) => void) => {
    try {
      const valid = validateCatalog(draft)
      action(valid)
      setError('')
    } catch (err) {
      setError((err as Error).message)
      setNotice('')
    }
  }
  const add = () => {
    setConfirmDelete(false)
    if (tab === 'sites') {
      const id = uniqueId(
        'new-instrument',
        draft.sites.map((site) => site.id)
      )
      setDraft((current) => ({
        ...current,
        sites: [
          ...current.sites,
          {
            id,
            name: 'New instrument',
            description: 'Describe what this tool helps your team accomplish.',
            category: draft.categories[0].id,
            icon: 'globe',
            url: null,
            tags: [],
            featured: false,
          },
        ],
      }))
      setSelected(id)
    } else {
      const id = uniqueId(
        'new-category',
        draft.categories.map((category) => category.id)
      )
      setDraft((current) => ({
        ...current,
        categories: [
          ...current.categories,
          {
            id,
            name: 'New category',
            description: 'Describe the instruments in this category.',
            color: '#a6b8e5',
            icon: 'sparkles',
          },
        ],
      }))
      setSelectedCategory(id)
    }
  }
  const remove = () => {
    imageRequest.current++
    setImageBusy(false)
    if (tab === 'sites') {
      setDraft((current) => ({
        ...current,
        sites: current.sites.filter((entry) => entry.id !== selected),
      }))
      setSelected(draft.sites.find((entry) => entry.id !== selected)?.id || '')
    } else {
      if (draft.sites.some((entry) => entry.category === selectedCategory)) {
        setError('Move this category’s instruments to another category before removing it.')
        setConfirmDelete(false)
        return
      }
      if (draft.categories.length === 1) {
        setError('Keep at least one category.')
        setConfirmDelete(false)
        return
      }
      setDraft((current) => ({
        ...current,
        categories: current.categories.filter((entry) => entry.id !== selectedCategory),
      }))
      setSelectedCategory(draft.categories.find((entry) => entry.id !== selectedCategory)!.id)
    }
    setConfirmDelete(false)
  }
  const importFile = async (file?: File) => {
    if (!file) return
    if (file.size > MAX_CATALOG_BYTES) {
      setError('Choose a catalog smaller than 28 MB.')
      return
    }
    try {
      const valid = validateCatalog(JSON.parse(await file.text()))
      imageRequest.current++
      setImageBusy(false)
      setDraft(valid)
      setSelected(valid.sites[0]?.id || '')
      setSelectedCategory(valid.categories[0].id)
      setError('')
      setNotice('Catalog imported into the editor. Apply a preview or export when ready.')
    } catch (err) {
      setError((err as Error).message)
    }
    if (fileInput.current) fileInput.current.value = ''
  }
  return (
    <Modal
      title="Catalog studio"
      subtitle="Manage instruments, images, and categories."
      onClose={guardedClose}
      className="studio-modal"
    >
      <div className="studio-notice">
        <span className="tiny-dot" />
        Browser preview<span>Export to update the shared catalog.</span>
      </div>
      <div className="studio-toolbar">
        <div className="segmented">
          <button
            className={tab === 'sites' ? 'active' : ''}
            onClick={() => {
              setTab('sites')
              setConfirmDelete(false)
            }}
          >
            Instruments <span>{draft.sites.length}</span>
          </button>
          <button
            className={tab === 'categories' ? 'active' : ''}
            onClick={() => {
              setTab('categories')
              setConfirmDelete(false)
            }}
          >
            Categories
          </button>
        </div>
        <div className="button-group">
          <button className="text-button" onClick={() => fileInput.current?.click()}>
            <Upload size={15} />
            Import
          </button>
          <button
            className="text-button"
            disabled={imageBusy}
            onClick={() =>
              perform((valid) => {
                downloadCatalog(valid)
                setNotice(
                  'Exported catalog.json. Replace public/catalog.json and redeploy to publish for everyone.'
                )
              })
            }
          >
            <Download size={15} />
            Export
          </button>
          <input
            ref={fileInput}
            aria-label="Import catalog"
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(event) => void importFile(event.target.files?.[0])}
          />
        </div>
      </div>
      <div className="studio-body">
        <div className="studio-list">
          <button
            className="add-instrument"
            onClick={add}
            disabled={tab === 'sites' ? draft.sites.length >= 200 : draft.categories.length >= 12}
          >
            <Plus size={16} />
            Add {tab === 'sites' ? 'instrument' : 'category'}
          </button>
          {tab === 'sites'
            ? draft.sites.map((entry) => (
                <button
                  key={entry.id}
                  className={`studio-entry ${entry.id === selected ? 'active' : ''}`}
                  onClick={() => {
                    setSelected(entry.id)
                    setConfirmDelete(false)
                  }}
                >
                  <InstrumentIcon site={entry} size={17} />
                  <span>{entry.name || 'Untitled'}</span>
                  {!entry.url && <small>DEMO</small>}
                </button>
              ))
            : draft.categories.map((entry) => (
                <button
                  key={entry.id}
                  className={`studio-entry ${entry.id === selectedCategory ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedCategory(entry.id)
                    setConfirmDelete(false)
                  }}
                >
                  <span className="category-dot" style={{ background: entry.color }} />
                  <span>{entry.name || 'Untitled'}</span>
                </button>
              ))}
        </div>
        <div className="studio-form">
          {tab === 'sites' && site ? (
            <>
              <div className="form-section-title">
                <InstrumentIcon site={site} size={25} />
                <div>
                  <h3>Instrument details</h3>
                  <small>ID · {site.id}</small>
                </div>
              </div>
              <label>
                Name
                <input
                  value={site.name}
                  maxLength={80}
                  onChange={(event) => updateSite({ name: event.target.value })}
                />
              </label>
              <label>
                Description
                <textarea
                  aria-label="Description"
                  value={site.description}
                  maxLength={300}
                  rows={3}
                  onChange={(event) => updateSite({ description: event.target.value })}
                />
                <small>Explain what someone can accomplish here.</small>
              </label>
              <div className="form-row">
                <label>
                  Category
                  <select
                    aria-label="Category"
                    value={site.category}
                    onChange={(event) => updateSite({ category: event.target.value })}
                  >
                    {draft.categories.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Icon
                  <select
                    aria-label="Icon"
                    value={site.icon}
                    onChange={(event) =>
                      updateSite({ icon: event.target.value as Instrument['icon'] })
                    }
                  >
                    {iconNames.map((icon) => (
                      <option key={icon}>{icon}</option>
                    ))}
                  </select>
                </label>
              </div>
              <section className="node-image-editor" aria-label="Globe image">
                <div className="node-image-preview">
                  {site.image ? (
                    <img src={site.image} alt={`${site.name} globe image`} />
                  ) : (
                    <span>No image assigned</span>
                  )}
                </div>
                <div>
                  <label>
                    Globe image
                    <input
                      key={site.id}
                      aria-label="Upload globe image"
                      type="file"
                      accept={NODE_IMAGE_ACCEPT}
                      disabled={imageBusy}
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        event.target.value = ''
                        void uploadImage(file)
                      }}
                    />
                  </label>
                  <p className="form-help">
                    PNG, JPEG, WebP, GIF, AVIF, BMP or ICO · up to 10 MB. Your image wraps around a
                    globe with night-side lights. Animated images use a still frame.
                  </p>
                  {imageBusy && <p role="status">Preparing image…</p>}
                  {site.image && (
                    <button
                      className="text-button"
                      disabled={imageBusy}
                      onClick={() => updateSite({ image: undefined })}
                    >
                      Remove globe image
                    </button>
                  )}
                  {draft.sites.some((entry) => entry.id !== site.id && entry.image) && (
                    <label>
                      Use another node’s image
                      <select
                        aria-label="Use another node’s image"
                        value=""
                        disabled={imageBusy}
                        onChange={(event) => {
                          const source = draft.sites.find(
                            (entry) => entry.id === event.target.value
                          )
                          if (source?.image) updateSite({ image: source.image })
                        }}
                      >
                        <option value="">Choose an existing image</option>
                        {draft.sites
                          .filter((entry) => entry.id !== site.id && entry.image)
                          .map((entry) => (
                            <option key={entry.id} value={entry.id}>
                              {entry.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                </div>
              </section>
              <label>
                <span>Website URL</span>
                <input
                  aria-label="Website URL"
                  type="url"
                  value={site.url || ''}
                  placeholder="https://tools.your-company.com"
                  onChange={(event) => updateSite({ url: event.target.value || null })}
                />
                <small>HTTP or HTTPS. Leave blank to show an explicit demo preview.</small>
              </label>
              <label>
                <span>Search keywords</span>
                <input
                  aria-label="Search keywords"
                  value={site.tags.join(', ')}
                  placeholder="switch, backup, network, ncm"
                  onChange={(event) =>
                    updateSite({
                      tags: event.target.value.split(',').map((tag) => tag.trimStart()),
                    })
                  }
                  onBlur={() =>
                    updateSite({ tags: site.tags.map((tag) => tag.trim()).filter(Boolean) })
                  }
                />
                <small>
                  Separate keywords with commas. Include the words your team actually uses.
                </small>
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={site.featured}
                  onChange={(event) => updateSite({ featured: event.target.checked })}
                />
                Show in Quick launch
              </label>
            </>
          ) : tab === 'categories' && category ? (
            <>
              <div className="form-section-title" style={{ color: category.color }}>
                <Icon name={category.icon} size={25} />
                <div>
                  <h3>Category details</h3>
                  <small>ID · {category.id}</small>
                </div>
              </div>
              <label>
                Category name
                <input
                  value={category.name}
                  maxLength={40}
                  onChange={(event) => updateCategory({ name: event.target.value })}
                />
              </label>
              <label>
                Category description
                <input
                  value={category.description}
                  maxLength={160}
                  onChange={(event) => updateCategory({ description: event.target.value })}
                />
              </label>
              <div className="form-row">
                <label>
                  Color
                  <div className="color-field">
                    <input
                      aria-label="Category color"
                      type="color"
                      value={category.color}
                      onChange={(event) => updateCategory({ color: event.target.value })}
                    />
                    <span>{category.color}</span>
                  </div>
                </label>
                <label>
                  Category icon
                  <select
                    aria-label="Category icon"
                    value={category.icon}
                    onChange={(event) =>
                      updateCategory({ icon: event.target.value as Category['icon'] })
                    }
                  >
                    {iconNames.map((icon) => (
                      <option key={icon}>{icon}</option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="form-help">
                Categories create orbital groups automatically. Names, icons, and colors appear
                throughout the directory and astrolabe.
              </p>
            </>
          ) : (
            <div className="empty-state">
              <h3>No instruments</h3>
              <p>Add your first instrument to get started.</p>
            </div>
          )}
          {(tab === 'sites' ? site : category) && (
            <div className="delete-row">
              {confirmDelete ? (
                <>
                  <span>Remove this {tab === 'sites' ? 'instrument' : 'category'}?</span>
                  <button className="danger-button" onClick={remove}>
                    Remove
                  </button>
                  <button className="text-button" onClick={() => setConfirmDelete(false)}>
                    Keep
                  </button>
                </>
              ) : (
                <button className="text-button danger" onClick={() => setConfirmDelete(true)}>
                  <Trash2 size={14} />
                  Remove {tab === 'sites' ? 'instrument' : 'category'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="studio-footer">
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="form-success" role="status">
            <Check size={15} />
            {notice}
          </p>
        )}
        <div className="studio-publish-info">
          <label>
            Workspace name
            <input
              aria-label="Workspace name"
              value={draft.title}
              maxLength={80}
              onChange={(event) =>
                setDraft((current) => ({ ...current, title: event.target.value }))
              }
            />
          </label>
          <button
            className="primary-button"
            disabled={imageBusy}
            onClick={() =>
              perform((valid) => {
                const persisted = onApply(valid)
                setDraft(valid)
                setNotice(
                  persisted
                    ? 'Preview applied to this browser. Export your catalog to publish it for everyone.'
                    : 'Preview applied for this session only. Browser storage is full or unavailable; export your catalog to keep your images and changes.'
                )
              })
            }
          >
            Apply local preview
            <Check size={16} />
          </button>
        </div>
        <div className="studio-reset">
          {confirmReset ? (
            <>
              <span>Restore the deployed catalog and discard this browser’s preview?</span>
              <button className="text-button danger" onClick={onReset}>
                Restore catalog
              </button>
              <button className="text-button" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button className="text-button" onClick={() => setConfirmReset(true)}>
              Restore deployed catalog
            </button>
          )}
          <span>Changes stay in this browser until exported.</span>
        </div>
      </div>
    </Modal>
  )
}
