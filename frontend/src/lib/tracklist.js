// A Discogs tracklist also carries HEADING rows ("SS026", "SS027" … the
// sub-releases of a box set, "Disc 1"): no position, nothing to play. They
// were being listed as tracks and each cost a 100-unit YouTube search
// (7 Oct, Theo Parrish - Sound Sculptures Volume 1: 3 of 5 searches).
// A release whose rows ALL lack positions keeps them (some singles).
export const isHeadingRow = (t, list) => !t?.position && (list || []).some(x => x?.position)
export const withoutHeadings = list => (list || []).filter(t => !isHeadingRow(t, list))

// The key a track's saved link goes under (release_track_links.position).
// Positions repeat in box sets — Sound Sculptures Volume 1 has A1 three times
// — and links saved by plain position overwrote each other. The FIRST track
// at a position keeps it as is (so everything already saved stays valid); a
// repeat gets "A1~2", "A1~3". backend/routes/discogs.js has the same rule.
export const linkKeys = list => {
  const seen = {}
  return (list || []).map(t => {
    const p = t?.position || ''
    if (!p) return ''
    seen[p] = (seen[p] || 0) + 1
    return seen[p] === 1 ? p : `${p}~${seen[p]}`
  })
}
