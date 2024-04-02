import { BaseFileSystem, FileSystemMetadata } from '@browserfs/core/filesystem.js';
import { FileFlag, NoSyncFile } from '@browserfs/core/file.js';
import { Stats } from '@browserfs/core/stats.js';
import { Cred } from '@browserfs/core/cred.js';
import { type BackendOptions } from '@browserfs/core/backends/backend.js';
export interface HTTPRequestIndex {
    [key: string]: string;
}
export declare namespace HTTPRequest {
    /**
     * Configuration options for a HTTPRequest file system.
     */
    interface Options {
        /**
         * URL to a file index as a JSON file or the file index object itself, generated with the make_http_index script.
         * Defaults to `index.json`.
         */
        index?: string | HTTPRequestIndex;
        /** Used as the URL prefix for fetched files.
         * Default: Fetch files relative to the index.
         */
        baseUrl?: string;
    }
}
/**
 * A simple filesystem backed by HTTP downloads. You must create a directory listing using the
 * `make_http_index` tool provided by BrowserFS.
 *
 * If you install BrowserFS globally with `npm i -g browserfs`, you can generate a listing by
 * running `make_http_index` in your terminal in the directory you would like to index:
 *
 * ```
 * make_http_index > index.json
 * ```
 *
 * Listings objects look like the following:
 *
 * ```json
 * {
 *   "home": {
 *     "jvilk": {
 *       "someFile.txt": null,
 *       "someDir": {
 *         // Empty directory
 *       }
 *     }
 *   }
 * }
 * ```
 *
 * *This example has the folder `/home/jvilk` with subfile `someFile.txt` and subfolder `someDir`.*
 */
export declare class HTTPRequest extends BaseFileSystem {
    static readonly Name = "HTTPRequest";
    static Create: any;
    static readonly Options: BackendOptions;
    static isAvailable(): boolean;
    readonly prefixUrl: string;
    private _index;
    constructor({ index, baseUrl }: HTTPRequest.Options);
    get metadata(): FileSystemMetadata;
    empty(): void;
    /**
     * Special HTTPFS function: Preload the given file into the index.
     * @param path
     * @param buffer
     */
    preloadFile(path: string, buffer: Uint8Array): void;
    stat(path: string, cred: Cred): Promise<Stats>;
    open(path: string, flags: FileFlag, mode: number, cred: Cred): Promise<NoSyncFile<this>>;
    readdir(path: string, cred: Cred): Promise<string[]>;
    /**
     * We have the entire file as a buffer; optimize readFile.
     */
    readFile(fname: string, flag: FileFlag, cred: Cred): Promise<Uint8Array>;
    private _getHTTPPath;
    /**
     * Asynchronously download the given file.
     */
    private _requestFile;
    /**
     * Only requests the HEAD content, for the file size.
     */
    private _requestFileSize;
}
