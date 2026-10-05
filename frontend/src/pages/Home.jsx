import Feed from '../components/Feed'

export default function Home() {
  // Artists / genres / labels / live sets / about all open as drawers
  // (Strip's panel tabs → openD3 → ContentPanel). The readme and about
  // views that used to replace the feed here are gone (2026-10-01): the
  // readme's content lives in the About drawer.
  // Default: the feed itself. No landing/collections gate — this is a
  // blog-like site, the feed is the whole point.
  return <Feed />
}
