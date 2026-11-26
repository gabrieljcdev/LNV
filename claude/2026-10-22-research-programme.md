# Research programme: does how people share music predict what they will love?

Written 22 Oct 2026 for gabriel. Status: the collection plumbing is built and running for one account (yours). Nothing here has been
tested on real data yet, and the hypothesis below is a hypothesis. Where I rely on published work, the source is linked and I say what I
did not check. I read search summaries, not the full papers, so treat every figure as a lead to verify before it goes in anything public.

---

## 1. The question and the hypothesis

**Gabriel's hypothesis (22 Oct):** data analytics can correctly predict new good music a person will probably like, and **tracking how
users share music is the defining factor** in making that prediction work.

**Stated so it can be proved wrong** (a hypothesis you cannot lose is not a hypothesis):

- **H1: behaviour beats metadata.** A model fed what people do (full listens, replays, highlights, keeps, playlist adds) predicts
  which unseen records a person will keep or highlight better than one fed only the catalogue (shared labels, artists, styles, era).
- **H2: sharing is the defining factor.** Adding *sharing* signals (who put a record in front of whom, who kept it from whom, who
  tagged whom, which playlists carry it) improves that prediction **more than adding any other signal family**, and more than
  everything else combined if the claim "defining" is to hold.
- **H3: how it travels matters, not just that it travelled.** The path (a record found digging vs pasted in vs kept from a trusted
  person; how fast it was kept after being shown; who it came from) carries information that a plain "was shared" count does not.

**What would count as failure.** If, on held-out data, a model with sharing features does not beat the same model without them by a
margin larger than the noise between runs, H2 is false (or untestable at this size, which is a different and honest result). H1 failing
would mean metadata alone is enough and behaviour tracking is not worth its privacy cost.

### The principle that makes this acceptable

**This data is for research on our side only. It is never used to give a user music, to rank their feed, to order search results or to
choose what plays.** Gabriel confirmed this on 22 Oct. It extends the rule set on 10 Oct: *the on-site algorithm never recommends
music, it only connects people.* The programme is a study of whether prediction is possible and what drives it, not a recommender. If
the finding is strong, using it to steer anyone would be a separate decision with its own consent and its own notice, not something this
data quietly becomes.

---

## 2. What the published work says (and does not say)

