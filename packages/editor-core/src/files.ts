const supportedExtensions = new Set(['jpg', 'jpeg', 'png', 'tif', 'tiff', 'pdf']);

export function isSupportedImageFile(file: File): boolean {
  const extension = getFileExtension(file.name);
  return supportedExtensions.has(extension) || file.type.startsWith('image/') || file.type === 'application/pdf';
}

export function getFileExtension(fileName: string): string {
  const segments = fileName.toLowerCase().split('.');
  return segments.length > 1 ? segments.at(-1) ?? '' : '';
}

export function getAcceptAttribute(): string {
  return '.jpg,.jpeg,.png,.tif,.tiff,.pdf,image/jpeg,image/png,image/tiff,application/pdf';
}

export function isPdfFile(fileName: string, mimeType: string): boolean {
  const extension = getFileExtension(fileName);
  return extension === 'pdf' || mimeType === 'application/pdf';
}

export function isTiffFile(fileName: string, mimeType: string): boolean {
  const extension = getFileExtension(fileName);
  return extension === 'tif' || extension === 'tiff' || mimeType === 'image/tiff';
}
