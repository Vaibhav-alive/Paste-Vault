import { useState } from 'react'
import { Editor } from './components/Editor.jsx'
import { Sidebar } from './components/Sidebar.jsx'
import { useDocuments } from './hooks/useDocuments.js'
import './App.css'

function App() {
  const {
    status,
    errorMessage,
    documents,
    selectedId,
    selectedDocument,
    saveStatus,
    revisions,
    historyError,
    reloadHistory,
    createDocument,
    selectDocument,
    renameDocument,
    updateContent,
    deleteDocument,
    saveVersion,
    restoreRevision,
    deleteRevision,
  } = useDocuments()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const persistenceDisabled = status === 'error'

  async function handleCreate() {
    const created = await createDocument()
    if (created) {
      setSidebarOpen(false)
    }
  }

  function handleSelect(id) {
    void selectDocument(id)
    setSidebarOpen(false)
  }

  return (
    <div className="app-shell">
      <header className="mobile-bar">
        <button
          type="button"
          className="button"
          aria-expanded={sidebarOpen}
          aria-controls="document-sidebar"
          onClick={() => setSidebarOpen((open) => !open)}
        >
          {sidebarOpen ? 'Close documents' : 'Documents'}
        </button>
        <strong>PasteVault</strong>
      </header>

      {errorMessage ? (
        <div className="banner" role="alert">
          {errorMessage}
        </div>
      ) : null}

      <div className="workspace">
        <div
          id="document-sidebar"
          className={`sidebar-frame ${sidebarOpen ? 'is-open' : ''}`}
        >
          <Sidebar
            documents={documents}
            selectedId={selectedId}
            onSelect={handleSelect}
            onCreate={handleCreate}
            onRename={renameDocument}
            onDelete={(id) => {
              void deleteDocument(id)
            }}
            createDisabled={persistenceDisabled}
          />
        </div>

        {status === 'loading' ? (
          <section className="editor editor--empty">
            <div className="empty-state">
              <h2>Opening vault</h2>
              <p>Loading documents from this browser.</p>
            </div>
          </section>
        ) : (
          <Editor
            document={selectedDocument}
            saveStatus={saveStatus}
            onContentChange={updateContent}
            disabled={persistenceDisabled}
            revisions={revisions}
            historyError={historyError}
            onReloadHistory={reloadHistory}
            onSaveVersion={saveVersion}
            onRestoreRevision={restoreRevision}
            onDeleteRevision={deleteRevision}
          />
        )}
      </div>

      {sidebarOpen ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close documents"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}
    </div>
  )
}

export default App