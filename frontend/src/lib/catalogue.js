// Catalogue rows, shared by the spotlight list (Feed.jsx) and the artist /
// label drawers' discography (Drawers.jsx) — gabriel, 2026-10-02, mockup E:
// a type tag from the Discogs format, a role pill on artist catalogues, and
// a cleaned-up label name.

// Discogs format string ("2xVinyl, LP, Album") -> one short type tag.
export function releaseTag(format = '', title = '') {
  if (/CD-ROM/i.test(format) || /\bOST\b|soundtrack/i.test(title)) return 'OST'
  if (/Comp/i.test(format)) return 'Comp'
  if (/Mixed|Mixtape/i.test(format)) return 'Mix'
  if (/Album|\bLP\b/i.test(format)) return 'LP'
  if (/\bEP\b/i.test(format)) return 'EP'
  if (/Single/i.test(format)) return 'Single'
  const vinyl = format.match(/(12|10|7)"/)
  if (vinyl) return vinyl[0]
  const files = Number(format.match(/(\d+)xFile/)?.[1])
  if (files) return files <= 3 ? 'Single' : files <= 7 ? 'EP' : 'LP'
  return format.split(/[,+]/)[0].trim() || '—'
}

// Discogs artist role -> which part of the catalogue it is. A shared role
// ("Remix, Appearance") goes by its first part.
export const ROLE_PILL = { main: 'Own', remix: 'Remix', prod: 'Producer', guest: 'Guest' }
export function roleGroup(role = '') {
  const first = role.split(',')[0].trim()
  if (!first || first === 'Main') return 'main'
  if (/Remix/i.test(first)) return 'remix'
  if (/Producer/i.test(first)) return 'prod'
  return 'guest'
}

// "Not On Label (X Self-released)" -> "Self-released"; drops Discogs'
// "(2)" suffixes and repeated names ("A&G Productions, A&G Productions").
export function cleanLabelName(label = '') {
  if (/^Not On Label/i.test(label)) return 'Self-released'
  return [...new Set(label.split(',').map(s => s.replace(/\s*\(\d+\)$/, '').trim()).filter(Boolean))].slice(0, 2).join(', ')
}
