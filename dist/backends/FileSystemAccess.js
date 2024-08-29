var _a;
import { basename, dirname, join } from '@browserfs/core/emulation/path.js';
import { ApiError, ErrorCode } from '@browserfs/core/ApiError.js';
import { Cred } from '@browserfs/core/cred.js';
import { FileFlag, PreloadFile } from '@browserfs/core/file.js';
import { BaseFileSystem } from '@browserfs/core/filesystem.js';
import { Stats, FileType } from '@browserfs/core/stats.js';
import { CreateBackend } from '@browserfs/core/backends/backend.js';
const handleError = (path = '', error) => {
    if (error instanceof ApiError) {
        throw error;
    }
    if (error.name === 'NotFoundError') {
        throw ApiError.ENOENT(path);
    }
    if (error.name === 'TypeError') {
        throw ApiError.ENOENT(path);
    }
    if (error.name === 'NotAllowedError') {
        throw ApiError.EACCES(path);
    }
    if (error?.message) {
        throw new ApiError(ErrorCode.EIO, error.message, path);
    }
    else {
        throw ApiError.FileError(ErrorCode.EIO, path);
    }
};
const Array_fromAsync = async (asyncIterator) => {
    const array = [];
    for await (const value of asyncIterator)
        array.push(value);
    return array;
};
export class FileSystemAccessFile extends PreloadFile {
    constructor(_fs, _path, _flag, _stat, contents) {
        super(_fs, _path, _flag, _stat, contents);
    }
    async sync() {
        if (this.isDirty()) {
            await this._fs._sync(this.getPath(), this.getBuffer(), this.getStats(), Cred.Root);
            this.resetDirty();
        }
    }
    async close() {
        await this.sync();
    }
}
export class FileSystemAccessFileSystem extends BaseFileSystem {
    static isAvailable() {
        return typeof FileSystemHandle === 'function';
    }
    constructor({ handle }) {
        super();
        this._handles = new Map();
        this._ready = (async (handle, ready) => {
            handle = await handle;
            if (!(handle instanceof FileSystemDirectoryHandle))
                throw ApiError.ENOTDIR('/');
            try {
                await handle.keys().next();
            }
            catch (e) {
                handleError('/', e);
            }
            this._handles.set('/', handle);
            return ready;
        })(handle || navigator.storage.getDirectory(), this._ready);
    }
    get metadata() {
        return {
            ...super.metadata,
            name: _a.Name,
        };
    }
    async _sync(p, data, stats, cred) {
        const currentStats = await this.stat(p, cred);
        if (stats.mtime !== currentStats.mtime) {
            await this.writeFile(p, data, FileFlag.getFileFlag('w'), currentStats.mode, cred);
        }
    }
    async rename(oldPath, newPath, cred) {
        let path = oldPath;
        try {
            const handle = await this.getHandle(oldPath);
            const parentHandle = await this.getHandle(dirname(oldPath), { parent: true });
            if (handle instanceof FileSystemDirectoryHandle) {
                const files = await Array_fromAsync(handle.keys());
                await this.getHandle(newPath, { create: 'directory' });
                for (const file of files) {
                    // recursive
                    await this.rename(join(oldPath, file), join(newPath, file), cred);
                }
                if (!parentHandle.isSameEntry(handle)) {
                    await parentHandle.removeEntry(handle.name);
                }
            }
            if (handle instanceof FileSystemFileHandle) {
                const oldFile = await handle.getFile();
                const buffer = await oldFile.arrayBuffer();
                path = newPath;
                const newFile = await this.getHandle(newPath, { create: 'file' });
                const writable = await newFile.createWritable();
                await writable.write(buffer);
                (path = newPath), writable.close();
                (path = oldPath), await parentHandle.removeEntry(handle.name);
            }
        }
        catch (e) {
            handleError(path, e);
        }
    }
    async writeFile(fname, data, flag, mode, cred) {
        try {
            const file = await this.getHandle(fname, { create: 'file' });
            const writable = await file.createWritable();
            await writable.write(data);
            await writable.close();
        }
        catch (e) {
            handleError(fname, e);
        }
    }
    async createFile(p, flag, mode, cred) {
        await this.writeFile(p, new Uint8Array(), flag, mode, cred);
        return this.openFile(p, flag, cred);
    }
    async stat(path, cred) {
        try {
            const handle = await this.getHandle(path);
            if (handle instanceof FileSystemDirectoryHandle) {
                return new Stats(FileType.DIRECTORY, 4096);
            }
            if (handle instanceof FileSystemFileHandle) {
                const { lastModified, size } = await handle.getFile();
                return new Stats(FileType.FILE, size, undefined, undefined, lastModified);
            }
        }
        catch (e) {
            handleError(path, e);
        }
        return undefined;
    }
    async exists(p, cred) {
        try {
            await this.getHandle(p);
            return true;
        }
        catch (e) {
            if (e?.errno !== ErrorCode.ENOENT)
                throw e;
            return false;
        }
    }
    async openFile(path, flags, cred) {
        try {
            const handle = await this.getHandle(path);
            if (handle instanceof FileSystemFileHandle) {
                const file = await handle.getFile();
                const buffer = await file.arrayBuffer();
                return this.newFile(path, flags, buffer, file.size, file.lastModified);
            }
            else {
                throw ApiError.EISDIR(path);
            }
        }
        catch (e) {
            handleError(path, e);
        }
        return undefined;
    }
    async unlink(path, cred) {
        if (path === '/') {
            const files = await this.readdir(path, cred);
            for (const file of files) {
                await this.unlink('/' + file, cred);
            }
            return;
        }
        try {
            const handle = await this.getHandle(path);
            const parentHandle = await this.getHandle(dirname(path), { parent: true });
            await parentHandle.removeEntry(basename(path), { recursive: true });
        }
        catch (e) {
            if (e?.errno === ErrorCode.ENOENT)
                return;
            handleError(path, e);
        }
    }
    async rmdir(path, cred) {
        return this.unlink(path, cred);
    }
    async mkdir(p, mode, cred) {
        try {
            await this.getHandle(p);
            throw ApiError.EEXIST(p);
        }
        catch (e) {
            if (e?.errno !== ErrorCode.ENOENT)
                throw e;
        }
        await this.getHandle(p, { create: 'directory' });
    }
    async readdir(path, cred) {
        const handle = await this.getHandle(path);
        if (!(handle instanceof FileSystemDirectoryHandle)) {
            throw ApiError.ENOTDIR(path);
        }
        return await Array_fromAsync(handle.keys());
    }
    newFile(path, flag, data, size, lastModified) {
        return new FileSystemAccessFile(this, path, flag, new Stats(FileType.FILE, size || 0, undefined, undefined, lastModified || new Date().getTime()), new Uint8Array(data));
    }
    async getHandle(path, { create, parent } = {}) {
        try {
            const handle = this._handles.get(path);
            if (handle instanceof FileSystemFileHandle)
                await handle.getFile();
            if (handle instanceof FileSystemDirectoryHandle)
                parent || (await handle.keys().next());
            if (handle)
                return handle;
        }
        catch (e) { }
        var walkPath = '';
        try {
            var walkPath = dirname(path);
            let dirHandle = null;
            try {
                const handle = this._handles.get(walkPath);
                if (handle instanceof FileSystemDirectoryHandle) {
                    walkPath === '/' || (await handle.keys().next());
                    dirHandle = handle;
                }
            }
            catch (e) {
                if (e?.name === 'TypeMismatchError')
                    throw ApiError.ENOTDIR(walkPath);
            }
            if (!dirHandle) {
                const [, ...pathParts] = path.split('/');
                walkPath = '/';
                dirHandle = this._handles.get('/');
                for (const pathPart of pathParts) {
                    try {
                        walkPath = join(walkPath, pathPart);
                        dirHandle = await dirHandle.getDirectoryHandle(pathPart);
                        this._handles.set(walkPath, dirHandle);
                    }
                    catch (error) {
                        if (error?.name !== 'TypeMismatchError')
                            throw error;
                        this._handles.set(walkPath, await dirHandle.getFileHandle(pathPart));
                        throw ApiError.ENOTDIR(walkPath);
                    }
                }
            }
            const name = basename(path);
            var walkPath = path;
            let handle;
            try {
                handle = await dirHandle.getDirectoryHandle(name, { create: create === 'directory' });
            }
            catch (e) {
                const mismatch = e?.name === 'TypeMismatchError';
                const createFile = create && e?.name === 'NotFoundError';
                if (!(mismatch || createFile))
                    throw e;
                handle = await dirHandle.getFileHandle(name, { create: create === 'file' });
            }
            this._handles.set(walkPath, handle);
            const expect = parent ? 'directory' : create;
            if (expect && expect !== handle.kind) {
                if (parent)
                    throw ApiError.ENOTDIR(walkPath);
                if (handle.kind === 'directory')
                    throw ApiError.EISDIR(walkPath);
                /* if (handle.kind === 'file') */ throw ApiError.EEXIST(walkPath);
            }
            return handle;
        }
        catch (e) {
            handleError(walkPath, e);
            return undefined;
        }
    }
}
_a = FileSystemAccessFileSystem;
FileSystemAccessFileSystem.Name = 'FileSystemAccess';
FileSystemAccessFileSystem.Create = CreateBackend.bind(_a);
FileSystemAccessFileSystem.Options = {};
