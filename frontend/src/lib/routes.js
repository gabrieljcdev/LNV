// Which addresses are "the feed page" (2026-10-22): the front page and a person's address, /u/<username> (backend: GET /api/walls/:username,
// which matches the name without regard to case and answers with the real spelling and the path to show).
export const isFeedPath = p => p === '/' || /^\/u\/[^/]+\/?$/.test(p)
