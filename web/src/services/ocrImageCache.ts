/**
 * Caché persistente (IndexedDB) de la última foto seleccionada para OCR.
 *
 * Problema que resuelve: en móvil, Safari/Chrome pueden matar el tab por presión
 * de memoria mientras Tesseract.js arranca. Al restaurarse el tab, el `File` que
 * vivía solo en `inputRef.current.files` desaparece y el usuario tiene que volver
 * a tomar la foto. Guardamos el Blob redimensionado en IDB apenas el usuario lo
 * selecciona → tras el reinicio lo recuperamos automáticamente.
 *
 * Se limpia tras OCR exitoso, al cambiar de foto, o al salir del panel.
 */
const DB_NAME = 'vene-ocr'
const STORE = 'pending-images'
const KEY = 'transit-license'
const DB_VERSION = 1

type StoredEntry = {
  blob: Blob
  name: string
  type: string
  savedAt: number
}

async function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('No se pudo abrir IndexedDB'))
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>,
): Promise<T | null> {
  if (typeof indexedDB === 'undefined') return null
  let db: IDBDatabase
  try {
    db = await openDb()
  } catch {
    return null
  }
  return new Promise<T | null>((resolve) => {
    const tx = db.transaction(STORE, mode)
    const store = tx.objectStore(STORE)
    let result: T | null = null
    Promise.resolve(fn(store))
      .then((r) => {
        if (r && typeof (r as IDBRequest<T>).onsuccess !== 'undefined') {
          const req = r as IDBRequest<T>
          req.onsuccess = () => {
            result = req.result ?? null
          }
          req.onerror = () => {
            result = null
          }
        } else {
          result = r as T
        }
      })
      .catch(() => {
        result = null
      })
    tx.oncomplete = () => {
      db.close()
      resolve(result)
    }
    tx.onerror = () => {
      db.close()
      resolve(null)
    }
    tx.onabort = () => {
      db.close()
      resolve(null)
    }
  })
}

export async function saveOcrImage(file: File): Promise<void> {
  const entry: StoredEntry = {
    blob: file,
    name: file.name,
    type: file.type || 'image/jpeg',
    savedAt: Date.now(),
  }
  await withStore('readwrite', (store) => store.put(entry, KEY))
}

export async function loadOcrImage(maxAgeMs = 24 * 60 * 60 * 1000): Promise<File | null> {
  const entry = await withStore<StoredEntry>('readonly', (store) => store.get(KEY))
  if (!entry || !entry.blob) return null
  if (Date.now() - entry.savedAt > maxAgeMs) {
    // Foto muy vieja: probablemente ya se usó; descartar para no desconcertar.
    await clearOcrImage()
    return null
  }
  return new File([entry.blob], entry.name, {
    type: entry.type,
    lastModified: entry.savedAt,
  })
}

export async function clearOcrImage(): Promise<void> {
  await withStore('readwrite', (store) => store.delete(KEY))
}
