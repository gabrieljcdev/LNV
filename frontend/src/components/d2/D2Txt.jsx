import { D2Header } from './D2Artists.jsx'

const CONTENT = {
  readme: {
    title: 'README.TXT',
    body: `LATE NIGHT VIBES
================

A community for serious music collectors and listeners.

HOW IT WORKS
------------
Post records from your Discogs collection.
Add a note about why this record matters to you.
Community members comment, save to their crates,
and discover music through the feed.

THE FEED
--------
Scroll horizontally through post cards.
Each card shows the record, tracks, and a personal note.
Play any track directly from the card.

CRATES
------
Save records to named crates — your personal archive.
Make a crate public to share your collection.

NETLINK
-------
The community discussion layer.
Posts link to records. Comments link to posts.

CONTACT
-------
This is a private community.
Invites only.`,
  },
  about: {
    title: 'ABOUT.TXT',
    body: `ABOUT LATE NIGHT VIBES
======================

EST. 2024

Built for people who care about music —
not playlists, not algorithms, not streams.

Records. Crates. Notes. Community.

A place to document what you listen to and why.
A place to find out what serious listeners are
playing at 2am on a Tuesday.

STACK
-----
React · Node.js · SQLite · Discogs API
YouTube IFrame API

DESIGN
------
Barlow + VT323
Pastel blue · Charcoal · Orange

"The music is the message."`,
  },
  donate: {
    title: 'DONATE.TXT',
    body: `SUPPORT LNV
===========

Late Night Vibes is free and ad-free.
No investors. No tracking.

If you want to keep it running:

[LINK TO PAYMENT PAGE]

All contributions go to:
- Server costs
- Domain renewal
- Development time

Thank you.`,
  },
  contact: {
    title: 'CONTACT.TXT',
    body: `CONTACT
=======

admin@latenightvibes.fm

For: bugs, feature requests, abuse reports.

Response time: when the coffee kicks in.`,
  },
}

export default function D2Txt({ file }) {
  const content = CONTENT[file] ?? CONTENT.readme

  return (
    <div style={{ padding: 16, overflow: 'auto', height: '100%' }}>
      <div style={{
        fontFamily: 'VT323, monospace',
        fontSize: 11,
        letterSpacing: 2,
        color: 'var(--grey-text)',
        textTransform: 'uppercase',
        marginBottom: 14,
        paddingBottom: 8,
        borderBottom: '1px solid var(--border)',
      }}>
        {content.title}
      </div>
      <pre style={{
        fontFamily: 'VT323, monospace',
        fontSize: 14,
        color: 'var(--charcoal)',
        lineHeight: 1.6,
        letterSpacing: 0.3,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {content.body}
      </pre>
    </div>
  )
}
