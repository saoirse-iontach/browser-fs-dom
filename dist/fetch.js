/**
 * Contains utility methods for network I/O (using fetch)
 */
import { ApiError, ErrorCode } from '@browserfs/core/ApiError.js';
export const fetchIsAvailable = typeof fetch !== 'undefined' && fetch !== null;
/**
 * @hidden
 */
function convertError(e) {
    throw new ApiError(ErrorCode.EIO, e.message);
}
export async function fetchFile(p, type) {
    const response = await fetch(p).catch(convertError);
    if (!response.ok) {
        throw new ApiError(ErrorCode.EIO, `fetch error: response returned code ${response.status}`);
    }
    switch (type) {
        case 'buffer':
            const arrayBuffer = await response.arrayBuffer().catch(convertError);
            return new Uint8Array(arrayBuffer);
        case 'json':
            return response.json().catch(convertError);
        default:
            throw new ApiError(ErrorCode.EINVAL, 'Invalid download type: ' + type);
    }
}
/**
 * Asynchronously retrieves the size of the given file in bytes.
 * @hidden
 */
export async function fetchFileSize(p) {
    const response = await fetch(p, { method: 'HEAD' }).catch(convertError);
    if (!response.ok) {
        throw new ApiError(ErrorCode.EIO, `fetch HEAD error: response returned code ${response.status}`);
    }
    return parseInt(response.headers.get('Content-Length') || '-1', 10);
}
