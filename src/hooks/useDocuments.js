import { useCallback, useEffect, useRef, useState } from 'react'
import {
  deleteDocumentWithRevisions,
  deleteRevisionRecord,
  initDocumentsDb,
  listDocuments,
  listRevisions,
  pruneRevisions,
  putDocument,
  putRevision,
} from '../lib/documentsDb'

const SAVE_DEBOUNCE_MS = 500
const AUTO_SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000 // checkpoint at most every 10 min
const MAX_REVISIONS = 100
const LAST_SELECTED_KEY = 'paste-vault:selected-document-id'

function sortDocuments(documents) {
  return [...documents].sort((a, b) => b.updatedAt - a.updatedAt)
}

function createDocumentRecord() {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    title: 'Untitled',
    content: '',
    createdAt: now,
    updatedAt: now,
  }
}

function readLastSelectedId() {
  try {
    return window.sessionStorage.getItem(LAST_SELECTED_KEY)
  } catch {
    return null
  }
}

function writeLastSelectedId(id) {
  try {
    if (id) {
      window.sessionStorage.setItem(LAST_SELECTED_KEY, id)
    } else {
      window.sessionStorage.removeItem(LAST_SELECTED_KEY)
    }
  } catch {
    // Session storage is optional; selection still works in memory.
  }
}

