// The blocks card's colour spectrum (gabriel, 13 Oct 2026), hand-coloured in frontend/palette-tool.html.
// For each time-of-day palette: 8 looks, one per post, taken in order as the feed scrolls (`mode` 'wrap' = 1..8 then 1..8 again; 'pingpong' = 1..8..1).
// Every value names a colour of that palette (bg, sidebar, dark1-3, light1-2, showcase, accent), so a look follows the palette if its colours change.
// Feed.jsx (handLook) reads this; a spectrum saved by the palette tool in the browser ("Apply to my feed") overrides it for trying things out.
// Blocks, in order: hero (cover + header), tracks, plays (plays from), details, post.
const L = (hero, tracks, plays, details, post) => ({ hero, tracks, plays, details, post })

export const BLOCK_SPECTRUM = {
  // order: 'tone' = the feed arranges the 8 looks light to dark by the colour of the profile card and walks them there and back (Feed.jsx toneSorted);
  // 'hand' = exactly in the order below, using `mode`.
  order: 'tone',
  mode: 'wrap',
  pals: {
    'Deep Night': [
      L('dark1', 'dark1', 'light2', 'light1', 'light1'),
      L('light1', 'light1', 'dark3', 'dark3', 'dark3'),
      L('dark3', 'dark3', 'light2', 'light1', 'light1'),
      L('light2', 'light2', 'dark3', 'dark3', 'light1'),
      L('light1', 'dark3', 'light1', 'dark3', 'light1'),
      L('dark3', 'dark3', 'light1', 'light2', 'dark3'),
      L('light1', 'light1', 'light1', 'dark3', 'bg'),
      L('dark1', 'dark1', 'light2', 'light2', 'dark1'),
    ],
    'Pre-dawn': [
      L('light1', 'light1', 'accent', 'accent', 'accent'),
      L('dark2', 'dark2', 'dark1', 'dark1', 'accent'),
      L('dark1', 'dark1', 'accent', 'light1', 'dark1'),
      L('dark2', 'accent', 'dark2', 'dark2', 'dark2'),
      L('accent', 'bg', 'light1', 'light1', 'light1'),
      L('accent', 'accent', 'dark1', 'light1', 'accent'),
      L('light1', 'accent', 'light1', 'light1', 'bg'),
      L('light1', 'light1', 'accent', 'light1', 'accent'),
    ],
    'First Light': [
      L('sidebar', 'showcase', 'dark3', 'dark3', 'dark3'),
      L('dark1', 'sidebar', 'dark2', 'dark1', 'dark2'),
      L('sidebar', 'light1', 'dark1', 'dark2', 'light1'),
      L('dark3', 'dark3', 'dark3', 'dark3', 'showcase'),
      L('dark1', 'dark1', 'showcase', 'sidebar', 'dark3'),
      L('dark3', 'showcase', 'showcase', 'dark3', 'dark3'),
      L('light1', 'showcase', 'sidebar', 'light2', 'dark1'),
      L('dark1', 'showcase', 'light2', 'light1', 'dark3'),
    ],
    Morning: [
      L('dark1', 'dark2', 'light1', 'light1', 'dark3'),
      L('dark3', 'dark3', 'light1', 'dark2', 'dark1'),
      L('dark1', 'dark1', 'light2', 'light1', 'dark3'),
      L('dark3', 'dark3', 'dark2', 'light1', 'light2'),
      L('dark1', 'dark1', 'light1', 'light1', 'dark1'),
      L('bg', 'light1', 'dark1', 'dark1', 'dark1'),
      L('dark2', 'dark2', 'dark3', 'dark3', 'dark2'),
      L('dark3', 'dark3', 'dark1', 'dark1', 'dark3'),
    ],
    Midday: [
      L('light2', 'dark3', 'dark3', 'dark2', 'dark2'),
      L('dark2', 'dark2', 'dark3', 'dark1', 'light1'),
      L('light2', 'light2', 'dark1', 'light1', 'light2'),
      L('light1', 'light1', 'dark1', 'dark3', 'dark3'),
      L('dark1', 'dark1', 'dark1', 'light2', 'dark3'),
      L('light2', 'dark1', 'light1', 'light1', 'dark3'),
      L('light1', 'dark1', 'light2', 'dark1', 'dark1'),
      L('light2', 'dark1', 'light1', 'light1', 'dark3'),
    ],
    Afternoon: [
      L('showcase', 'showcase', 'dark3', 'dark2', 'dark1'),
      L('dark2', 'dark1', 'dark3', 'showcase', 'accent'),
      L('sidebar', 'dark3', 'dark1', 'dark2', 'showcase'),
      L('dark1', 'dark2', 'showcase', 'dark3', 'light2'),
      L('showcase', 'dark1', 'showcase', 'sidebar', 'dark3'),
      L('bg', 'showcase', 'dark1', 'dark3', 'dark3'),
      L('light1', 'showcase', 'sidebar', 'showcase', 'dark1'),
      L('dark2', 'dark2', 'showcase', 'light1', 'dark3'),
    ],
    Evening: [
      L('light1', 'showcase', 'dark2', 'light1', 'dark3'),
      L('showcase', 'light1', 'dark3', 'dark2', 'light1'),
      L('dark2', 'light1', 'dark2', 'dark2', 'dark3'),
      L('showcase', 'showcase', 'dark2', 'dark3', 'light1'),
      L('dark1', 'bg', 'dark2', 'light1', 'dark3'),
      L('light1', 'dark2', 'dark2', 'sidebar', 'sidebar'),
      L('light1', 'light1', 'dark2', 'showcase', 'dark3'),
      L('dark3', 'dark3', 'dark2', 'light1', 'showcase'),
    ],
    'Late Evening': [
      L('dark1', 'dark1', 'light2', 'dark2', 'dark2'),
      L('dark2', 'light2', 'dark2', 'light2', 'light1'),
      L('light2', 'light2', 'dark2', 'dark1', 'dark1'),
      L('light1', 'dark3', 'dark2', 'dark2', 'light2'),
      L('dark3', 'light1', 'dark3', 'light2', 'light1'),
      L('light2', 'light2', 'light2', 'light2', 'light2'),
      L('dark2', 'dark2', 'light1', 'dark2', 'dark2'),
      L('light2', 'light1', 'light2', 'light1', 'dark3'),
    ],
  },
}
