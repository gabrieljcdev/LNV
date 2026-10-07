To: Bandcamp (developer / partnerships contact)
Subject: API access request: [NAME], a non-algorithmic community for sharing records

Hi Bandcamp team,

I'm Gabriel Clemente, and I'm building [NAME] ([DOMAIN]). It's a small community site where people share the records they love with each other. There's no recommendation algorithm. Your feed is the people you follow, in the order they posted. Every post links straight back to where the music lives, and for a lot of our users that's Bandcamp.

**How Bandcamp shows up on [NAME] today**
- A member pastes a Bandcamp album or track link into a post.
- We show it with your official Embedded Player, so plays happen on Bandcamp, and a "Buy on Bandcamp" link goes to the artist's page.
- To build the post, we read that one public page once: title, artist, label, tracklist, artwork and the artist's own tags (we use the tags as genres). We cache the result so we don't fetch it again.
- We never download or host audio, and we don't scrape Bandcamp in bulk. The only requests are for links a person chose to share.

**What we're asking for**
We'd much rather do this through an approved route than by reading HTML pages. If you can offer it, we'd like read access to public release metadata (title, artist, label, tracklist, artwork, tags and the release date) for a release or track URL. Ideally that would come with your terms on attribution, caching and request rates, and we'll follow whatever you set. If there's no API for this, we'd be grateful for your guidance on what you're comfortable with, such as limits, identifying ourselves in the User-Agent, or caching periods.

**Why it's good for artists**
[NAME] exists to send listeners back to the source. Every Bandcamp post on [NAME] links to a page where fans can buy the music directly. That's the same spirit as Bandcamp Fridays, and the opposite of streaming-algorithm discovery.

**Expected volume:** [NAME] is in development and launches in [MONTH/YEAR]. We expect roughly [N] lookups a day at first, one per shared link, all cached.

I'm happy to show you a demo or answer any questions.

Thanks for your time,
Gabriel Clemente
[NAME] · [DOMAIN]
gabrieljorgeclemente@live.com