export function useDocuments() {
  const [status, setStatus] = useState('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [documents, setDocuments] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [saveStatus, setSaveStatus] = useState('idle')
  const [revisions, setRevisions] = useState([])

  const documentsRef = useRef([])
  const selectedIdRef = useRef(null)
  const pendingRevisionRef = useRef(0)
  const persistedRevisionRef = useRef(0)
  const saveTimerRef = useRef(null)
  const writeChainRef = useRef(Promise.resolve())
  const snapshotChainRef = useRef(Promise.resolve())
  const sessionBaselineRef = useRef(new Set())

  const syncDocuments = useCallback((nextDocuments) => {
    const sorted = sortDocuments(nextDocuments)
    documentsRef.current = sorted
    setDocuments(sorted)
    return sorted
  }, [])

  const clearSaveTimer = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
  }, [])

  /* ---------- Version history ---------- */

  const refreshRevisions = useCallback(async (id) => {
    if (!id) {
      setRevisions([])
      return
    }
    try {
      const list = await listRevisions(id)
      if (selectedIdRef.current === id) {
        setRevisions(list)
      }
    } catch {
      // History is a bonus; never break editing because of it.
    }
  }, [])

  // Like `git commit`: stores a full copy of the text.
  // Never rejects. Resolves to { status, revision?, error? } where status is
  // 'created' | 'promoted' | 'unchanged' | 'error', so callers can tell
  // "nothing to save" apart from "storage failed".
  const createSnapshot = useCallback(
    (
      document,
      { kind = 'auto', label = '', minIntervalMs = 0, allowEmpty = false } = {},
    ) => {
      const task = snapshotChainRef.current
        .then(async () => {
          if (!document.content && !allowEmpty) {
            return { status: 'unchanged' }
          }

          const existing = await listRevisions(document.id)
          const latest = existing[0]

          if (latest && latest.content === document.content) {
            // Same text as the newest version: just promote it to a named one.
            if (kind === 'manual' && latest.kind === 'auto') {
              const promoted = {
                ...latest,
                kind: 'manual',
                label: label || latest.label,
              }
              await putRevision(promoted)
              await refreshRevisions(document.id)
              return { status: 'promoted', revision: promoted }
            }
            return { status: 'unchanged' }
          }

          if (
            minIntervalMs &&
            latest &&
            Date.now() - latest.createdAt < minIntervalMs
          ) {
            return { status: 'unchanged' }
          }

          const revision = {
            id: crypto.randomUUID(),
            documentId: document.id,
            content: document.content,
            label,
            kind,
            createdAt: Date.now(),
          }
          await putRevision(revision)

          try {
            await pruneRevisions(document.id, MAX_REVISIONS)
          } catch {
            // The version is saved; failing to trim old ones is not fatal.
          }
          await refreshRevisions(document.id)
          return { status: 'created', revision }
        })
        .catch((error) => ({ status: 'error', error }))

      snapshotChainRef.current = task
      return task
    },
    [refreshRevisions],
  )

  const persistDocument = useCallback(
    (document, revision) => {
      const write = writeChainRef.current.then(async () => {
        if (revision !== pendingRevisionRef.current) {
          return
        }

        const latest = documentsRef.current.find((item) => item.id === document.id)
        if (!latest) {
          return
        }

        setSaveStatus('saving')

        try {
          await putDocument(latest)

          if (
            selectedIdRef.current === latest.id &&
            pendingRevisionRef.current === revision
          ) {
            persistedRevisionRef.current = revision
            setSaveStatus('saved')
            setErrorMessage('')
          }

          // Periodic checkpoint while you keep writing.
          void createSnapshot(latest, {
            kind: 'auto',
            minIntervalMs: AUTO_SNAPSHOT_INTERVAL_MS,
            allowEmpty: true,
          })
        } catch (error) {
          if (selectedIdRef.current === latest.id) {
            setSaveStatus('error')
            setErrorMessage(error.message)
          }
        }
      })

      writeChainRef.current = write.catch(() => {})
      return write
    },
    [createSnapshot],
  )

  const flushSave = useCallback(
    async (documentId = selectedIdRef.current) => {
      clearSaveTimer()
      if (!documentId) {
        return
      }

      const document = documentsRef.current.find((item) => item.id === documentId)
      if (!document) {
        return
      }

      if (pendingRevisionRef.current === persistedRevisionRef.current) {
        return
      }

      await persistDocument(document, pendingRevisionRef.current)
    },
    [clearSaveTimer, persistDocument],
  )

  const scheduleSave = useCallback(
    (document) => {
      pendingRevisionRef.current += 1
      const revision = pendingRevisionRef.current
      setSaveStatus('unsaved')
      clearSaveTimer()

      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null
        void persistDocument(document, revision)
      }, SAVE_DEBOUNCE_MS)
    },
    [clearSaveTimer, persistDocument],
  )

  const updateDocument = useCallback(
    (id, patch, { persistImmediately = false } = {}) => {
      const current = documentsRef.current.find((item) => item.id === id)
      if (!current) {
        return null
      }

      const nextDocument = {
        ...current,
        ...patch,
        updatedAt: Date.now(),
      }

      syncDocuments(
        documentsRef.current.map((item) => (item.id === id ? nextDocument : item)),
      )

      if (persistImmediately) {
        clearSaveTimer()
        pendingRevisionRef.current += 1
        void persistDocument(nextDocument, pendingRevisionRef.current)
      } else {
        scheduleSave(nextDocument)
      }

      return nextDocument
    },
    [clearSaveTimer, persistDocument, scheduleSave, syncDocuments],
  )

  const selectDocument = useCallback(
    async (id) => {
      if (id === selectedIdRef.current) {
        return
      }

      const previousId = selectedIdRef.current
      if (previousId) {
        await flushSave(previousId)
      }

      selectedIdRef.current = id
      setSelectedId(id)
      writeLastSelectedId(id)
      pendingRevisionRef.current = 0
      persistedRevisionRef.current = 0
      setSaveStatus(id ? 'saved' : 'idle')
    },
    [flushSave],
  )

  const createDocument = useCallback(async () => {
    await flushSave()
    const document = createDocumentRecord()

    try {
      await putDocument(document)
      syncDocuments([document, ...documentsRef.current])
      selectedIdRef.current = document.id
      setSelectedId(document.id)
      writeLastSelectedId(document.id)
      pendingRevisionRef.current = 0
      persistedRevisionRef.current = 0
      setSaveStatus('saved')
      setErrorMessage('')
      return document
    } catch (error) {
      setErrorMessage(error.message)
      setSaveStatus('error')
      return null
    }
  }, [flushSave, syncDocuments])

  const renameDocument = useCallback(
    (id, title) => {
      const trimmed = title.trim() || 'Untitled'
      updateDocument(id, { title: trimmed }, { persistImmediately: true })
    },
    [updateDocument],
  )

  const updateContent = useCallback(
    (id, content) => {
      const current = documentsRef.current.find((item) => item.id === id)

      // First edit of this document in this session: keep what was there before.
      if (current && !sessionBaselineRef.current.has(id)) {
        sessionBaselineRef.current.add(id)
        if (current.content !== content) {
          void createSnapshot(current, {
            kind: 'auto',
            label: 'Before this editing session',
            allowEmpty: true,
          })
        }
      }

      updateDocument(id, { content })
    },
    [createSnapshot, updateDocument],
  )

  const deleteDocument = useCallback(
    async (id) => {
      if (id === selectedIdRef.current) {
        // Deleting the open document: its pending save no longer matters.
        clearSaveTimer()
      } else {
        // Deleting a different document: don't lose the open one's pending edits.
        await flushSave()
      }
      await writeChainRef.current
      await snapshotChainRef.current

      try {
        await deleteDocumentWithRevisions(id)
        sessionBaselineRef.current.delete(id)
        const remaining = documentsRef.current.filter((item) => item.id !== id)
        syncDocuments(remaining)

        if (selectedIdRef.current === id) {
          const nextId = remaining[0]?.id ?? null
          selectedIdRef.current = nextId
          setSelectedId(nextId)
          writeLastSelectedId(nextId)
          pendingRevisionRef.current = 0
          persistedRevisionRef.current = 0
          setSaveStatus(nextId ? 'saved' : 'idle')
        }

        setErrorMessage('')
        return true
      } catch (error) {
        setErrorMessage(error.message)
        setSaveStatus('error')
        return false
      }
    },
    [clearSaveTimer, flushSave, syncDocuments],
  )

  // Manual "commit". Resolves to the same { status, revision?, error? } shape
  // as createSnapshot so the UI can tell "unchanged" from "failed".
  const saveVersion = useCallback(
    async (label = '') => {
      const id = selectedIdRef.current
      if (!documentsRef.current.some((item) => item.id === id)) {
        return { status: 'error', error: new Error('No document is selected.') }
      }
      await flushSave(id)
      const document = documentsRef.current.find((item) => item.id === id)
      if (!document) {
        return { status: 'error', error: new Error('The document no longer exists.') }
      }
      return createSnapshot(document, {
        kind: 'manual',
        label: label.trim(),
        allowEmpty: true,
      })
    },
    [createSnapshot, flushSave],
  )

  // Like `git checkout <version>`, but your current text is snapshotted first.
  // If that safety snapshot fails, the restore is cancelled so nothing is lost.
  // Resolves to true when the restore happened.
  const restoreRevision = useCallback(
    async (revision) => {
      const id = selectedIdRef.current
      const document = documentsRef.current.find((item) => item.id === id)
      if (!document || revision.documentId !== id) {
        return false
      }

      const backup = await createSnapshot(document, {
        kind: 'auto',
        label: 'Before restore',
        allowEmpty: true,
      })
      if (backup.status === 'error') {
        setErrorMessage(
          `Restore cancelled: could not back up your current text. ${backup.error.message}`,
        )
        return false
      }

      updateDocument(id, { content: revision.content }, { persistImmediately: true })
      await refreshRevisions(id)
      return true
    },
    [createSnapshot, refreshRevisions, updateDocument],
  )

  const deleteRevision = useCallback(
    async (revisionId) => {
      try {
        await deleteRevisionRecord(revisionId)
      } catch (error) {
        setErrorMessage(error.message)
      }
      await refreshRevisions(selectedIdRef.current)
    },
    [refreshRevisions],
  )

  useEffect(() => {
    refreshRevisions(selectedId)
  }, [selectedId, refreshRevisions])

  useEffect(() => {
    let cancelled = false

    async function loadDocuments() {
      try {
        await initDocumentsDb()
        const stored = await listDocuments()
        if (cancelled) {
          return
        }

        const sorted = syncDocuments(stored)
        const rememberedId = readLastSelectedId()
        const initialId = sorted.some((item) => item.id === rememberedId)
          ? rememberedId
          : (sorted[0]?.id ?? null)

        selectedIdRef.current = initialId
        setSelectedId(initialId)
        setStatus('ready')
        setSaveStatus(initialId ? 'saved' : 'idle')
      } catch (error) {
        if (cancelled) {
          return
        }

        setStatus('error')
        setErrorMessage(error.message)
      }
    }

    void loadDocuments()

    return () => {
      cancelled = true
    }
  }, [syncDocuments])

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        void flushSave()
      }
    }

    function handlePageHide() {
      void flushSave()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', handlePageHide)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', handlePageHide)
      clearSaveTimer()
    }
  }, [clearSaveTimer, flushSave])

  const selectedDocument =
    documents.find((item) => item.id === selectedId) ?? null

  return {
    status,
    errorMessage,
    documents,
    selectedId,
    selectedDocument,
    saveStatus,
    revisions,
    createDocument,
    selectDocument,
    renameDocument,
    updateContent,
    deleteDocument,
    saveVersion,
    restoreRevision,
    deleteRevision,
  }
}