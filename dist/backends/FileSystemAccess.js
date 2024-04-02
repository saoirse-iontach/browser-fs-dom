var _a;
import { basename, dirname, join } from '@browserfs/core/emulation/path.js';
import { ApiError, ErrorCode } from '@browserfs/core/ApiError.js';
import { Cred } from '@browserfs/core/cred.js';
import { FileFlag, PreloadFile } from '@browserfs/core/file.js';
import { BaseFileSystem } from '@browserfs/core/filesystem.js';
import { Stats, FileType } from '@browserfs/core/stats.js';
import { CreateBackend } from '@browserfs/core/backends/backend.js';
const handleError = (path = '', error) => {
    if (error.name === 'NotFoundError') {
        throw ApiError.ENOENT(path);
    }
    throw error;
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
        this._handles.set('/', handle);
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
        try {
            const handle = await this.getHandle(oldPath);
            if (handle instanceof FileSystemDirectoryHandle) {
                const files = await this.readdir(oldPath, cred);
                await this.mkdir(newPath, 'wx', cred);
                if (files.length === 0) {
                    await this.unlink(oldPath, cred);
                }
                else {
                    for (const file of files) {
                        await this.rename(join(oldPath, file), join(newPath, file), cred);
                        await this.unlink(oldPath, cred);
                    }
                }
            }
            if (handle instanceof FileSystemFileHandle) {
                const oldFile = await handle.getFile(), destFolder = await this.getHandle(dirname(newPath));
                if (destFolder instanceof FileSystemDirectoryHandle) {
                    const newFile = await destFolder.getFileHandle(basename(newPath), { create: true });
                    const writable = await newFile.createWritable();
                    const buffer = await oldFile.arrayBuffer();
                    await writable.write(buffer);
                    writable.close();
                    await this.unlink(oldPath, cred);
                }
            }
        }
        catch (err) {
            handleError(oldPath, err);
        }
    }
    async writeFile(fname, data, flag, mode, cred, createFile) {
        const handle = await this.getHandle(dirname(fname));
        if (handle instanceof FileSystemDirectoryHandle) {
            const file = await handle.getFileHandle(basename(fname), { create: true });
            const writable = await file.createWritable();
            await writable.write(data);
            await writable.close();
            //return createFile ? this.newFile(fname, flag, data) : undefined;
        }
    }
    async createFile(p, flag, mode, cred) {
        await this.writeFile(p, new Uint8Array(), flag, mode, cred, true);
        return this.openFile(p, flag, cred);
    }
    async stat(path, cred) {
        const handle = await this.getHandle(path);
        if (!handle) {
            throw ApiError.FileError(ErrorCode.EINVAL, path);
        }
        if (handle instanceof FileSystemDirectoryHandle) {
            return new Stats(FileType.DIRECTORY, 4096);
        }
        if (handle instanceof FileSystemFileHandle) {
            const { lastModified, size } = await handle.getFile();
            return new Stats(FileType.FILE, size, undefined, undefined, lastModified);
        }
    }
    async exists(p, cred) {
        try {
            await this.getHandle(p);
            return true;
        }
        catch (e) {
            return false;
        }
    }
    async openFile(path, flags, cred) {
        const handle = await this.getHandle(path);
        if (handle instanceof FileSystemFileHandle) {
            const file = await handle.getFile();
            const buffer = await file.arrayBuffer();
            return this.newFile(path, flags, buffer, file.size, file.lastModified);
        }
    }
    async unlink(path, cred) {
        const handle = await this.getHandle(dirname(path));
        if (handle instanceof FileSystemDirectoryHandle) {
            try {
                await handle.removeEntry(basename(path), { recursive: true });
            }
            catch (e) {
                handleError(path, e);
            }
        }
    }
    async rmdir(path, cred) {
        return this.unlink(path, cred);
    }
    async mkdir(p, mode, cred) {
        const overwrite = mode && mode.flag && mode.flag.includes('w') && !mode.flag.includes('x');
        const existingHandle = await this.getHandle(p);
        if (existingHandle && !overwrite) {
            throw ApiError.EEXIST(p);
        }
        const handle = await this.getHandle(dirname(p));
        if (handle instanceof FileSystemDirectoryHandle) {
            await handle.getDirectoryHandle(basename(p), { create: true });
        }
    }
    async readdir(path, cred) {
        const handle = await this.getHandle(path);
        if (!(handle instanceof FileSystemDirectoryHandle)) {
            throw ApiError.ENOTDIR(path);
        }
        const _keys = [];
        for await (const key of handle.keys()) {
            _keys.push(join(path, key));
        }
        return _keys;
    }
    newFile(path, flag, data, size, lastModified) {
        return new FileSystemAccessFile(this, path, flag, new Stats(FileType.FILE, size || 0, undefined, undefined, lastModified || new Date().getTime()), new Uint8Array(data));
    }
    async getHandle(path) {
        if (this._handles.has(path)) {
            return this._handles.get(path);
        }
        let walkedPath = '/';
        const [, ...pathParts] = path.split('/');
        const getHandleParts = async ([pathPart, ...remainingPathParts]) => {
            const walkingPath = join(walkedPath, pathPart);
            const continueWalk = (handle) => {
                walkedPath = walkingPath;
                this._handles.set(walkedPath, handle);
                if (remainingPathParts.length === 0) {
                    return this._handles.get(path);
                }
                getHandleParts(remainingPathParts);
            };
            const handle = this._handles.get(walkedPath);
            try {
                return await continueWalk(await handle.getDirectoryHandle(pathPart));
            }
            catch (error) {
                if (error.name === 'TypeMismatchError') {
                    try {
                        return await continueWalk(await handle.getFileHandle(pathPart));
                    }
                    catch (err) {
                        handleError(walkingPath, err);
                    }
                }
                else if (error.message === 'Name is not allowed.') {
                    throw new ApiError(ErrorCode.ENOENT, error.message, walkingPath);
                }
                else {
                    handleError(walkingPath, error);
                }
            }
        };
        await getHandleParts(pathParts);
    }
}
_a = FileSystemAccessFileSystem;
FileSystemAccessFileSystem.Name = 'FileSystemAccess';
FileSystemAccessFileSystem.Create = CreateBackend.bind(_a);
FileSystemAccessFileSystem.Options = {};
