const DATABASE_NAME = "ip-motors-fleet";
const DATABASE_VERSION = 1;
const STORES = ["vehicles", "drivers", "expenses", "income", "remittances"];

let databasePromise;

function openDatabase() {
    if (!globalThis.indexedDB) {
        return Promise.reject(new Error("This browser does not support on-device storage."));
    }
    if (!databasePromise) {
        databasePromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
            request.onupgradeneeded = () => {
                const database = request.result;
                STORES.forEach((store) => {
                    if (!database.objectStoreNames.contains(store)) {
                        database.createObjectStore(store, { keyPath: "id" });
                    }
                });
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error("Could not open local fleet storage."));
            request.onblocked = () => reject(new Error("Close other IP Motors tabs and try again."));
        });
    }
    return databasePromise;
}

export async function getRecords(store) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
        const request = database.transaction(store, "readonly").objectStore(store).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error || new Error("Could not read saved records."));
    });
}

export async function saveRecord(store, record) {
    const database = await openDatabase();
    const value = {
        ...record,
        id: record.id || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        updatedAt: new Date().toISOString(),
    };
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(store, "readwrite");
        transaction.objectStore(store).put(value);
        transaction.oncomplete = () => resolve(value);
        transaction.onerror = () => reject(transaction.error || new Error("Could not save this record."));
        transaction.onabort = () => reject(transaction.error || new Error("Saving this record was cancelled."));
    });
}

export async function deleteRecord(store, id) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(store, "readwrite");
        transaction.objectStore(store).delete(id);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error || new Error("Could not delete this record."));
        transaction.onabort = () => reject(transaction.error || new Error("Deleting this record was cancelled."));
    });
}

export async function exportDatabase() {
    const data = {};
    for (const store of STORES) data[store] = await getRecords(store);
    return { format: "ip-motors-local-backup", version: 1, exportedAt: new Date().toISOString(), data };
}

export async function importDatabase(backup) {
    if (backup?.format !== "ip-motors-local-backup" || backup?.version !== 1 || !backup.data) {
        throw new Error("That file is not a supported IP Motors backup.");
    }
    for (const store of STORES) {
        if (!Array.isArray(backup.data[store])) throw new Error(`The backup is missing ${store} records.`);
    }
    const database = await openDatabase();
    const transaction = database.transaction(STORES, "readwrite");
    for (const store of STORES) {
        const objectStore = transaction.objectStore(store);
        objectStore.clear();
        backup.data[store].forEach((record) => objectStore.put(record));
    }
    await new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error || new Error("Could not restore this backup."));
        transaction.onabort = () => reject(transaction.error || new Error("Backup restore was cancelled."));
    });
}
