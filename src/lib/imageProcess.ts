import { CFG } from '@/config';

export function isPdf(file: File) {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

export function isImage(file: File) {
  return /^image\/(jpeg|png|webp)$/i.test(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);
}

/** Client-side 10MB guard — runs before any network call. */
export function checkSize(file: File): string | null {
  if (file.size > CFG.MAX_UPLOAD_BYTES) return '檔案超過 10MB，請壓縮後再上傳。';
  return null;
}

async function loadBitmap(source: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(source);
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(source);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('圖片讀取失敗'));
      img.src = url;
    });
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

/** Draw a canvas/source down to maxW and encode WebP. */
export async function canvasToWebp(
  src: CanvasImageSource,
  srcW: number,
  srcH: number,
  maxW = CFG.IMAGE_MAX_WIDTH,
  q = CFG.IMAGE_QUALITY,
): Promise<Blob> {
  const ratio = Math.min(1, maxW / srcW);
  const w = Math.max(1, Math.round(srcW * ratio));
  const h = Math.max(1, Math.round(srcH * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('瀏覽器不支援 Canvas');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', q));
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) throw new Error('WebP 轉換失敗');
  return blob;
}

/** JPG/PNG -> WebP, downscaled to CFG.IMAGE_MAX_WIDTH. */
export async function fileToWebp(
  file: Blob,
  maxW = CFG.IMAGE_MAX_WIDTH,
  q = CFG.IMAGE_QUALITY,
): Promise<Blob> {
  const bmp = await loadBitmap(file);
  const w = 'width' in bmp ? bmp.width : 0;
  const h = 'height' in bmp ? bmp.height : 0;
  try {
    return await canvasToWebp(bmp, w, h, maxW, q);
  } finally {
    if ('close' in bmp && typeof bmp.close === 'function') bmp.close();
  }
}
