var _a;
import { SyncKeyValueFileSystem, SimpleSyncRWTransaction } from '@browserfs/core/backends/SyncStore.js';
import { ApiError, ErrorCode } from '@browserfs/core/ApiError.js';
import { CreateBackend } from '@browserfs/core/backends/backend.js';
import { utf16Encode, utf16Decode } from '../utf16coder.js';
/**
 * A synchronous key-value store backed by Storage.
 */
export class StorageStore {
    name() {
        return StorageFileSystem.Name;
    }
    constructor(_storage) {
        this._storage = _storage;
    }
    clear() {
        this._storage.clear();
    }
    beginTransaction(type) {
        // No need to differentiate.
        return new SimpleSyncRWTransaction(this);
    }
    get(key) {
        const data = this._storage.getItem(key);
        if (typeof data != 'string') {
            return;
        }
        return utf16Decode(data);
    }
    put(key, data, overwrite) {
        try {
            if (!overwrite && this._storage.getItem(key) !== null) {
                // Don't want to overwrite the key!
                return false;
            }
            this._storage.setItem(key, utf16Encode(data));
            return true;
        }
        catch (e) {
            throw new ApiError(ErrorCode.ENOSPC, 'Storage is full.');
        }
    }
    del(key) {
        try {
            this._storage.removeItem(key);
        }
        catch (e) {
            throw new ApiError(ErrorCode.EIO, 'Unable to delete key ' + key + ': ' + e);
        }
    }
}
/**
 * A synchronous file system backed by a `Storage` (e.g. localStorage).
 */
export class StorageFileSystem extends SyncKeyValueFileSystem {
    static isAvailable(storage = globalThis.localStorage) {
        return storage instanceof Storage;
    }
    /**
     * Creates a new Storage file system using the contents of `Storage`.
     */
    constructor({ storage = globalThis.localStorage }) {
        super({ store: new StorageStore(storage) });
    }
}
_a = StorageFileSystem;
StorageFileSystem.Name = 'Storage';
StorageFileSystem.Create = CreateBackend.bind(_a);
StorageFileSystem.Options = {
    storage: {
        type: 'object',
        optional: true,
        description: 'The Storage to use. Defaults to globalThis.localStorage.',
    },
};
