import { useState } from 'react'
import { HistoryPanel } from './HistoryPanel.jsx'
import { SaveIndicator } from './SaveIndicator.jsx'

export function Editor({
  document,
  saveStatus,
  onContentChange,
  disabled,
  revisions,
  historyError,
  onReloadHistory,
  onSaveVersion,
  onRestoreRevision,
  onDeleteRevision,
}) {
  const [historyOpen, setHistoryOpen] = useState(false)

  if (!document) {
    return (
      <section className="editor editor--empty">
        <div className="empty-state">
          <h2>Nothing selected</h2>
          <p>Create a document from the sidebar to start writing.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="editor">
      <header className="editor__header">
        <div>
          <p className="editor__eyebrow">Current document</p>
          <h2>{document.title}</h2>
        </div>
        <div className="editor__header-actions">
          <button
            type="button"
            className="button"
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen((open) => !open)}
            disabled={disabled}
          >
            History ({historyError ? '!' : revisions.length})
          </button>
          <SaveIndicator saveStatus={saveStatus} />
        </div>
      </header>

      <label className="visually-hidden" htmlFor="document-content">
        Document text
      </label>
      <textarea
        id="document-content"
        className="editor__textarea"
        value={document.content}
        placeholder="Start writing…"
        spellCheck="true"
        disabled={disabled}
        onChange={(event) => onContentChange(document.id, event.target.value)}
      />

      {historyOpen ? (
        <HistoryPanel
          key={document.id}
          revisions={revisions}
          historyError={historyError}
          onReload={onReloadHistory}
          currentContent={document.content}
          onSaveVersion={onSaveVersion}
          onRestore={onRestoreRevision}
          onDelete={onDeleteRevision}
          onClose={() => setHistoryOpen(false)}
        />
      ) : null}
    </section>
  )
}