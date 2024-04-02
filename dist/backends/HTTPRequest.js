var _a;
import { BaseFileSystem } from '@browserfs/core/filesystem.js';
import { ApiError, ErrorCode } from '@browserfs/core/ApiError.js';
import { ActionType, NoSyncFile } from '@browserfs/core/file.js';
import { Stats } from '@browserfs/core/stats.js';
import { fetchIsAvailable, fetchFile, fetchFileSize } from '../fetch.js';
import { FileIndex, isIndexFileInode, isIndexDirInode } from '@browserfs/core/FileIndex.js';
import { CreateBackend } from '@browserfs/core/backends/backend.js';
import { R_OK } from '@browserfs/core/emulation/constants.js';
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
export class HTTPRequest extends BaseFileSystem {
    static isAvailable() {
        return fetchIsAvailable;
    }
    constructor({ index, baseUrl = '' }) {
        super();
        if (!index) {
            index = 'index.json';
        }
        const indexRequest = typeof index == 'string' ? fetchFile(index, 'json') : Promise.resolve(index);
        this._ready = indexRequest.then(data => {
            this._index = FileIndex.fromListing(data);
            return this;
        });
        // prefix_url must end in a directory separator.
        if (baseUrl.length > 0 && baseUrl.charAt(baseUrl.length - 1) !== '/') {
            baseUrl = baseUrl + '/';
        }
        this.prefixUrl = baseUrl;
    }
    get metadata() {
        return {
            ...super.metadata,
            name: _a.Name,
            readonly: true,
        };
    }
    empty() {
        this._index.fileIterator(function (file) {
            file.fileData = null;
        });
    }
    /**
     * Special HTTPFS function: Preload the given file into the index.
     * @param path
     * @param buffer
     */
    preloadFile(path, buffer) {
        const inode = this._index.getInode(path);
        if (isIndexFileInode(inode)) {
            if (inode === null) {
                throw ApiError.ENOENT(path);
            }
            const stats = inode.getData();
            stats.size = buffer.length;
            stats.fileData = buffer;
        }
        else {
            throw ApiError.EISDIR(path);
        }
    }
    async stat(path, cred) {
        const inode = this._index.getInode(path);
        if (inode === null) {
            throw ApiError.ENOENT(path);
        }
        if (!inode.toStats().hasAccess(R_OK, cred)) {
            throw ApiError.EACCES(path);
        }
        let stats;
        if (isIndexFileInode(inode)) {
            stats = inode.getData();
            // At this point, a non-opened file will still have default stats from the listing.
            if (stats.size < 0) {
                stats.size = await this._requestFileSize(path);
            }
        }
        else if (isIndexDirInode(inode)) {
            stats = inode.getStats();
        }
        else {
            throw ApiError.FileError(ErrorCode.EINVAL, path);
        }
        return stats;
    }
    async open(path, flags, mode, cred) {
        // INVARIANT: You can't write to files on this file system.
        if (flags.isWriteable()) {
            throw new ApiError(ErrorCode.EPERM, path);
        }
        // Check if the path exists, and is a file.
        const inode = this._index.getInode(path);
        if (inode === null) {
            throw ApiError.ENOENT(path);
        }
        if (!inode.toStats().hasAccess(flags.getMode(), cred)) {
            throw ApiError.EACCES(path);
        }
        if (isIndexFileInode(inode) || isIndexDirInode(inode)) {
            switch (flags.pathExistsAction()) {
                case ActionType.THROW_EXCEPTION:
                case ActionType.TRUNCATE_FILE:
                    throw ApiError.EEXIST(path);
                case ActionType.NOP:
                    if (isIndexDirInode(inode)) {
                        const stats = inode.getStats();
                        return new NoSyncFile(this, path, flags, stats, stats.fileData || undefined);
                    }
                    const stats = inode.getData();
                    // Use existing file contents.
                    // XXX: Uh, this maintains the previously-used flag.
                    if (stats.fileData) {
                        return new NoSyncFile(this, path, flags, Stats.clone(stats), stats.fileData);
                    }
                    // @todo be lazier about actually requesting the file
                    const buffer = await this._requestFile(path, 'buffer');
                    // we don't initially have file sizes
                    stats.size = buffer.length;
                    stats.fileData = buffer;
                    return new NoSyncFile(this, path, flags, Stats.clone(stats), buffer);
                default:
                    throw new ApiError(ErrorCode.EINVAL, 'Invalid FileMode object.');
            }
        }
        else {
            throw ApiError.EPERM(path);
        }
    }
    async readdir(path, cred) {
        return this.readdirSync(path, cred);
    }
    /**
     * We have the entire file as a buffer; optimize readFile.
     */
    async readFile(fname, flag, cred) {
        // Get file.
        const fd = await this.open(fname, flag, 0o644, cred);
        try {
            return fd.getBuffer();
        }
        finally {
            await fd.close();
        }
    }
    _getHTTPPath(filePath) {
        if (filePath.charAt(0) === '/') {
            filePath = filePath.slice(1);
        }
        return this.prefixUrl + filePath;
    }
    _requestFile(p, type) {
        return fetchFile(this._getHTTPPath(p), type);
    }
    /**
     * Only requests the HEAD content, for the file size.
     */
    _requestFileSize(path) {
        return fetchFileSize(this._getHTTPPath(path));
    }
}
_a = HTTPRequest;
HTTPRequest.Name = 'HTTPRequest';
HTTPRequest.Create = CreateBackend.bind(_a);
HTTPRequest.Options = {
    index: {
        type: ['string', 'object'],
        optional: true,
        description: 'URL to a file index as a JSON file or the file index object itself, generated with the make_http_index script. Defaults to `index.json`.',
    },
    baseUrl: {
        type: 'string',
        optional: true,
        description: 'Used as the URL prefix for fetched files. Default: Fetch files relative to the index.',
    },
};
