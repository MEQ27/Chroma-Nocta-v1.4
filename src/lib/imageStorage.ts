const DB_NAME = 'chroma_nocta_db';
const STORE_NAME = 'skyvizor_media';
const DB_VERSION = 1;

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB bu tarayıcıda desteklenmiyor.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export interface StoredMediaRecord {
  id: string;
  data: string; // Base64 veya Blob URL
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export async function storeMediaItem(
  id: string,
  data: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const record: StoredMediaRecord = {
      id,
      data,
      createdAt: Date.now(),
      metadata,
    };
    const req = store.put(record);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function loadMediaItem(id: string): Promise<StoredMediaRecord | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);

    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function removeMediaItem(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function listAllMediaItems(): Promise<StoredMediaRecord[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();

    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/**
 * LocalStorage'da kalmış olabilecek büyük SkyVizor Base64 görsellerini
 * IndexedDB'ye taşıyıp LocalStorage kotasını (~5 MB) anında serbest bırakır.
 */
export async function migrateLegacyLocalStorageMedia(prefix: string = 'skyvizor_img_'): Promise<number> {
  if (typeof localStorage === 'undefined') return 0;

  const migratedKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      migratedKeys.push(key);
    }
  }

  for (const key of migratedKeys) {
    try {
      const data = localStorage.getItem(key);
      if (data) {
        await storeMediaItem(key, data, { migratedFromLocalStorage: true });
        localStorage.removeItem(key);
      }
    } catch (e) {
      console.warn(`Görsel göç hatası (${key}):`, e);
    }
  }

  return migratedKeys.length;
}
