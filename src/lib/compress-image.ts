/**
 * Compress and resize an image in the browser.
 * Max ~1600px long edge, JPEG quality ~0.8. Returns base64 (no data: prefix)
 * and a data URL for display. Throws if the result exceeds ~150 KB.
 */
export async function compressImage(file: File): Promise<{
  base64: string;
  dataUrl: string;
  bytes: number;
}> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process image");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  let quality = 0.8;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  // Shrink quality until under ~150 KB.
  while (dataUrl.length > 200_000 && quality > 0.3) {
    quality -= 0.1;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  if (dataUrl.length > 200_000) {
    throw new Error("Image is too large even after compression");
  }
  const base64 = dataUrl.split(",")[1] ?? "";
  return { base64, dataUrl, bytes: Math.round((base64.length * 3) / 4) };
}
