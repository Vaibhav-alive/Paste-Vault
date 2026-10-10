import { useMemo, useState } from 'react'
import { diffLines } from '../lib/diff.js'
import './HistoryPanel.css'

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(value)
}

function wordCount(text) {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

export function HistoryPanel({
  revisions,
  currentContent,
  onSaveVersion,
  onRestore,
  onDelete,
  onClose,
}) {
  const [label, setLabel] = useState('')
  const [notice, setNotice] = useState('')
  const [pickedId, setPickedId] = useState(null)
  const [view, setView] = useState('changes')

  const selected =
    revisions.find((item) => item.id === pickedId) ?? revisions[0] ?? null

  // What would change in your document if you restored this version.
  const diff = useMemo(
    () => (selected ? diffLines(currentContent, selected.content) : null),
    [selected, currentContent],
  )

  async function handleSave(event) {
    event.preventDefault()
    const created = await onSaveVersion(label)
    setNotice(created ? 'Version saved.' : 'No changes since the last version.')
    setLabel('')
  }

  function handleRestore() {
    if (!selected) {
      return
    }
    const confirmed = window.confirm(
      `Restore the version from ${formatDate(selected.createdAt)}? Your current text is saved as a version first.`,
    )
    if (confirmed) {
      void onRestore(selected)
    }
  }

  function handleDelete() {
    if (selected && window.confirm('Delete this version permanently?')) {
      void onDelete(selected.id)
    }
  }

  const isIdentical = selected && selected.content === currentContent

  return (
    <aside className="history" aria-label="Version history">
      <header className="history__header">
        <h3>Version history</h3>
        <button type="button" className="button button--ghost" onClick={onClose}>
          Close
        </button>
      </header>

      <form className="history__save" onSubmit={handleSave}>
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Version note (optional)"
          aria-label="Version note"
        />
        <button type="submit" className="button button--primary">
          Save version
        </button>
      </form>
      {notice ? <p className="history__notice">{notice}</p> : null}

      {revisions.length === 0 ? (
        <p className="history__empty">
          No versions yet. One is created automatically the first time you edit
          a document each session, and about every 10 minutes while you write.
        </p>
      ) : (
        <>
          <ul className="history__list">
            {revisions.map((revision) => (
              <li key={revision.id}>
                <button
                  type="button"
                  className={`history__item ${
                    revision.id === selected?.id ? 'is-selected' : ''
                  }`}
                  onClick={() => setPickedId(revision.id)}
                >
                  <span className="history__item-title">
                    {revision.label ||
                      (revision.kind === 'manual' ? 'Saved version' : 'Auto checkpoint')}
                  </span>
                  <span className="history__item-meta">
                    {formatDate(revision.createdAt)} · {wordCount(revision.content)} words
                    {revision.kind === 'manual' ? ' · manual' : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {selected ? (
            <div className="history__detail">
              <div className="history__tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === 'changes'}
                  className={view === 'changes' ? 'is-active' : ''}
                  onClick={() => setView('changes')}
                >
                  Changes if restored
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === 'full'}
                  className={view === 'full' ? 'is-active' : ''}
                  onClick={() => setView('full')}
                >
                  Full text
                </button>
              </div>

              <div className="history__preview">
                {isIdentical ? (
                  <p className="history__empty">Identical to your current text.</p>
                ) : view === 'changes' && diff ? (
                  diff.map((line, index) => (
                    <div key={index} className={`diff diff--${line.type}`}>
                      <span className="diff__mark" aria-hidden="true">
                        {line.type === 'add' ? '+' : line.type === 'remove' ? '−' : ' '}
                      </span>
                      <span>{line.text || ' '}</span>
                    </div>
                  ))
                ) : (
                  <pre>{selected.content}</pre>
                )}
              </div>

              <div className="history__actions">
                <button
                  type="button"
                  className="button button--primary"
                  onClick={handleRestore}
                  disabled={isIdentical}
                >
                  Restore this version
                </button>
                <button
                  type="button"
                  className="button button--ghost button--danger"
                  onClick={handleDelete}
                >
                  Delete
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </aside>
  )
}