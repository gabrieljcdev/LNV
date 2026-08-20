import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Feed from '../components/Feed'
import CreateCollectionModal from '../components/CreateCollectionModal'

const API = import.meta.env.VITE_API_URL

function CollectionThumb({ covers = [], size = 120 }) {
  const imgs = covers.filter(Boolean)
  if (!imgs.length) return <div style={{ width:size, height:size, borderRadius:10, background:'var(--theme-dark2)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--theme-text-ter)', fontSize:28, flexShrink:0 }}>◈</div>
  if (imgs.length === 1) return <img src={imgs[0]} style={{ width:size, height:size, borderRadius:10, objectFit:'cover', flexShrink:0, display:'block' }} alt="" />
  const half = size / 2
  return (
    <div style={{ width:size, height:size, borderRadius:10, overflow:'hidden', display:'grid', gridTemplateColumns:'1fr 1fr', flexShrink:0 }}>
      {[...imgs, null, null, null, null].slice(0,4).map((src, i) => src
        ? <img key={i} src={src} style={{ width:half, height:half, objectFit:'cover', display:'block' }} alt="" />
        : <div key={i} style={{ width:half, height:half, background:'var(--theme-dark2)' }} />
      )}
    </div>
  )
}

function CollectionsDashboard({ navigate }) {
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedCrate, setSelectedCrate] = useState(null)
  const queryClient = useQueryClient()

  const { data: publicCrates = [], isLoading } = useQuery({
    queryKey: ['crates-public'],
    queryFn: async () => { const r = await fetch(API + '/crates/public'); if (!r.ok) return []; return r.json(); }
  })

  if (selectedCrate) return <Feed crateId={selectedCrate.id} crateName={selectedCrate.name} onBack={() => setSelectedCrate(null)} />

  return (
    <div style={{ width:'100%', height:'100%', overflowY:'auto', background:'var(--theme-bg)' }}>
      <div style={{ padding:'32px 32px 80px' }}>

        {/* Profile bar */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:40, borderBottom:'1px solid var(--theme-border)', paddingBottom:20 }}>
          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ width:44, height:44, borderRadius:'50%', background:'var(--theme-accent)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:900, color:'#fff', fontFamily:'Barlow, sans-serif' }}>L</div>
            <div>
              <div style={{ fontFamily:'Barlow, sans-serif', fontWeight:900, fontSize:15, color:'var(--theme-text-pri)' }}>lnv_admin</div>
              <div style={{ fontFamily:'VT323, monospace', fontSize:11, color:'var(--theme-text-ter)', letterSpacing:1 }}>LATE NIGHT VIBES · CURATOR</div>
            </div>
          </div>
          <button onClick={() => navigate('feed')}
            style={{ fontFamily:'VT323, monospace', fontSize:12, letterSpacing:1, padding:'6px 20px', borderRadius:20, border:'1px solid var(--theme-border)', background:'transparent', color:'var(--theme-text-sec)', cursor:'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor='var(--theme-accent)'; e.currentTarget.style.color='var(--theme-accent)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor='var(--theme-border)'; e.currentTarget.style.color='var(--theme-text-sec)'; }}
          >MAIN FEED ◈</button>
        </div>

        {/* Public collections */}
        <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:20 }}>
          <div style={{ fontFamily:'Barlow, sans-serif', fontWeight:900, fontSize:18, color:'var(--theme-text-pri)' }}>PUBLIC COLLECTIONS</div>
          <button onClick={() => setCreateOpen(true)}
            style={{ fontFamily:'VT323, monospace', fontSize:12, letterSpacing:1, padding:'5px 16px', borderRadius:20, border:'1px solid var(--theme-border)', background:'transparent', color:'var(--theme-text-sec)', cursor:'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor='var(--theme-accent)'; e.currentTarget.style.color='var(--theme-accent)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor='var(--theme-border)'; e.currentTarget.style.color='var(--theme-text-sec)'; }}
          >+ NEW COLLECTION</button>
        </div>

        {isLoading && <div style={{ fontFamily:'VT323, monospace', fontSize:13, color:'var(--theme-text-ter)', letterSpacing:2 }}>LOADING...</div>}
        {!isLoading && !publicCrates.length && (
          <div style={{ fontFamily:'VT323, monospace', fontSize:12, color:'var(--theme-text-ter)', letterSpacing:1, lineHeight:2 }}>
            NO PUBLIC COLLECTIONS YET.<br />
            <span style={{ color:'var(--theme-text-sec)', cursor:'pointer' }} onClick={() => setCreateOpen(true)}>CREATE ONE →</span>
          </div>
        )}

        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:16 }}>
          {publicCrates.map(crate => (
            <div key={crate.id} onClick={() => setSelectedCrate(crate)}
              style={{ cursor:'pointer', borderRadius:12, overflow:'hidden', border:'1px solid var(--theme-border)', background:'var(--theme-dark3)', transition:'border-color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor='var(--theme-accent)'}
              onMouseLeave={e => e.currentTarget.style.borderColor='var(--theme-border)'}
            >
              <div style={{ width:'100%', aspectRatio:'1', overflow:'hidden', background:'var(--theme-dark2)' }}>
                <CollectionThumb covers={crate.covers} size={300} />
              </div>
              <div style={{ padding:'12px 14px' }}>
                <div style={{ fontFamily:'Barlow, sans-serif', fontWeight:700, fontSize:13, color:'var(--theme-text-pri)', marginBottom:4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{crate.name}</div>
                <div style={{ fontFamily:'VT323, monospace', fontSize:10, color:'var(--theme-text-ter)', letterSpacing:0.5 }}>@{crate.author} · {crate.record_count} RECORDS</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {createOpen && (
        <CreateCollectionModal
          onClose={() => setCreateOpen(false)}
          onCreate={crate => { queryClient.invalidateQueries({ queryKey: ['crates-public'] }); setCreateOpen(false); setSelectedCrate(crate); }}
        />
      )}
    </div>
  )
}

function SimpleView({ title, children }) {
  return (
    <div style={{ width:'100%', height:'100%', overflowY:'auto', padding:'40px', background:'var(--theme-bg)' }}>
      <div style={{ fontFamily:'Barlow, sans-serif', fontWeight:900, fontSize:20, color:'var(--theme-text-pri)', marginBottom:24 }}>{title}</div>
      {children}
    </div>
  )
}

export default function Home() {
  const { view, navigate } = useOutletContext() || {}

  if (view === 'feed')        return <Feed />
  if (view === 'collections') return <CollectionsDashboard navigate={navigate} />
  if (view === 'artists')     return <SimpleView title="ARTISTS"><div style={{ fontFamily:'VT323,monospace', color:'var(--theme-text-ter)', fontSize:13 }}>Artists view coming soon.</div></SimpleView>
  if (view === 'genres')      return <SimpleView title="GENRES"><div style={{ fontFamily:'VT323,monospace', color:'var(--theme-text-ter)', fontSize:13 }}>Genres view coming soon.</div></SimpleView>
  if (view === 'readme')      return <SimpleView title="README.TXT"><div style={{ fontFamily:'VT323,monospace', color:'var(--theme-text-sec)', fontSize:13, lineHeight:1.8 }}>WELCOME TO LATE NIGHT VIBES<br/>────────────────────────<br/>A community for serious music lovers.<br/>Dig deep. Share your crate.<br/><br/>&gt; Browse the feed<br/>&gt; Save records to your collection<br/>&gt; Discover what others are digging</div></SimpleView>
  if (view === 'about')       return <SimpleView title="ABOUT"><div style={{ fontFamily:'VT323,monospace', color:'var(--theme-text-sec)', fontSize:13, lineHeight:1.8 }}>LATE NIGHT VIBES<br/>────────────────────────<br/>A sophisticated music community<br/>for serious collectors.<br/><br/>Built with React, Node.js,<br/>Discogs API and YouTube.<br/><br/>EST. 2024</div></SimpleView>

  return <CollectionsDashboard navigate={navigate} />
}
