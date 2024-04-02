var _a;
import { AsyncKeyValueFileSystem } from '@browserfs/core/backends/AsyncStore.js';
import { ApiError, ErrorCode } from '@browserfs/core/ApiError.js';
import { CreateBackend } from '@browserfs/core/backends/backend.js';
/**
 * Converts a DOMException or a DOMError from an IndexedDB event into a
 * standardized BrowserFS API error.
 * @hidden
 */
function convertError(e, message = e.toString()) {
    switch (e.name) {
        case 'NotFoundError':
            return new ApiError(ErrorCode.ENOENT, message);
        case 'QuotaExceededError':
            return new ApiError(ErrorCode.ENOSPC, message);
        default:
            // The rest do not seem to map cleanly to standard error codes.
            return new ApiError(ErrorCode.EIO, message);
    }
}
/**
 * Produces a new onerror handler for IDB. Our errors are always fatal, so we
 * handle them generically: Call the user-supplied callback with a translated
 * version of the error, and let the error bubble up.
 * @hidden
 */
function onErrorHandler(cb, code = ErrorCode.EIO, message = null) {
    return function (e) {
        // Prevent the error from canceling the transaction.
        e.preventDefault();
        cb(new ApiError(code, message !== null ? message : undefined));
    };
}
/**
 * @hidden
 */
export class IndexedDBROTransaction {
    constructor(tx, store) {
        this.tx = tx;
        this.store = store;
    }
    get(key) {
        return new Promise((resolve, reject) => {
            try {
                const r = this.store.get(key);
                r.onerror = onErrorHandler(reject);
                r.onsuccess = event => {
                    // IDB returns the value 'undefined' when you try to get keys that
                    // don't exist. The caller expects this behavior.
                    const result = event.target.result;
                    if (result === undefined) {
                        resolve(result);
                    }
                    else {
                        // IDB data is stored as an ArrayUint8Array
                        resolve(Uint8Array.from(result));
                    }
                };
            }
            catch (e) {
                reject(convertError(e));
            }
        });
    }
}
/**
 * @hidden
 */
export class IndexedDBRWTransaction extends IndexedDBROTransaction {
    constructor(tx, store) {
        super(tx, store);
    }
    /**
     * @todo return false when add has a key conflict (no error)
     */
    put(key, data, overwrite) {
        return new Promise((resolve, reject) => {
            try {
                const r = overwrite ? this.store.put(data, key) : this.store.add(data, key);
                r.onerror = onErrorHandler(reject);
                r.onsuccess = () => {
                    resolve(true);
                };
            }
            catch (e) {
                reject(convertError(e));
            }
        });
    }
    del(key) {
        return new Promise((resolve, reject) => {
            try {
                const r = this.store.delete(key);
                r.onerror = onErrorHandler(reject);
                r.onsuccess = () => {
                    resolve();
                };
            }
            catch (e) {
                reject(convertError(e));
            }
        });
    }
    commit() {
        return new Promise(resolve => {
            // Return to the event loop to commit the transaction.
            setTimeout(resolve, 0);
        });
    }
    abort() {
        return new Promise((resolve, reject) => {
            try {
                this.tx.abort();
                resolve();
            }
            catch (e) {
                reject(convertError(e));
            }
        });
    }
}
export class IndexedDBStore {
    static Create(storeName, indexedDB) {
        return new Promise((resolve, reject) => {
            const openReq = indexedDB.open(storeName, 1);
            openReq.onupgradeneeded = event => {
                const db = event.target.result;
                // Huh. This should never happen; we're at version 1. Why does another
                // database exist?
                if (db.objectStoreNames.contains(storeName)) {
                    db.deleteObjectStore(storeName);
                }
                db.createObjectStore(storeName);
            };
            openReq.onsuccess = event => {
                resolve(new IndexedDBStore(event.target.result, storeName));
            };
            openReq.onerror = onErrorHandler(reject, ErrorCode.EACCES);
        });
    }
    constructor(db, storeName) {
        this.db = db;
        this.storeName = storeName;
    }
    name() {
        return IndexedDBFileSystem.Name + ' - ' + this.storeName;
    }
    clear() {
        return new Promise((resolve, reject) => {
            try {
                const tx = this.db.transaction(this.storeName, 'readwrite'), objectStore = tx.objectStore(this.storeName), r = objectStore.clear();
                r.onsuccess = () => {
                    // Use setTimeout to commit transaction.
                    setTimeout(resolve, 0);
                };
                r.onerror = onErrorHandler(reject);
            }
            catch (e) {
                reject(convertError(e));
            }
        });
    }
    beginTransaction(type = 'readonly') {
        const tx = this.db.transaction(this.storeName, type), objectStore = tx.objectStore(this.storeName);
        if (type === 'readwrite') {
            return new IndexedDBRWTransaction(tx, objectStore);
        }
        else if (type === 'readonly') {
            return new IndexedDBROTransaction(tx, objectStore);
        }
        else {
            throw new ApiError(ErrorCode.EINVAL, 'Invalid transaction type.');
        }
    }
}
/**
 * A file system that uses the IndexedDB key value file system.
 */
export class IndexedDBFileSystem extends AsyncKeyValueFileSystem {
    static isAvailable(idbFactory = globalThis.indexedDB) {
        try {
            if (!(idbFactory instanceof IDBFactory)) {
                return false;
            }
            const req = idbFactory.open('__browserfs_test__');
            if (!req) {
                return false;
            }
        }
        catch (e) {
            return false;
        }
    }
    constructor({ cacheSize = 100, storeName = 'browserfs', idbFactory = globalThis.indexedDB }) {
        super(cacheSize);
        this._ready = IndexedDBStore.Create(storeName, idbFactory).then(store => {
            this.init(store);
            return this;
        });
    }
}
_a = IndexedDBFileSystem;
IndexedDBFileSystem.Name = 'IndexedDB';
IndexedDBFileSystem.Create = CreateBackend.bind(_a);
IndexedDBFileSystem.Options = {
    storeName: {
        type: 'string',
        optional: true,
        description: 'The name of this file system. You can have multiple IndexedDB file systems operating at once, but each must have a different name.',
    },
    cacheSize: {
        type: 'number',
        optional: true,
        description: 'The size of the inode cache. Defaults to 100. A size of 0 or below disables caching.',
    },
    idbFactory: {
        type: 'object',
        optional: true,
        description: 'The IDBFactory to use. Defaults to globalThis.indexedDB.',
    },
};
