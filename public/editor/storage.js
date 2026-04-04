const DB_NAME = "webengine-editor";
const DB_VERSION = 2;
const ENTRY_STORE = "entries";
const BLOB_STORE = "blobs";

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.addEventListener("upgradeneeded", () => {
            const db = request.result;

            if (!db.objectStoreNames.contains(ENTRY_STORE)) {
                db.createObjectStore(ENTRY_STORE, { keyPath: "path" });
            }

            if (!db.objectStoreNames.contains(BLOB_STORE)) {
                db.createObjectStore(BLOB_STORE, { keyPath: "key" });
            }
        });

        request.addEventListener("success", () => resolve(request.result));
        request.addEventListener("error", () => reject(request.error));
    });
}

function waitForTransaction(tx) {
    return new Promise((resolve, reject) => {
        tx.addEventListener("complete", resolve);
        tx.addEventListener("error", () => reject(tx.error));
        tx.addEventListener("abort", () => reject(tx.error));
    });
}

function promisifyRequest(request) {
    return new Promise((resolve, reject) => {
        request.addEventListener("success", () => resolve(request.result));
        request.addEventListener("error", () => reject(request.error));
    });
}

export async function saveEntry(entry) {
    const db = await openDatabase();
    const tx = db.transaction(ENTRY_STORE, "readwrite");
    tx.objectStore(ENTRY_STORE).put(structuredClone(entry));
    await waitForTransaction(tx);
    db.close();
}

export async function saveEntries(entries) {
    const db = await openDatabase();
    const tx = db.transaction(ENTRY_STORE, "readwrite");
    const store = tx.objectStore(ENTRY_STORE);

    for (const entry of entries) {
        store.put(structuredClone(entry));
    }

    await waitForTransaction(tx);
    db.close();
}

export async function loadEntries() {
    const db = await openDatabase();
    const tx = db.transaction(ENTRY_STORE, "readonly");
    const store = tx.objectStore(ENTRY_STORE);

    const entries = await promisifyRequest(store.getAll());

    await waitForTransaction(tx);
    db.close();

    entries.sort((a, b) => {
        if (a.path === "/") return -1;
        if (b.path === "/") return 1;
        return a.path.localeCompare(b.path);
    });

    return entries;
}

export async function deleteEntryRecord(path) {
    const db = await openDatabase();
    const tx = db.transaction(ENTRY_STORE, "readwrite");
    tx.objectStore(ENTRY_STORE).delete(path);
    await waitForTransaction(tx);
    db.close();
}

export async function clearEntries() {
    const db = await openDatabase();
    const tx = db.transaction(ENTRY_STORE, "readwrite");
    tx.objectStore(ENTRY_STORE).clear();
    await waitForTransaction(tx);
    db.close();
}

export async function saveBlob(blobKey, blob) {
    const db = await openDatabase();
    const tx = db.transaction(BLOB_STORE, "readwrite");
    tx.objectStore(BLOB_STORE).put({ key: blobKey, blob });
    await waitForTransaction(tx);
    db.close();
}

export async function loadBlob(blobKey) {
    const db = await openDatabase();
    const tx = db.transaction(BLOB_STORE, "readonly");
    const result = await promisifyRequest(tx.objectStore(BLOB_STORE).get(blobKey));
    await waitForTransaction(tx);
    db.close();
    return result?.blob || null;
}

export async function deleteBlob(blobKey) {
    const db = await openDatabase();
    const tx = db.transaction(BLOB_STORE, "readwrite");
    tx.objectStore(BLOB_STORE).delete(blobKey);
    await waitForTransaction(tx);
    db.close();
}

export async function clearBlobs() {
    const db = await openDatabase();
    const tx = db.transaction(BLOB_STORE, "readwrite");
    tx.objectStore(BLOB_STORE).clear();
    await waitForTransaction(tx);
    db.close();
}