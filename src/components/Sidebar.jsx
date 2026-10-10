import { useEffect, useRef, useState } from 'react'

function formatTimestamp(value) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(value)
}

export function Sidebar({
  documents,
  selectedId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  createDisabled,
}) {
  const [editingId, setEditingId] = useState(null)
  const [draftTitle, setDraftTitle] = useState('')
  const renameInputRef = useRef(null)

  useEffect(() => {
    if (editingId && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [editingId])

  function startRename(document) {
    setEditingId(document.id)
    setDraftTitle(document.title)
  }

  function commitRename() {
    if (!editingId) {
      return
    }

    onRename(editingId, draftTitle)
    setEditingId(null)
  }

  function handleRenameKeyDown(event) {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitRename()
    }

    if (event.key === 'Escape') {
      setEditingId(null)
    }
  }

  function handleDelete(event, document) {
    event.stopPropagation()
    const confirmed = window.confirm(
      `Delete “${document.title}”? This cannot be undone.`,
    )
    if (confirmed) {
      onDelete(document.id)
    }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <div>
          <p className="sidebar__eyebrow">Local documents</p>
          <h1>PasteVault</h1>
        </div>
        <button
          type="button"
          className="button button--primary"
          onClick={onCreate}
          disabled={createDisabled}
        >
          New
        </button>
      </div>

      {documents.length === 0 ? (
        <div className="empty-state empty-state--sidebar">
          <p>No documents yet.</p>
          <p>Create one to start writing. Everything stays in this browser.</p>
        </div>
      ) : (
        <ul className="document-list">
          {documents.map((document) => {
            const isSelected = document.id === selectedId
            const isEditing = document.id === editingId

            return (
              <li key={document.id}>
                <div
                  className={`document-item ${isSelected ? 'is-selected' : ''}`}
                >
                  {isEditing ? (
                    <input
                      ref={renameInputRef}
                      className="document-item__rename"
                      value={draftTitle}
                      aria-label="Document title"
                      onChange={(event) => setDraftTitle(event.target.value)}
                      onBlur={commitRename}
                      onKeyDown={handleRenameKeyDown}
                    />
                  ) : (
                    <button
                      type="button"
                      className="document-item__select"
                      onClick={() => onSelect(document.id)}
                    >
                      <span className="document-item__title">{document.title}</span>
                      <span className="document-item__meta">
                        {formatTimestamp(document.updatedAt)}
                      </span>
                    </button>
                  )}

                  <div className="document-item__actions">
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={() => startRename(document)}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="button button--ghost button--danger"
                      onClick={(event) => handleDelete(event, document)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}
