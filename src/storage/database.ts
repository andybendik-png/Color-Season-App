/** Minimal promise wrapper around IndexedDB. All data stays on the device. */
const DB_NAME = 'soft-summer-scanner';
const DB_VERSION = 1;
export type StoreName = 'samples' | 'profiles' | 'settings';

let dbp: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB is not available'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('samples')) db.createObjectStore('samples', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('profiles')) db.createObjectStore('profiles', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req ? (req.result as T) : (undefined as T));
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const dbGetAll = <T>(store: StoreName) => tx<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>);
export const dbPut = <T>(store: StoreName, value: T) => tx<IDBValidKey>(store, 'readwrite', (s) => s.put(value));
export const dbDelete = (store: StoreName, key: string) => tx<undefined>(store, 'readwrite', (s) => s.delete(key));
export const dbClear = (store: StoreName) => tx<undefined>(store, 'readwrite', (s) => s.clear());
export const dbGet = <T>(store: StoreName, key: string) => tx<T | undefined>(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>);

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const v = await dbGet<{ key: string; value: T }>('settings', key);
    return v ? v.value : fallback;
  } catch { return fallback; }
}
export const setSetting = <T>(key: string, value: T) => dbPut('settings', { key, value }).catch(() => undefined);

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
