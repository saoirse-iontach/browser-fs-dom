/**
 * Contains utility methods for encode/decode binary to string
 */
/**
 * Encode binary to string
 * @param data8 any binary data
 * @returns an UTF16 string with extra data
 */
export declare function utf16Encode(data8: Uint8Array): string;
/**
 * Decode binary from sting
 * @param string an UTF16 string with extra data
 * @returns copy of the original binary data
 */
export declare function utf16Decode(string: string): Uint8Array;
