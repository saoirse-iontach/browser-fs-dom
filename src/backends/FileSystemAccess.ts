import { basename, dirname, join } from '@browserfs/core/emulation/path.js';
import { ApiError, ErrorCode } from '@browserfs/core/ApiError.js';
import { Cred } from '@browserfs/core/cred.js';
import { FileFlag, PreloadFile } from '@browserfs/core/file.js';
import { BaseFileSystem, FileSystemMetadata } from '@browserfs/core/filesystem.js';
import { Stats, FileType } from '@browserfs/core/stats.js';
import { CreateBackend, type BackendOptions } from '@browserfs/core/backends/backend.js';

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

const handleError = (path: string = '', error: any) => {
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
	} else {
		throw ApiError.FileError(ErrorCode.EIO, path);
	}
};

const Array_fromAsync = async <T extends unknown>(asyncIterator: AsyncIterableIterator<T>) => {
	const array: T[] = [];
	for await (const value of asyncIterator) array.push(value);
	return array;
};

export class FileSystemAccessFile extends PreloadFile<FileSystemAccessFileSystem> {
	constructor(_fs: FileSystemAccessFileSystem, _path: string, _flag: FileFlag, _stat: Stats, contents?: Uint8Array) {
		super(_fs, _path, _flag, _stat, contents);
	}

	public async sync(): Promise<void> {
		if (this.isDirty()) {
			await this._fs._sync(this.getPath(), this.getBuffer(), this.getStats(), Cred.Root);
			this.resetDirty();
		}
	}

	public async close(): Promise<void> {
		await this.sync();
	}
}

export class FileSystemAccessFileSystem extends BaseFileSystem {
	public static readonly Name = 'FileSystemAccess';

	public static Create = CreateBackend.bind(this);

	public static readonly Options: BackendOptions = {};

	public static isAvailable(): boolean {
		return typeof FileSystemHandle === 'function';
	}

	private _handles: Map<string, FileSystemHandle> = new Map();

	public constructor({ handle }: FileSystemAccessFileSystemOptions) {
		super();

		this._ready = (async (handle, ready) => {
			handle = await handle;
			if (!(handle instanceof FileSystemDirectoryHandle)) throw ApiError.ENOTDIR('/');
			try {
				await handle.keys().next();
			} catch (e) {
				handleError('/', e);
			}
			this._handles.set('/', handle);
			return ready;
		})(handle || navigator.storage.getDirectory(), this._ready);
	}

	public get metadata(): FileSystemMetadata {
		return {
			...super.metadata,
			name: FileSystemAccessFileSystem.Name,
		};
	}

	public async _sync(p: string, data: Uint8Array, stats: Stats, cred: Cred): Promise<void> {
		const currentStats = await this.stat(p, cred);
		if (stats.mtime !== currentStats!.mtime) {
			await this.writeFile(p, data, FileFlag.getFileFlag('w'), currentStats!.mode, cred);
		}
	}

