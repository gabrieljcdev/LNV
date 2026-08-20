import { useLayout } from '../context/LayoutContext';

const BASE = import.meta.env.VITE_API_URL;

const TABS = [
  { id: 'collections', label: 'collection' },
  { id: 'feed',        label: 'main feed' },
  null,
  { id: 'artists',     label: 'artists' },
  { id: 'genres',      label: 'genres' },
  null,
  { id: 'readme',      label: 'readme' },
  { id: 'about',       label: 'about' },
];

export default function Strip({ activeView }) {
  const { setCurrentTrack } = useLayout();

  async function handleRandom() {
    try {
      const res = await fetch(BASE + '/tracks/random');
      const data = await res.json();
      if (!data.youtube_url) return;
      setCurrentTrack({ title: data.title, artist: data.artist + ' — ' + data.album, youtubeUrl: data.youtube_url, postId: data.post_id, albumArt: data.cover_image || data.thumb_image || null });
    } catch (err) { console.error('Random error:', err); }
  }

  return (
    <div id="lnv-strip" style={{ left:0, position:'sticky', width:'320px', minWidth:'108px', height:'100vh', background:'var(--theme-sidebar)', display:'flex', flexDirection:'column', flexShrink:0, zIndex:100, borderRight:'1px solid var(--theme-border)', overflow:'hidden', transition:'background 0.8s, border-color 0.8s' }}>
      <div id="lnv-tabs" style={{ position:'absolute', left:0, top:0, width:'36px', display:'flex', flexDirection:'column', alignItems:'center', padding:'14px 0 0', gap:'3px', opacity:0 }}>
        {TABS.map((tab, i) => {
          if (!tab) return <div key={'d'+i} style={{ width:'18px', height:'1px', background:'var(--theme-border)', margin:'4px 0' }} />;
          const isActive = activeView === tab.id;
          return (
            <button key={tab.id} data-tab={tab.id}
              onClick={() => window.lnvNavigate?.(tab.id)}
              style={{ writingMode:'vertical-rl', transform:'rotate(180deg)', fontFamily:'VT323, monospace', fontSize:'11px', letterSpacing:'2px', color: isActive ? '#fff' : 'var(--theme-text-ter)', background: isActive ? 'var(--theme-accent)' : 'transparent', border: isActive ? 'none' : '1px solid var(--theme-border)', cursor:'pointer', padding:'10px 4px', width:'26px', textAlign:'center', whiteSpace:'nowrap', textTransform:'lowercase', borderRadius:'99px', transition:'color 0.2s, background 0.2s, border-color 0.8s' }}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background='var(--theme-dark3)'; e.currentTarget.style.color='var(--theme-text-pri)'; }}}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='var(--theme-text-ter)'; }}}
            >{tab.label}</button>
          );
        })}
        <div style={{ width:'18px', height:'1px', background:'var(--theme-border)', margin:'5px 0' }} />
        <button onClick={handleRandom} title="Play random track"
          style={{ color:'var(--theme-accent)', fontSize:'14px', background:'transparent', border:'1px solid var(--theme-border)', cursor:'pointer', width:'26px', height:'26px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', transition:'background 0.2s, border-color 0.8s' }}
          onMouseEnter={e => e.currentTarget.style.background='var(--theme-dark3)'}
          onMouseLeave={e => e.currentTarget.style.background='transparent'}
        >▶</button>
      </div>
      <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'flex-end', paddingBottom:'40px', overflow:'hidden' }}>
        <div id="lnv-brand" style={{ writingMode:'vertical-rl', transform:'rotate(180deg)', fontFamily:'Barlow, sans-serif', fontSize:'100px', fontWeight:900, color:'var(--theme-text-ter)', letterSpacing:'-3px', lineHeight:'36px', whiteSpace:'nowrap', opacity:1, paddingLeft:'50px', paddingRight:'30px', transition:'color 0.8s' }}>FADE</div>
      </div>
    </div>
  );
}
