// The artists a track names: its own credited artist(s) and whoever its title says remixed it. The same reading as
// the feed card's track line (Feed.jsx shelfTrack / remixersOf) and /posts/browse's `track_artists`.
const SPLIT = /\s*,\s+|\s+(?:feat\.?|ft\.?|featuring|vs\.?|b2b)\s+/i;
const GENERIC_MIX = /^(original|extended|radio|club|album|single|vocal|instrumental|dub|long|short|main|full|clean|dirty|edit|lp|ep|7"|12"|remix|re-?edit|version|vip|acapella|a cappella|live|demo|mono|stereo)\b/i;
// "Timmy's Original Shelter Mix" names a version of the track, not a person.
const VERSION_WORDS = /\b(original|extended|radio|club|vocal|instrumental|dub|long|short|album|single|clean|dirty|acapella|a cappella|version|mix|remix|edit)\b/i;

/** Remixers named in a title: "(Dixon Rework)" -> Dixon, "(Babatunji's Dub Mix)" -> Babatunji. */
export function remixersOf(title) {
  const out = [];
  for (const m of String(title || '').matchAll(/[(\[]([^()\[\]]{2,60}?)\s+(?:remix|rmx|rework|re-?edit|re-?work|mix|edit|dub|version)[)\]]/gi)) {
    let name = m[1].replace(/\s+(?:vocal|dub|instrumental|club|radio|extended)$/i, '').trim();
    name = name.replace(/['’]s$/i, '').trim();      // "Babatunji's" -> "Babatunji" (the possessive of "X's Mix")
    if (name && !GENERIC_MIX.test(name) && !VERSION_WORDS.test(name) && /^[\p{L}\p{N}]/u.test(name)) out.push(name);
  }
  return [...new Set(out)];
}

export function trackArtistNames(t) {
  const names = [];
  String(t.artist || '').split(SPLIT).map(s => s.trim()).filter(Boolean).forEach(n => names.push(n));
  remixersOf(t.title).forEach(n => names.push(n));
  return names;
}
