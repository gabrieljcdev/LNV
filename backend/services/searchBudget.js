// Who may spend YouTube search quota, and how much (2026-10-07). A search is
// 100 units of a 5,000-unit day — 50 searches for the whole site — so paid
// searches are rationed three ways, and everything else (saved links, crawled
// channels, Spotify, Discogs' own videos, links people add) stays free:
//
//   1. New posts come first. Someone just listening (a click in a spotlight or
//      drawer) may use only LISTEN_SHARE of the day; the last 30% is kept for
//      posts being made, so a busy afternoon of browsing can't leave the next
//      post with nothing to search with.
//   2. At most PAID_PER_RELEASE paid searches per release, however many people
//      post or open it: the first tracks get searched, the rest wait for
//      Spotify, Discogs' videos or a listener's link. One 20-track album can
//      no longer cost 2,000 units.
//   3. The release breaker: a release whose searches keep coming back empty
//      (3 misses, and more than 3 per find) stops paying — an album that isn't
//      on YouTube is found out after a few tries, not after all its tracks.

export const LISTEN_SHARE = Number(process.env.YOUTUBE_LISTEN_SHARE) || 0.7;
export const PAID_PER_RELEASE = Number(process.env.PAID_SEARCHES_PER_RELEASE) || 3;

// used / cap: today's YouTube units and the daily cap.
// release: { paid, hits, misses } for the release being asked about (or null).
// -> { busy, held, why } — busy: today's share for this kind of request is spent;
//    held: this release has had its paid searches (cap or breaker). Either way only
//    the free steps run.
export function searchBudget({ used, cap, listening, release = null }) {
  const share = listening ? LISTEN_SHARE : 1;
  const busy = used >= cap * share;
  const paid = release?.paid || 0, hits = release?.hits || 0, misses = release?.misses || 0;
  if (release && paid >= PAID_PER_RELEASE) return { busy, held: true, why: 'release-cap' };
  if (release && misses >= 3 && misses > hits * 3) return { busy, held: true, why: 'breaker' };
  return { busy, held: false, why: busy ? (listening ? 'listen-share' : 'daily-cap') : null };
}
