const PREVIEW_IMAGE_PREFIX = "ethos-attachment-preview:";
const DB_NAME = "ethos-merchant-attachments";
const DB_VERSION = 1;
const BLOB_STORE = "blobs";

function previewImageKey(attachmentId: string): string {
  return `${PREVIEW_IMAGE_PREFIX}${attachmentId}`;
}

export function readCachedAttachmentPreviewImage(attachmentId: string): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    return sessionStorage.getItem(previewImageKey(attachmentId));
  } catch {
    return null;
  }
}

export function writeCachedAttachmentPreviewImage(
  attachmentId: string,
  dataUrl: string,
): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(previewImageKey(attachmentId), dataUrl);
  } catch {
    /* quota — thumbnail optional */
  }
}

export function removeCachedAttachmentPreviewImage(attachmentId: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(previewImageKey(attachmentId));
  } catch {
    /* ignore */
  }
}

function openAttachmentBlobDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("Could not open attachment cache"));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE);
      }
    };
  });
}

export async function cacheAttachmentBlob(attachmentId: string, blob: Blob): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openAttachmentBlobDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(BLOB_STORE, "readwrite");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error ?? new Error("Could not cache attachment"));
    tx.objectStore(BLOB_STORE).put(blob, attachmentId);
  });
}

export async function getCachedAttachmentBlob(attachmentId: string): Promise<Blob | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openAttachmentBlobDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BLOB_STORE, "readonly");
    tx.onerror = () => reject(tx.error ?? new Error("Could not read attachment cache"));
    const getReq = tx.objectStore(BLOB_STORE).get(attachmentId);
    getReq.onsuccess = () => {
      db.close();
      resolve(getReq.result instanceof Blob ? getReq.result : null);
    };
    getReq.onerror = () => reject(getReq.error ?? new Error("Could not read attachment"));
  });
}

export async function removeCachedAttachmentBlob(attachmentId: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openAttachmentBlobDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(BLOB_STORE, "readwrite");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error ?? new Error("Could not remove attachment cache"));
    tx.objectStore(BLOB_STORE).delete(attachmentId);
  });
}

export async function clearAttachmentPreviewCaches(attachmentId: string): Promise<void> {
  removeCachedAttachmentPreviewImage(attachmentId);
  try {
    await removeCachedAttachmentBlob(attachmentId);
  } catch {
    /* ignore */
  }
}
