import { useOutletContext } from 'react-router-dom'
import Feed from '../components/Feed'

function SimpleView({ title, children }) {
  return (
    <div style={{ width:'100%', height:'100%', overflowY:'auto', padding:'40px', background:'var(--theme-bg)' }}>
      <div style={{ fontFamily:'Barlow, sans-serif', fontWeight:900, fontSize:20, color:'var(--theme-text-pri)', marginBottom:24 }}>{title}</div>
      {children}
    </div>
  )
}

export default function Home() {
  const { view } = useOutletContext() || {}

  // Artists/genres/labels are browsed through the drawer (Strip's panel
  // tabs → openD3 → ContentPanel), not through this view-swap mechanism.
  if (view === 'readme')      return <SimpleView title="README.TXT"><div style={{ fontFamily:'VT323,monospace', color:'var(--theme-text-sec)', fontSize:13, lineHeight:1.8 }}>WELCOME TO LATE NIGHT VIBES<br/>────────────────────────<br/>A blog for serious music lovers.<br/>Dig deep. Share what you're playing.<br/><br/>&gt; Browse the feed<br/>&gt; Post a record<br/>&gt; Discover what others are digging</div></SimpleView>
  if (view === 'about')       return <SimpleView title="ABOUT"><div style={{ fontFamily:'VT323,monospace', color:'var(--theme-text-sec)', fontSize:13, lineHeight:1.8 }}>LATE NIGHT VIBES<br/>────────────────────────<br/>A sophisticated music community<br/>for serious collectors.<br/><br/>Built with React, Node.js,<br/>Discogs API and YouTube.<br/><br/>EST. 2024</div></SimpleView>

  // Default: the feed itself. No landing/collections gate — this is a
  // blog-like site, the feed is the whole point.
  return <Feed />
}