### Behaviour signals
- **Completions and replays are more reliably useful than skips.** Deezer's team treats a full listen as positive and a drop before 30
  seconds as negative, but calls that data noisy ([Deezer](https://newsroom-deezer.com/2025/06/umap-sguerra-html/)). Filtering by duration
  and replay gave a clear improvement in a 2017 study ([Considering Durations and Replays](https://deepai.org/publication/considering-durations-and-replays-to-improve-music-recommender-systems)).
  A Last.fm thesis found skip signals *hurt* two of the methods it tried ([Aalborg](https://projekter.aau.dk/exploring-skips-and-long-term-preferences-in-session-based-music-recommendation-8bde515b.html)).
  Spotify's skip-prediction challenge shows skips can be modelled, but only with session context ([WSDM Cup 2019](https://arxiv.org/pdf/1901.08203)).
- **Plays are a weak vote; weight them.** The standard treatment is a binary preference with a confidence that grows with the play
  count ([Hu, Koren, Volinsky 2008](https://andrewclark.super.site/all-media/collaborative-filtering-for-implicit-feedback-datasets)).
- **Explicit signals are rare but strong.** In Last.fm, "loved" tracks were far scarcer than plays and the rate declined over time
  ([Jawaheer et al. 2010](https://discovery.ucl.ac.uk/10088997/7/Jawaheer%2C%20Szomszor%2C%20Kostkova%20-%202010%20-%20Characterisation%20of%20explicit%20feedback%20in%20an%20online%20music%20recommendation%20service%281%29bh.pdf)).
  For this site the explicit signals are posts, keeps, highlights and playlist adds.

### Social and sharing signals (the part the hypothesis rests on)
The evidence is **supportive but mixed, and the size of the effect depends heavily on how it is measured**:

- **Influence exists after controlling for taste.** On Last.fm, listening to a *completely new* artist rises sharply within hours of a
  friend listening to it, compared with non-friends, with taste similarity controlled for ([Pálovics and Benczúr](https://arxiv.org/pdf/1307.7142)).
- **Sharing improves prediction of what spreads.** Using "one person's first listen is followed by another's" links, an influence
  parameter lifted hit-prediction precision from 0.14 to 0.21 ([Reisz, Servedio, Thurner](https://arxiv.org/pdf/2211.15164)). That is
  prediction of song popularity, not of one person's taste.
- **But raw "influence" is easily overstated.** A multi-network study (Last.fm included) found that estimates which ignore homophily
  overestimate copy-influence by large amounts, and that true copy-influence was under 1% of actions in every network ([arXiv 1604.01105](https://www.arxiv.org/pdf/1604.01105)).
- **Seeing *whose* taste it is helps people.** On a music platform, the friend's name beside a liked song was the most persuasive
  cue, and people trusted friends whose taste they knew ([Do Social Explanations Work?](https://arxiv.org/pdf/1304.3405)).
- **Trust helps recommenders in general.** Social recommender surveys report accuracy gains from trust and social links ([Yang et al. survey](https://romisatriawahono.net/lecture/rm/survey/information%20retrieval/Yang%20-%20Social%20Recommender%20Systems%20-%202014.pdf)).

**What this means for H2.** "Sharing matters" is plausible. "Sharing is the *defining* factor" is a strong claim the literature does not
establish, and the best-controlled work suggests the pure copying effect is small. The more likely truth, and a better thing to test, is
that sharing signals are **high-quality labels** (a person deliberately put a record in front of someone, which is rare and costly, so
it is informative) rather than that copying drives everything. The design below is built to tell those apart.

**Not found / not checked:** I found nothing measuring this in a *small curated community of record diggers*, which is your setting.
Most results are large streaming populations. Their effect sizes may not transfer.

---

## 3. What we collect, and what it is for

Everything below is recorded **only for accounts that switched recording on** (one switch, off by default; today only `lnv_admin`).
IDs and short labels only. No post text, reply text, search terms, IP addresses or screen positions.

### 3a. Behaviour (implicit)

| Signal | Where it lives | Built | Notes |
|---|---|---|---|
| Visits (start, end, active time) | `activity.db` `flow_events` | yes | A visit ends after 30 minutes away |
| Time in each view / drawer | `flow_events` kind `view` (ms on the one left) | yes | Drawer kind only (`drawer:labels`), never the name inside |
| Clicks, as slug labels | `flow_events` kind `click` | yes | Visible text is read only inside marked interface containers (nav, drawer headers) |
| What led where (click → view) | derived: a click within 1.5 s before a view change | yes | |
| Listens: platform, id, ms really playing, finished | `flow_events` kind `listen` | yes | YouTube and Spotify report play/pause; SoundCloud and Bandcamp are counted from start and marked `approx` |
| Plays / finishes / skips (older API) | `events` kinds play, finish, skip | yes, unused | Superseded by `listen`; kept for the API |
| Search happened, post window opened | `flow_events` | yes | The search words are not stored |

### 3b. Explicit and social (the sharing family)

| Signal | Where it lives | Built | What it tells us |
|---|---|---|---|
| A post, with how it arrived (`link` pasted, `digging` from a drawer, `user` kept from a person) | `posts.origin`, `origin_ref`; `events` kind `post` | backend yes; **front end does not send origin yet** | How a record entered the site |
| A keep (the heart) with whom it came from | `post_joins.origin/origin_ref`; `events` kind `keep` | backend yes; front end does not send `origin_ref` | **The core sharing edge: person A's record reached person B and B kept it** |
| Highlights (a track you are posting the record for) | `track_highlights`; `events` highlight | yes | A strong, rare, explicit preference |
| Replies | `comments`; `events` reply (id only) | yes | Engagement; text is never put in the research store |
| @mentions (tagging a person on a post or reply) | `mentions`, `notifications` | yes (22 Oct) | Directed sharing: "this is for you" |
| Follows | `follows` | yes | The social graph |
| Playlist adds / which playlists carry a record | `playlist_tracks`, `playlists` | yes | Curation; sharing by collection |
| Wrong-link reports, silent hides | `bad_link_reports`, `post_hides` | yes (22 Oct) | Negative evidence (a hide says "not for me") |
| Introductions shown and followed | `introductions` tables (existing) | yes | Whether a human connection was acted on |
| Share-link opens, copy-link, playlist shared | not built | **no** | Would show sharing *outside* the site |
| Send a track to a friend, group feeds | not built | **no** | The richest direct-sharing signals; both are on the TODO |

**Gap that matters most for H2:** the front end must start sending `origin` and `origin_ref` (the "found from <person>" and "found
digging in <drawer>" facts). Without them the keep edge exists but its *source* is missing, and H3 cannot be tested.

### 3c. Content metadata (the baseline, not tracking)
Labels, artists, styles, years and catalogue numbers already on every post. This is the control: what a model can do with no behaviour
at all.

---

## 4. How we would test it

### 4a. The prediction task
**Target:** will person P *keep, highlight or add to a playlist* a record they have not posted before? These are deliberate acts, so they
make cleaner labels than clicks or skips. Plays and skips are *features*, not labels.

**Split by time, never at random.** Train on everything before a cut-off, test on what each person does after it. A random split leaks
the future into the past and inflates every number.

### 4b. The models (an ablation ladder)
Each rung adds one signal family to the previous one, on the same split, so the gain from each is visible:

1. **Popularity:** most-kept records. The floor any model must beat.
2. **Content overlap:** shared labels, artists, styles, era. (This is what `inCommon` already computes.)
3. **+ listening:** weighted full listens and replays (confidence-weighted, after Hu et al.).
4. **+ explicit:** highlights and playlist adds.
5. **+ sharing:** keep-from-person edges, mentions, follows, who-introduced-whom, share timing.
6. **Sharing alone,** to see how far it gets on its own.

**H2 is supported only if** rung 5 over rung 4 is the largest single gain **and** rung 6 is competitive. If rung 3 or 4 gives the
biggest jump, behaviour matters but sharing is not "defining".

### 4c. Metrics
Hit rate and NDCG at k (did the kept record appear in the top k?), plus **novelty and coverage**, because a model that only predicts
the already-popular is cheap and uninteresting. Report the spread across repeated runs, not a single number.

### 4d. Separating influence from taste (the confound)
People who share are often people who already like the same things (homophily), so "A shared it and B kept it" may only mean they are
alike. Controls to use, taken from the literature above:

- Compare B's adoption **after A's share** with B's adoption of **similar records A did not share** (matched on content overlap).
- Compare against **non-followers** with equal taste similarity.
- Use **timing**: adoption within hours of exposure is stronger evidence of a causal path than months later.
- Report the result as an upper bound on influence, since the best-controlled studies suggest the pure copying effect is small.

### 4e. The size problem (be honest about this early)
Today there is **one opted-in account**. No model can be evaluated on one person. Rough thresholds to plan around, not guarantees:

- Dozens of people and a few thousand keep/highlight events: enough to run rungs 1 to 4 and see whether anything moves.
- Hundreds of people with real sharing edges between them: needed before rung 5 can be judged against noise.
- Below that, the programme is **building the dataset**, and the useful output is descriptive (the paths, the times, who introduces whom),
  not predictive. That is still worth having, and it is what the Admin panel now shows.

**A way to start before the community is large:** build and debug the whole pipeline on a **public dataset** (ListenBrainz is open and
pseudonymous; check its terms) so the code is proven when your own data arrives. Last.fm's LFM-2b is no longer downloadable.

### 4f. Threats to validity (write these in any report)
- **Selection:** opt-in users are not typical users; diggers are not typical listeners.
- **Observer effect:** people who know they are tracked may act differently.
- **Survivorship:** we only see records that were posted; we never see what people rejected before posting.
- **Platform effect:** a record kept because it was *shown* (feed position, an introduction) tells us about the site, not taste. Log what was
  on screen if exposure ever needs to be controlled.
- **Small, fast-moving community:** a few power users can dominate any pattern.

---

## 5. Data protection and governance

This is the most sensitive thing on the site, so the rules are stricter than the build.

- **Consent, opt-in, separate from using the site.** One switch (`user_prefs.keep_listening`, off by default). The sources suggest consent
  is the safer footing for behavioural tracking and that profiling is the riskiest area, but they were mostly law-firm and vendor pages about
  cookies, not the ICO's own text ([Lewis Silkin](https://lewissilkin.com/en/news/ico-updated-guidance-on-the-use-of-cookies-and-similar-technologies),
  [Reclaim The Net](https://reclaimthenet.org/uks-ico-website-analytics)). **Read the ICO guidance directly and have a solicitor check the
  notice before anyone but you is switched on.**
- **Purpose limitation, stated in plain words:** research on our side; never used to choose what anyone hears.
- **Minimisation (already enforced in code):** the server drops anything that is not a tidy slug, takes only a fixed set of `meta` keys,
  stores no IP, no text, no search terms and no screen positions.
- **Person's rights (built):** see their own data (`/api/activity/me/*`), export it (`/me/export`), clear listening or flow, or delete
  everything held about them (`DELETE /api/activity/me`). Raw flow rolls off after 180 days; listening after 400.
- **Separate store (built):** `activity.db`, apart from the music database, backed up nightly with it (installed on the server 22 Oct).
- **Not yet done:** encryption at rest for `activity.db` and its backups; a DPIA (profiling); ICO data-protection fee; an age limit; an
  access log for who reads the research data; pseudonymised export tooling (hashed ids, coarse times, no raw copy leaves the server); a
  breach plan (UK GDPR: tell the ICO within 72 hours).
- **Rewrite the site's promises first.** The About and welcome texts still say "Nothing learns from you." That is true while only your
  account is on; it must change *before* anyone else is switched on.
- **Third-party terms to check before analysing:**
  - **Spotify:** its developer policy is reported to forbid using Spotify content to train machine-learning models, and Spotify staff point
    to open datasets instead ([Spotify community thread](https://community.spotify.com/t5/Spotify-for-Developers/Clarification-on-using-Spotify-data-with-AI-ML-models/m-p/6040149/highlight/true)).
    We store a play event with a Spotify track id, not Spotify's content, but **this needs reading in the policy text itself** (I found only
    commentary) before any model uses those rows.
  - **YouTube:** API data has a 30-day storage rule (already handled by the nightly refresh). Listen events keep a public video id taken from
    the embed, not from the API; confirm that reading with the policy.
  - **Discogs:** their terms on stored data were not re-checked here.

---

## 6. Roadmap

| Phase | What | Needs |
|---|---|---|
| **0 (now)** | Plumbing, your account only. Admin → Status shows visit length, time per view, click→view leads, paths, listening. | Deploy the front end; use the site normally |
| **1** | Front end sends `origin` / `origin_ref`; a settings screen to switch recording on, see, export, clear; rewrite About and the privacy notice | Front-end work; solicitor read of the notice |
| **2** | Sharing instrumentation: share-link opens, copy-link, playlist shared, time from a post to its first keep, who-introduced-whom | Small additions; "send a track" and group feeds when built |
| **3** | Pseudonymised research export + an analysis notebook; run the ablation ladder on a public dataset to prove the code | Export tooling; pick the public dataset |
| **4** | Invite a first group (opt-in) and gather; judge rungs 1 to 4, then 5 once sharing edges exist | Enough people (see 4e) |
| **5** | Write it up either way (a negative result is a result); decide separately whether any of it should ever touch the product | A fresh decision with its own consent |

---

## 7. Open questions for gabriel

1. **Is "defining factor" the claim you want to be held to,** or would "sharing is a strong, distinct signal" be enough? The first is much
   harder to show and the literature does not support it yet.
2. **What counts as the label?** Keep, highlight and playlist add are my suggestion. Is a *post* a stronger statement than a keep for you?
3. **Who would be in the first group,** and how many? That sets which rungs are testable and when.
4. **Publish or private?** An open, opt-in "help us study how people dig" explanation builds trust, but publishing raises the bar on consent
   and anonymisation.
5. **Exposure logging:** do you want to record what was on screen (to control for the site's own influence)? It is the single biggest
   privacy step beyond what exists.

---

## Appendix A: the event vocabulary

`flow_events.kind`: `session_start`, `session_end`, `view`, `click`, `listen`, `compose_open`, `search`, `scroll` (unused).
Fields: `t` (device time), `seq`, `view`, `target` (slug), `ref` (post, track or video id), `ms`, `meta` (fixed keys only: `finished`,
`approx`, `phone`, `standalone`, `results`, `n`, `width`, `count`, `device`, `mode`, `platform`, `reason`, `theme`).
`events.kind`: `post`, `unpost`, `keep`, `unkeep`, `highlight`, `unhighlight`, `reply`, `play`, `finish`, `skip`.

## Appendix B: where it is in the code

- Collection (front end): `frontend/src/lib/flow.js`; hooks in `TrackPlayer.jsx`, `Layout.jsx`, `LayoutProvider.jsx`, `main.jsx`.
- Storage: `backend/db/activityDb.js` (`activity.db`: `events`, `flow_events`, `user_prefs`).
- Rules and analysis: `backend/services/flow.js`, `listeningHistory.js`; routes `backend/routes/activity.js` (`/api/activity/*`) and `/api/admin/flow`.
- The sharing edges: `posts.js` (origin, keeps), `notifications.js` (mentions), `collectionsService.js` (introductions, in-common).
- Backups: `deploy/backup.sh` (installed as `/usr/local/bin/lnv-backup`).

## Appendix C: sources
- [Deezer: uncertainty in repeated implicit feedback](https://newsroom-deezer.com/2025/06/umap-sguerra-html/)
- [Considering durations and replays](https://deepai.org/publication/considering-durations-and-replays-to-improve-music-recommender-systems)
- [Sequential skip prediction (WSDM Cup 2019)](https://arxiv.org/pdf/1901.08203)
- [Skips and long-term preferences (Aalborg thesis)](https://projekter.aau.dk/exploring-skips-and-long-term-preferences-in-session-based-music-recommendation-8bde515b.html)
- [Hu, Koren, Volinsky: collaborative filtering for implicit feedback](https://andrewclark.super.site/all-media/collaborative-filtering-for-implicit-feedback-datasets)
- [Jawaheer et al.: explicit feedback in Last.fm](https://discovery.ucl.ac.uk/10088997/7/Jawaheer%2C%20Szomszor%2C%20Kostkova%20-%202010%20-%20Characterisation%20of%20explicit%20feedback%20in%20an%20online%20music%20recommendation%20service%281%29bh.pdf)
- [Pálovics and Benczúr: temporal influence over the Last.fm social network](https://arxiv.org/pdf/1307.7142)
- [Reisz, Servedio, Thurner: homophily and influencer networks in song popularity](https://arxiv.org/pdf/2211.15164)
- [Copy-influence vs homophily across social networks](https://www.arxiv.org/pdf/1604.01105)
- [Do social explanations work?](https://arxiv.org/pdf/1304.3405)
- [Social recommender systems survey (Yang et al.)](https://romisatriawahono.net/lecture/rm/survey/information%20retrieval/Yang%20-%20Social%20Recommender%20Systems%20-%202014.pdf)
- [Social information access chapter](https://web-ainf.aau.at/pub/jannach/files/BookChapter_Social_Information_Access_2018.pdf)
- [Lewis Silkin on ICO cookie guidance](https://lewissilkin.com/en/news/ico-updated-guidance-on-the-use-of-cookies-and-similar-technologies)
- [Reclaim The Net on ICO analytics](https://reclaimthenet.org/uks-ico-website-analytics)
- [Spotify community: using Spotify data with AI/ML models](https://community.spotify.com/t5/Spotify-for-Developers/Clarification-on-using-Spotify-data-with-AI-ML-models/m-p/6040149/highlight/true)
