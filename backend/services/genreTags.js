// Tags → genres (2026-10-06). One filter for every source of free-form tags:
// Bandcamp's tag list, SoundCloud's genre + tags, Last.fm's listener tags.
// Keeps the precise ones ("dub techno", "broken beat") and drops what isn't a
// genre: places, moods, promo words, catalogue numbers, the artist's or
// label's own name.

const NOT_GENRES = new RegExp('^(?:' + [
  'seen live', 'favou?rites?', 'my .*', 'albums? i own', 'beautiful', 'awesome', 'love', 'best.*', 'amazing', 'cool',
  'chill(?:ed)?', 'under \\d+.*', '\\d{2,4}s?', 'male vocalists?', 'female vocalists?', 'vocal', 'instrumental',
  'free(?: download| dl)?', 'free ?download', 'premiere', 'exclusive', 'repost', 'new', 'original mix', 'remix(?:es)?',
  'vinyl', 'digital', 'cassette', 'ep', 'lp', 'album', 'single', 'mix', 'dj ?mix', 'live', 'podcast', 'radio', 'music',
  'electronica?', 'dance', 'club', 'underground', 'unreleased', 'demo', 'bootleg', 'edit', 'rework', 'label',
  'british', 'uk', 'usa?', 'us', 'american', 'german', 'french', 'japanese', 'italian', 'dutch', 'belgian', 'swedish',
  'norwegian', 'finnish', 'danish', 'russian', 'brazilian', 'nigerian', 'jamaican', 'cuban', 'canadian', 'australian',
  'south african', 'japan', 'germany', 'france', 'italy', 'spain', 'brazil', 'nigeria', 'ghana', 'canada', 'australia',
  'netherlands', 'belgium', 'sweden', 'norway', 'finland', 'russia', 'south africa', 'jamaica', 'cuba', 'portugal',
  'london', 'manchester', 'bristol', 'glasgow', 'leeds', 'detroit', 'chicago', 'new york', 'nyc', 'los angeles', 'la',
  'berlin', 'paris', 'tokyo', 'osaka', 'amsterdam', 'lisbon', 'barcelona', 'madrid', 'milan', 'rome', 'naples',
  'vienna', 'zurich', 'brussels', 'copenhagen', 'stockholm', 'oslo', 'helsinki', 'moscow', 'kyiv', 'tbilisi',
  'montreal', 'toronto', 'melbourne', 'sydney', 'lagos', 'johannesburg', 'kingston', 'sao paulo', 'rio de janeiro',
].join('|') + ')$', 'i');

const tidy = t => t.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim()
  .replace(/\b\w/g, c => c.toUpperCase()).replace(/\b(And|N|Of|The)\b/g, w => w.toLowerCase())
  .replace(/^./, c => c.toUpperCase()).replace(/\bDnb\b/i, 'Drum & Bass').replace(/\bIdm\b/i, 'IDM').replace(/\bR&b\b/i, 'R&B').replace(/\bUk\b/g, 'UK');
const key = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

// tags: strings, most important first. exclude: names that mustn't count as
// genres (the artist, the uploader, the label). Returns up to `max`.
export function genresFromTags(tags = [], { exclude = [], max = 5 } = {}) {
  const banned = new Set(exclude.filter(Boolean).map(key));
  const out = [];
  for (const raw of tags) {
    const t = String(raw || '').trim();
    if (!t || t.length > 30 || t.length < 3) continue;
    if (NOT_GENRES.test(t) || /\d/.test(t) || /^#/.test(t) || /https?:|www\./i.test(t)) continue;
    if (/\b(?:records|recordings|recs|tapes|imprint|label|music group|productions)\b/i.test(t)) continue; // a label, not a genre
    if (banned.has(key(t))) continue;
    const g = tidy(t);
    if (!out.some(o => key(o) === key(g))) out.push(g);
    if (out.length >= max) break;
  }
  return out;
}

// SoundCloud's tag_list: space-separated, multi-word tags in quotes.
export const parseSoundCloudTags = (s = '') => [...String(s).matchAll(/"([^"]+)"|(\S+)/g)].map(m => (m[1] || m[2]).trim());
