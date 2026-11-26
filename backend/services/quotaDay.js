// YouTube's daily quota resets at midnight Pacific time (not UTC). Our counters used the UTC date, so
// between 00:00 and 07:00/08:00 UTC the site thought it was a fresh day while Google's quota was not (9 Oct 2026).
// One place that says which "quota day" it is, and how long is left of it.
const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' });
const hm = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export const quotaDay = (now = new Date()) => ymd.format(now);   // "2026-10-09"

export function minutesToQuotaReset(now = new Date()) {
  const [h, m] = hm.format(now).split(':').map(Number);
  return 24 * 60 - (h * 60 + m);
}
