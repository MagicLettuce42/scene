// Photos are private, small JPEG thumbnails in the account-scoped library.
export const MAX_PHOTO_INPUT_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTO_DATA_LENGTH = 100000;
export const PHOTO_SIZE = 256;
export function validPhotoInput(file: { type: string; size: number }) {
  return ["image/jpeg", "image/png", "image/webp"].includes(file.type) && file.size > 0 && file.size <= MAX_PHOTO_INPUT_BYTES;
}
export function validProfilePhoto(value: unknown): value is string {
  if (typeof value !== "string" || value.length > MAX_PHOTO_DATA_LENGTH || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  try {
    const encoded = value.slice(23);
    if (encoded.length % 4 !== 0) return false;
    const bytes = atob(encoded);
    const byte = (n: number) => bytes.charCodeAt(n);
    if (bytes.length < 24 || byte(0) !== 255 || byte(1) !== 216 || byte(bytes.length - 2) !== 255 || byte(bytes.length - 1) !== 217) return false;
    let p = 2;
    while (p + 4 < bytes.length) {
      if (byte(p++) !== 255) return false;
      while (byte(p) === 255) p++;
      const marker = byte(p++);
      if (marker === 218 || marker === 217) return false;
      const length = byte(p) * 256 + byte(p + 1);
      if (length < 2 || p + length > bytes.length) return false;
      if ([192, 193, 194].includes(marker)) {
        if (length < 8) return false;
        const height = byte(p + 3) * 256 + byte(p + 4), width = byte(p + 5) * 256 + byte(p + 6);
        return byte(p + 2) === 8 && width > 0 && height > 0 && width <= PHOTO_SIZE && height <= PHOTO_SIZE;
      }
      p += length;
    }
  } catch {}
  return false;
}
export async function prepareProfilePhoto(file: File): Promise<string> {
  if (!validPhotoInput(file)) throw Error("Choose a JPG, PNG or WebP photo up to 5 MB.");
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(Error("This photo could not be read. Try another image."));
    reader.onabort = () => reject(Error("Photo selection was cancelled."));
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result) : reject(Error("This photo could not be read."));
    reader.readAsDataURL(file);
  });
  // Production CSP permits data: images, not blob: URLs.
    const image = new Image();
    image.src = source;
    await image.decode().catch(() => { throw Error("This photo could not be opened. Try a different JPG, PNG or WebP image."); });
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40000000)
      throw Error("This photo is too large to process. Choose a smaller image.");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = PHOTO_SIZE;
    const context = canvas.getContext("2d");
    if (!context) throw Error("Photo editing is unavailable in this browser.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE);
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
    for (const quality of [0.86, 0.7, 0.5]) {
      const thumbnail = canvas.toDataURL("image/jpeg", quality);
      if (validProfilePhoto(thumbnail)) return thumbnail;
    }
    throw Error("This photo could not be made small enough. Try another image.");
}
