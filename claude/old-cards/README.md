# Old post cards (before the shelf stack) — reference screenshots

Captured 2026-10-08, from the live feed with `?cards=old`, each card at 1:1 in an 800 x 735 window
(the cards are 800 wide; their height is the window's height).

| File | Card | Post |
|---|---|---|
| `old-single-postcard.jpg` | PostCard, single: art on the right, rail with badges / artist / title / big number / "album listing" on the left | 4Front - Star / Skin (#90) |
| `old-album-postcard-3-tracks.jpg` | PostCard with an embedded SoundCloud player in the art slot and a short album listing | Dixon - Dixon Edits (#89) |
| `old-album-card.jpg` | AlbumCard: small sleeve top-left, post title + description top-right, title block + big number under the sleeve, two-column tracklist right | Neon Phusion - The Future Ain't The Same As it Used 2 B (#72) |
| `old-album-card-compilation.jpg` | AlbumCard on a Various Artists compilation: the busy, wrapped tracklist that prompted the wider compilation card | Various Artists - Âme ...mixing (#76) |

Not captured: live-set cards, spotlights and the intro — they were not changed.

## Getting the old cards back
- In the browser: add `?cards=old` to the feed address (remembered until `?cards=new`).
- In git: the commit before the shelf stack is tagged `pre-shelf-stack` (2da00d1).
  The earlier redesign attempt's last commit is tagged `pre-card-redesign`.
- The code is still in `frontend/src/components/Feed.jsx` (PostCard, AlbumCard); the new card is `ShelfCard`.
