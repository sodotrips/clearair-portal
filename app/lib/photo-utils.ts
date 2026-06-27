// Shared photo utilities — HEIC conversion, compression, types

export interface PhotoItem {
  id: string;
  dataUrl: string;
  name: string;
}

export function isHeicOrUnknown(file: File): boolean {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return type === 'image/heic' || type === 'image/heif' || type === '' || name.endsWith('.heic') || name.endsWith('.heif');
}

export async function convertViaServer(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/photos/convert', { method: 'POST', body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Server conversion failed');
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export function compressViaCanvas(objectUrl: string, maxDim: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height / width) * maxDim);
          width = maxDim;
        } else {
          width = Math.round((width / height) * maxDim);
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas context failed'));
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Image decode failed'));
    img.src = objectUrl;
  });
}

export async function fileToCompressedJpeg(file: File, maxDim: number = 1000, quality: number = 0.65): Promise<string> {
  if (isHeicOrUnknown(file)) {
    const jpegUrl = await convertViaServer(file);
    try {
      return await compressViaCanvas(jpegUrl, maxDim, quality);
    } finally {
      URL.revokeObjectURL(jpegUrl);
    }
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    return await compressViaCanvas(objectUrl, maxDim, quality);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
