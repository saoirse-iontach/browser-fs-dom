import { Cred } from '@browserfs/core/cred.js';
import { FileFlag, PreloadFile } from '@browserfs/core/file.js';
import { BaseFileSystem, FileSystemMetadata } from '@browserfs/core/filesystem.js';
import { Stats } from '@browserfs/core/stats.js';
import { type BackendOptions } from '@browserfs/core/backends/backend.js';
declare global {
    interface FileSystemDirectoryHandle {
        [Symbol.asyncIterator](): AsyncIterableIterator<[string, FileSystemHandle]>;
        entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
        keys(): AsyncIterableIterator<string>;
        values(): AsyncIterableIterator<FileSystemHandle>;
    }
}
interface FileSystemAccessFileSystemOptions {
    handle: FileSystemDirectoryHandle;
}
export declare class FileSystemAccessFile extends PreloadFile<FileSystemAccessFileSystem> {
    constructor(_fs: FileSystemAccessFileSystem, _path: string, _flag: FileFlag, _stat: Stats, contents?: Uint8Array);
    sync(): Promise<void>;
    close(): Promise<void>;
}
export declare class FileSystemAccessFileSystem extends BaseFileSystem {
    static readonly Name = "FileSystemAccess";
    static Create: any;
    static readonly Options: BackendOptions;
    static isAvailable(): boolean;
    private _handles;
    constructor({ handle }: FileSystemAccessFileSystemOptions);
    get metadata(): FileSystemMetadata;
    _sync(p: string, data: Uint8Array, stats: Stats, cred: Cred): Promise<void>;
    rename(oldPath: string, newPath: string, cred: Cred): Promise<void>;
    writeFile(fname: string, data: Uint8Array, flag: FileFlag, mode: number, cred: Cred): Promise<void>;
    createFile(p: string, flag: FileFlag, mode: number, cred: Cred): Promise<FileSystemAccessFile>;
    stat(path: string, cred: Cred): Promise<Stats>;
    exists(p: string, cred: Cred): Promise<boolean>;
    openFile(path: string, flags: FileFlag, cred: Cred): Promise<FileSystemAccessFile>;
    unlink(path: string, cred: Cred): Promise<void>;
    rmdir(path: string, cred: Cred): Promise<void>;
    mkdir(p: string, mode: number, cred: Cred): Promise<void>;
    readdir(path: string, cred: Cred): Promise<string[]>;
    private newFile;
    private getHandle;
}
export {};
