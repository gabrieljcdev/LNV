// A Discogs tracklist also carries HEADING rows ("SS026", "SS027" … the
// sub-releases of a box set, "Disc 1"): no position, nothing to play. They
// were being listed as tracks and each cost a 100-unit YouTube search
// (7 Oct, Theo Parrish - Sound Sculptures Volume 1: 3 of 5 searches).
// A release whose rows ALL lack positions keeps them (some singles).
export const isHeadingRow = (t, list) => !t?.position && (list || []).some(x => x?.position)
export const withoutHeadings = list => (list || []).filter(t => !isHeadingRow(t, list))
