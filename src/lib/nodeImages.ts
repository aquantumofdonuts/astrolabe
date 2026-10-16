/** Portable, bounded image assets: catalogs never depend on temporary blob URLs. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
export const MAX_IMAGE_DATA_LENGTH = 128 * 1024
export const MAX_CATALOG_BYTES = 28 * 1024 * 1024
export const NODE_IMAGE_ACCEPT =
  '.png,.jpg,.jpeg,.webp,.gif,.avif,.bmp,.ico,image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp,image/x-icon,image/vnd.microsoft.icon'

export function validateNodeImage(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || value.length > MAX_IMAGE_DATA_LENGTH)
    throw new Error(
      'Node images must be normalized thumbnails under 128 KB. Upload the image in Catalog studio.'
    )
  const match = /^data:image\/(webp|png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value)
  if (!match || match[2].length % 4 !== 0)
    throw new Error(
      'Node images must be embedded PNG, JPEG, or WebP thumbnails. Upload the image in Catalog studio.'
    )
  // Check the container signature as well as the declared type. Decoding failures fall back in-scene.
  let header: string
  try {
    header = atob(match[2].slice(0, 32))
  } catch {
    throw new Error('The node image is not valid base64.')
  }
  const valid =
    match[1] === 'png'
      ? header.startsWith('\x89PNG\r\n\x1a\n')
      : match[1] === 'jpeg'
        ? header.startsWith('\xff\xd8\xff')
        : header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP'
  if (!valid) throw new Error('The node image does not match its declared image type.')
  return value
}

async function decode(
  file: File
): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  try {
    // First frame for animated inputs; applies EXIF orientation before resampling.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    }
  } catch {
    // ICO decoding and browsers without ImageBitmap support use the image decoder.
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.src = url
    try {
      await image.decode()
      return {
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        close: () => URL.revokeObjectURL(url),
      }
    } catch {
      URL.revokeObjectURL(url)
      throw new Error('This image could not be read. Try a PNG, JPEG, or WebP image.')
    }
  }
}

export async function normalizeNodeImage(file: File): Promise<string> {
  if (!file.size || file.size > MAX_UPLOAD_BYTES)
    throw new Error('Choose an image between 1 byte and 10 MB.')
  const types = [
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/avif',
    'image/bmp',
    'image/x-ms-bmp',
    'image/x-icon',
    'image/vnd.microsoft.icon',
  ]
  if (
    file.type
      ? !types.includes(file.type.toLowerCase())
      : !/\.(png|jpe?g|webp|gif|avif|bmp|ico)$/i.test(file.name)
  )
    throw new Error('Choose a PNG, JPEG, WebP, GIF, AVIF, BMP, or ICO image.')
  const decoded = await decode(file)
  try {
    if (
      !decoded.width ||
      !decoded.height ||
      Math.max(decoded.width, decoded.height) > 8192 ||
      decoded.width * decoded.height > 32_000_000
    )
      throw new Error('Choose an image up to 8192 pixels per side and 32 megapixels.')
    const canvas = document.createElement('canvas')
    // Contain instead of crop: marks and wordmarks keep every edge. Flatten transparency
    // against the globe's dark surface; a quiet border also hides the wrapping seam.
    for (const size of [512, 384, 256]) {
      canvas.width = canvas.height = size
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Image processing is unavailable in this browser.')
      context.fillStyle = '#142733'
      context.fillRect(0, 0, size, size)
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      const scale = (size * 0.88) / Math.max(decoded.width, decoded.height)
      const width = decoded.width * scale,
        height = decoded.height * scale
      context.drawImage(decoded.source, (size - width) / 2, (size - height) / 2, width, height)
      for (const quality of [0.86, 0.72, 0.56]) {
        let data = canvas.toDataURL('image/webp', quality)
        if (!data.startsWith('data:image/webp;')) data = canvas.toDataURL('image/jpeg', quality)
        if (data.length <= MAX_IMAGE_DATA_LENGTH) return validateNodeImage(data)!
      }
    }
    throw new Error(
      'This image is too detailed to store as a thumbnail. Try a smaller or simpler image.'
    )
  } finally {
    decoded.close()
  }
}
