export async function preparePhoto(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("请选择 JPG、PNG 或 WebP 图片。");
  if (file.size > 20 * 1024 * 1024) throw new Error("原始照片不能超过 20 MB。");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#f3f0e9";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    // Re-encoding also strips original EXIF metadata and bounds GPU texture size.
    const data = canvas.toDataURL("image/jpeg", .9);
    if (data.length > 8 * 1024 * 1024) throw new Error("照片处理后过大，请选择较小的图片。");
    return data;
  } finally { bitmap.close(); }
}
