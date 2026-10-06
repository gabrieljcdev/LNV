// Turns a stream link (YouTube, SoundCloud, Mixcloud) into the embed
// player's src — shared by the feed cards and the drawers' release preview.
export function toEmbedSrc(streamUrl) {
  if (!streamUrl) return null
  const ytMatch = streamUrl.match(/(?:v=|youtu\.be\/|embed\/)([^&\s?]{11})/)
  // enablejsapi: lets playerGuard pause it when another player starts.
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}?rel=0&modestbranding=1&color=white&enablejsapi=1`
  if (/soundcloud\.com/i.test(streamUrl)) return `https://w.soundcloud.com/player/?url=${encodeURIComponent(streamUrl)}&color=%23e85d04&auto_play=false&hide_related=true&show_comments=false&show_user=true`
  if (/mixcloud\.com/i.test(streamUrl)) return `https://www.mixcloud.com/widget/iframe/?hide_cover=1&feed=${encodeURIComponent(streamUrl.replace('https://www.mixcloud.com',''))}`
  return null
}
