// Right-sized covers (2026-10-22). A picture is decoded at the size it is DOWNLOADED, not the size it is shown: a 1200 x 1200 Bandcamp cover
// shown in a 330 px slot costs 5.5 MB of memory to decode, where the 350 px rendition costs 0.5 MB. Measured on the live feed: the first 80 images
// decoded to about 110 MB at their natural size, against about 19 MB at the size they are displayed (5.8x). Bandcamp serves every picture in fixed
// sizes by changing the number before the extension (checked against a real cover): 3 = 100 px, 7 = 150, 9 = 210, 4 = 300, 2 = 350, 5 = 700, 10 = 1200.
// (Discogs covers come as signed URLs with no other size to ask for, so they are left alone.)
const BANDCAMP_ART = /^(https:\/\/f4\.bcbits\.com\/img\/a\d+)_\d+\.(jpg|png)$/
const SIZES = [[100, 3], [150, 7], [210, 9], [300, 4], [350, 2], [700, 5]]

// The smallest rendition that still covers a slot of `cssPx` on this screen (a 2x screen asks for twice the pixels, capped at 2x).
export function rightSizedCover(url, cssPx = 330) {
  if (!url || typeof url !== 'string') return url
  const m = url.match(BANDCAMP_ART)
  if (!m) return url
  const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1
  const want = Math.max(1, cssPx) * dpr
  const [, n] = SIZES.find(([px]) => px >= want) || SIZES[SIZES.length - 1]
  return `${m[1]}_${n}.${m[2]}`
}
