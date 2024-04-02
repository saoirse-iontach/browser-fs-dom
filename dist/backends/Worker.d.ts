import { BaseFileSystem, FileSystemMetadata } from '@browserfs/core/filesystem.js';
import { File, FileFlag } from '@browserfs/core/file.js';
import { Stats } from '@browserfs/core/stats.js';
import { Cred } from '@browserfs/core/cred.js';
import { type BackendOptions } from '@browserfs/core/backends/backend.js';
export declare namespace WorkerFS {
    interface Options {
        /**
         * The target worker that you want to connect to, or the current worker if in a worker context.
         */
        worker: Worker;
    }
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
export declare class WorkerFS extends BaseFileSystem {
    static readonly Name = "WorkerFS";
    static Create: any;
    static readonly Options: BackendOptions;
    static isAvailable(): boolean;
    private _worker;
    private _currentID;
    private _requests;
    private _isInitialized;
    private _metadata;
    /**
     * Constructs a new WorkerFS instance that connects with BrowserFS running on
     * the specified worker.
     */
    constructor({ worker }: WorkerFS.Options);
    get metadata(): FileSystemMetadata;
    private _rpc;
    rename(oldPath: string, newPath: string, cred: Cred): Promise<void>;
    stat(p: string, cred: Cred): Promise<Stats>;
    open(p: string, flag: FileFlag, mode: number, cred: Cred): Promise<File>;
    unlink(p: string, cred: Cred): Promise<void>;
    rmdir(p: string, cred: Cred): Promise<void>;
    mkdir(p: string, mode: number, cred: Cred): Promise<void>;
    readdir(p: string, cred: Cred): Promise<string[]>;
    exists(p: string, cred: Cred): Promise<boolean>;
    realpath(p: string, cred: Cred): Promise<string>;
    truncate(p: string, len: number, cred: Cred): Promise<void>;
    readFile(fname: string, flag: FileFlag, cred: Cred): Promise<Uint8Array>;
    writeFile(fname: string, data: Uint8Array, flag: FileFlag, mode: number, cred: Cred): Promise<void>;
    appendFile(fname: string, data: Uint8Array, flag: FileFlag, mode: number, cred: Cred): Promise<void>;
    chmod(p: string, mode: number, cred: Cred): Promise<void>;
    chown(p: string, new_uid: number, new_gid: number, cred: Cred): Promise<void>;
    utimes(p: string, atime: Date, mtime: Date, cred: Cred): Promise<void>;
    link(srcpath: string, dstpath: string, cred: Cred): Promise<void>;
    symlink(srcpath: string, dstpath: string, type: string, cred: Cred): Promise<void>;
    readlink(p: string, cred: Cred): Promise<string>;
    syncClose(method: string, fd: File): Promise<void>;
}