	public async rename(oldPath: string, newPath: string, cred: Cred): Promise<void> {
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
		} catch (e) {
			handleError(path, e);
		}
	}

	public async writeFile(fname: string, data: Uint8Array, flag: FileFlag, mode: number, cred: Cred): Promise<void> {
		try {
			const file = await this.getHandle(fname, { create: 'file' });
			const writable = await file.createWritable();
			await writable.write(data);
			await writable.close();
		} catch (e) {
			handleError(fname, e);
		}
	}

	public async createFile(p: string, flag: FileFlag, mode: number, cred: Cred): Promise<FileSystemAccessFile> {
		await this.writeFile(p, new Uint8Array(), flag, mode, cred);
		return this.openFile(p, flag, cred);
	}

	public async stat(path: string, cred: Cred): Promise<Stats> {
		try {
			const handle = await this.getHandle(path);
			if (handle instanceof FileSystemDirectoryHandle) {
				return new Stats(FileType.DIRECTORY, 4096);
			}
			if (handle instanceof FileSystemFileHandle) {
				const { lastModified, size } = await handle.getFile();
				return new Stats(FileType.FILE, size, undefined, undefined, lastModified);
			}
		} catch (e) {
			handleError(path, e);
		}
		return undefined as never;
	}

	public async exists(p: string, cred: Cred): Promise<boolean> {
		try {
			await this.getHandle(p);
			return true;
		} catch (e: any) {
			if (e?.errno !== ErrorCode.ENOENT) throw e;
			return false;
		}
	}

	public async openFile(path: string, flags: FileFlag, cred: Cred): Promise<FileSystemAccessFile> {
		try {
			const handle = await this.getHandle(path);
			if (handle instanceof FileSystemFileHandle) {
				const file = await handle.getFile();
				const buffer = await file.arrayBuffer();
				return this.newFile(path, flags, buffer, file.size, file.lastModified);
			} else {
				throw ApiError.EISDIR(path);
			}
		} catch (e) {
			handleError(path, e);
		}
		return undefined as never;
	}

	public async unlink(path: string, cred: Cred): Promise<void> {
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
		} catch (e: any) {
			if (e?.errno === ErrorCode.ENOENT) return;
			handleError(path, e);
		}
	}

	public async rmdir(path: string, cred: Cred): Promise<void> {
		return this.unlink(path, cred);
	}

	public async mkdir(p: string, mode: number, cred: Cred): Promise<void> {
		try {
			await this.getHandle(p);
			throw ApiError.EEXIST(p);
		} catch (e: any) {
			if (e?.errno !== ErrorCode.ENOENT) throw e;
		}

		await this.getHandle(p, { create: 'directory' });
	}

	public async readdir(path: string, cred: Cred): Promise<string[]> {
		const handle = await this.getHandle(path);
		if (!(handle instanceof FileSystemDirectoryHandle)) {
			throw ApiError.ENOTDIR(path);
		}
		return await Array_fromAsync(handle.keys());
	}

	private newFile(path: string, flag: FileFlag, data: ArrayBuffer, size?: number, lastModified?: number): FileSystemAccessFile {
		return new FileSystemAccessFile(this, path, flag, new Stats(FileType.FILE, size || 0, undefined, undefined, lastModified || new Date().getTime()), new Uint8Array(data));
	}

	private async getHandle(path: string): Promise<FileSystemHandle>;
	private async getHandle(path: string, opt: { create: 'file' }): Promise<FileSystemFileHandle>;
	private async getHandle(path: string, opt: { create: 'directory' }): Promise<FileSystemDirectoryHandle>;
	private async getHandle(path: string, opt: { parent: true }): Promise<FileSystemDirectoryHandle>;

	private async getHandle(path: string, { create, parent }: any = {}): Promise<FileSystemHandle> {
		try {
			const handle = this._handles.get(path);
			if (handle instanceof FileSystemFileHandle) await handle.getFile();
			if (handle instanceof FileSystemDirectoryHandle) parent || (await handle.keys().next());
			if (handle) return handle;
		} catch (e) {}

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
			} catch (e: any) {
				if (e?.name === 'TypeMismatchError') throw ApiError.ENOTDIR(walkPath);
			}
			if (!dirHandle) {
				const [, ...pathParts] = path.split('/');

				walkPath = '/';
				dirHandle = this._handles.get('/') as FileSystemDirectoryHandle;

				for (const pathPart of pathParts) {
					try {
						walkPath = join(walkPath, pathPart);
						dirHandle = await dirHandle.getDirectoryHandle(pathPart);
						this._handles.set(walkPath, dirHandle);
					} catch (error: any) {
						if (error?.name !== 'TypeMismatchError') throw error;
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
			} catch (e: any) {
				const mismatch = e?.name === 'TypeMismatchError';
				const createFile = create && e?.name === 'NotFoundError';
				if (!(mismatch || createFile)) throw e;
				handle = await dirHandle.getFileHandle(name, { create: create === 'file' });
			}
			this._handles.set(walkPath, handle);

			const expect = parent ? 'directory' : create;
			if (expect && expect !== handle.kind) {
				if (parent) throw ApiError.ENOTDIR(walkPath);
				if (handle.kind === 'directory') throw ApiError.EISDIR(walkPath);
				/* if (handle.kind === 'file') */ throw ApiError.EEXIST(walkPath);
			}
			return handle;
		} catch (e) {
			handleError(walkPath, e);
			return undefined as never;
		}
	}
}
