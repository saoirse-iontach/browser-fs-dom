var _a;
import { BaseFileSystem } from '@browserfs/core/filesystem.js';
import { ApiError, ErrorCode } from '@browserfs/core/ApiError.js';
import { CreateBackend } from '@browserfs/core/backends/backend.js';
function isRPCMessage(arg) {
    return typeof arg == 'object' && 'isBFS' in arg && !!arg.isBFS;
}
/**
 * WorkerFS lets you access a BrowserFS instance that is running in a different
 * JavaScript context (e.g. access BrowserFS in one of your WebWorkers, or
 * access BrowserFS running on the main page from a WebWorker).
 *
 * For example, to have a WebWorker access files in the main browser thread,
 * do the following:
 *
 * MAIN BROWSER THREAD:
 *
 * ```javascript
 *   // Listen for remote file system requests.
 *   BrowserFS.Backend.WorkerFS.attachRemoteListener(webWorkerObject);
 * ```
 *
 * WEBWORKER THREAD:
 *
 * ```javascript
 *   // Set the remote file system as the root file system.
 *   BrowserFS.configure({ fs: "WorkerFS", options: { worker: self }}, function(e) {
 *     // Ready!
 *   });
 * ```
 *
 * Note that synchronous operations are not permitted on the WorkerFS, regardless
 * of the configuration option of the remote FS.
 */
export class WorkerFS extends BaseFileSystem {
    static isAvailable() {
        return typeof importScripts !== 'undefined' || typeof Worker !== 'undefined';
    }
    /**
     * Constructs a new WorkerFS instance that connects with BrowserFS running on
     * the specified worker.
     */
    constructor({ worker }) {
        super();
        this._currentID = 0;
        this._requests = new Map();
        this._isInitialized = false;
        this._worker = worker;
        this._worker.onmessage = (event) => {
            if (!isRPCMessage(event.data)) {
                return;
            }
            const { id, method, value } = event.data;
            if (method === 'metadata') {
                this._metadata = value;
                this._isInitialized = true;
                return;
            }
            const { resolve, reject } = this._requests.get(id);
            this._requests.delete(id);
            if (value instanceof Error || value instanceof ApiError) {
                reject(value);
                return;
            }
            resolve(value);
        };
    }
    get metadata() {
        return {
            ...super.metadata,
            ...this._metadata,
            name: _a.Name,
            synchronous: false,
        };
    }
    async _rpc(method, ...args) {
        return new Promise((resolve, reject) => {
            const id = this._currentID++;
            this._requests.set(id, { resolve, reject });
            this._worker.postMessage({
                isBFS: true,
                id,
                method,
                args,
            });
        });
    }
    rename(oldPath, newPath, cred) {
        return this._rpc('rename', oldPath, newPath, cred);
    }
    stat(p, cred) {
        return this._rpc('stat', p, cred);
    }
    open(p, flag, mode, cred) {
        return this._rpc('open', p, flag, mode, cred);
    }
    unlink(p, cred) {
        return this._rpc('unlink', p, cred);
    }
    rmdir(p, cred) {
        return this._rpc('rmdir', p, cred);
    }
    mkdir(p, mode, cred) {
        return this._rpc('mkdir', p, mode, cred);
    }
    readdir(p, cred) {
        return this._rpc('readdir', p, cred);
    }
    exists(p, cred) {
        return this._rpc('exists', p, cred);
    }
    realpath(p, cred) {
        return this._rpc('realpath', p, cred);
    }
    truncate(p, len, cred) {
        return this._rpc('truncate', p, len, cred);
    }
    readFile(fname, flag, cred) {
        return this._rpc('readFile', fname, flag, cred);
    }
    writeFile(fname, data, flag, mode, cred) {
        return this._rpc('writeFile', fname, data, flag, mode, cred);
    }
    appendFile(fname, data, flag, mode, cred) {
        return this._rpc('appendFile', fname, data, flag, mode, cred);
    }
    chmod(p, mode, cred) {
        return this._rpc('chmod', p, mode, cred);
    }
    chown(p, new_uid, new_gid, cred) {
        return this._rpc('chown', p, new_uid, new_gid, cred);
    }
    utimes(p, atime, mtime, cred) {
        return this._rpc('utimes', p, atime, mtime, cred);
    }
    link(srcpath, dstpath, cred) {
        return this._rpc('link', srcpath, dstpath, cred);
    }
    symlink(srcpath, dstpath, type, cred) {
        return this._rpc('symlink', srcpath, dstpath, type, cred);
    }
    readlink(p, cred) {
        return this._rpc('readlink', p, cred);
    }
    syncClose(method, fd) {
        return this._rpc('syncClose', method, fd);
    }
}
_a = WorkerFS;
WorkerFS.Name = 'WorkerFS';
WorkerFS.Create = CreateBackend.bind(_a);
WorkerFS.Options = {
    worker: {
        type: 'object',
        description: 'The target worker that you want to connect to, or the current worker if in a worker context.',
        validator(worker) {
            // Check for a `postMessage` function.
            if (typeof worker?.postMessage != 'function') {
                throw new ApiError(ErrorCode.EINVAL, 'option must be a Web Worker instance.');
            }
        },
    },
};
