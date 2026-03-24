declare module 'utif' {
  export function decode(buffer: ArrayBuffer): any[];
  export function decodeImages(buffer: ArrayBuffer, ifds: any[]): void;
  export function toRGBA8(ifd: any): Uint8Array;
  export function encodeImage(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number, metadata?: Record<string, unknown>): ArrayBuffer | Uint8Array;
}
