import fetch from 'node-fetch';

/**
 * Attempt to find a Bandcamp page for an artist or album
 * Uses Bandcamp's search endpoint (no official API needed)
 * @param {string} artist
 * @param {string} album - optional
 */
export async function findBandcampLink(artist, album = '') {
  const query = album ? `${artist} ${album}` : artist;
  const searchUrl = `https://bandcamp.com/search?q=${encodeURIComponent(query)}&item_type=a`;

  try {
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VinylCrateBot/1.0)',
      },
    });

    if (!res.ok) return null;
    const html = await res.text();

    // Extract first result URL from Bandcamp search HTML
    const match = html.match(/href="(https:\/\/[^.]+\.bandcamp\.com\/album\/[^"]+)"/);
    if (match) return match[1];

    // Try artist page
    const artistMatch = html.match(/href="(https:\/\/[^.]+\.bandcamp\.com\/)"/);
    if (artistMatch) return artistMatch[1];

    return null;
  } catch (e) {
    console.warn('Bandcamp search failed:', e.message);
    return null;
  }
}