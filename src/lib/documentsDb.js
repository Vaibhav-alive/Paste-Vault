import { openDB } from 'idb'

const DB_NAME = 'paste-vault'
const DB_VERSION = 2
const STORE_NAME = 'documents'
const REVISIONS_STORE = 'revisions'

let dbPromise = null

export class DocumentsDbError extends Error {
  constructor(message, cause) {
    super(message)
    this.name = 'DocumentsDbError'
    this.cause = cause
  }
}

function wrapError(error, fallbackMessage) {
  if (error instanceof DocumentsDbError) {
    return error
  }

  const detail = error instanceof Error ? error.message : String(error)
  return new DocumentsDbError(`${fallbackMessage} ${detail}`.trim(), error)
}

export function isIndexedDbSupported() {
  return typeof indexedDB !== 'undefined'
}

export function initDocumentsDb() {
  if (!isIndexedDbSupported()) {
    return Promise.reject(
      new DocumentsDbError(
        'IndexedDB is not available in this browser, so documents cannot be saved.',
      ),
    )
  }

  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' })
          store.createIndex('updatedAt', 'updatedAt')
        }
        // v2: version history. Existing documents are untouched.
        if (!database.objectStoreNames.contains(REVISIONS_STORE)) {
          const revisions = database.createObjectStore(REVISIONS_STORE, {
            keyPath: 'id',
          })
          revisions.createIndex('documentId', 'documentId')
        }
      },
      terminated() {
        dbPromise = null
      },
    }).catch((error) => {
      dbPromise = null
      throw wrapError(error, 'Could not open the local document database.')
    })
  }

  return dbPromise
}

export async function listDocuments() {
  try {
    const db = await initDocumentsDb()
    return db.getAll(STORE_NAME)
  } catch (error) {
    throw wrapError(error, 'Could not load documents from IndexedDB.')
  }
}

export async function putDocument(document) {
  try {
    const db = await initDocumentsDb()
    await db.put(STORE_NAME, document)
    return document
  } catch (error) {
    throw wrapError(error, 'Could not save the document.')
  }
}

export async function deleteDocumentRecord(id) {
  try {
    const db = await initDocumentsDb()
    await db.delete(STORE_NAME, id)
  } catch (error) {
    throw wrapError(error, 'Could not delete the document.')
  }
}

// Deletes the document and all of its versions in ONE transaction:
// either both are removed or neither is.
export async function deleteDocumentWithRevisions(id) {
  try {
    const db = await initDocumentsDb()
    const tx = db.transaction([STORE_NAME, REVISIONS_STORE], 'readwrite')
    const revisionStore = tx.objectStore(REVISIONS_STORE)
    const keys = await revisionStore.index('documentId').getAllKeys(id)
    await Promise.all([
      ...keys.map((key) => revisionStore.delete(key)),
      tx.objectStore(STORE_NAME).delete(id),
      tx.done,
    ])
  } catch (error) {
    throw wrapError(error, 'Could not delete the document.')
  }
}

/* ---------- Version history ---------- */

// Newest first.
export async function listRevisions(documentId) {
  try {
    const db = await initDocumentsDb()
    const all = await db.getAllFromIndex(REVISIONS_STORE, 'documentId', documentId)
    return all.sort((a, b) => b.createdAt - a.createdAt)
  } catch (error) {
    throw wrapError(error, 'Could not load version history.')
  }
}

export async function putRevision(revision) {
  try {
    const db = await initDocumentsDb()
    await db.put(REVISIONS_STORE, revision)
    return revision
  } catch (error) {
    throw wrapError(error, 'Could not save the version.')
  }
}

export async function deleteRevisionRecord(id) {
  try {
    const db = await initDocumentsDb()
    await db.delete(REVISIONS_STORE, id)
  } catch (error) {
    throw wrapError(error, 'Could not delete the version.')
  }
}

export async function deleteRevisionsForDocument(documentId) {
  try {
    const db = await initDocumentsDb()
    const tx = db.transaction(REVISIONS_STORE, 'readwrite')
    const keys = await tx.store.index('documentId').getAllKeys(documentId)
    await Promise.all([...keys.map((key) => tx.store.delete(key)), tx.done])
  } catch (error) {
    throw wrapError(error, 'Could not delete version history.')
  }
}

// Keeps every manual version; trims only the oldest automatic ones.
export async function pruneRevisions(documentId, max) {
  const revisions = await listRevisions(documentId)
  if (revisions.length <= max) {
    return
  }

  const autos = revisions.filter((item) => item.kind === 'auto')
  const manualCount = revisions.length - autos.length
  const keepAuto = Math.max(20, max - manualCount)
  const doomed = autos.slice(keepAuto)

  for (const revision of doomed) {
    await deleteRevisionRecord(revision.id)
  }
}