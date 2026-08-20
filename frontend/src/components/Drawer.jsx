import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLayout } from '../context/LayoutContext';

const BASE = import.meta.env.VITE_API_URL;

const TXT_CONTENT = {
  readme: { lines: ['WELCOME TO LATE NIGHT VIBES','────────────────────────────────','A community for serious music lovers.','Dig deep. Share your crate.','',"> Browse the feed","> Save records to your collection","> Discover what others are digging","> Click ▶ for a random track"] },
  about:  { lines: ['ABOUT LATE NIGHT VIBES','────────────────────────────────','A sophisticated music community','for serious collectors.','','Built with React, Node.js,','Discogs API and YouTube API.','','EST. 2024'] },
  donate: { lines: ['DONATE.TXT','────────────────────────────────','LNV is free and always will be.','If you enjoy it, consider','supporting the project.','',"> hello@latenightvibes.com"] },
  contact:{ lines: ['CONTACT.TXT','────────────────────────────────',"> hello@latenightvibes.com","> @latenightvibes",'','WE DIG DEEP'] },
};

export default function Drawer() {
  const { activeTab, drawerOpen, drawerIsLanding, openD3 } = useLayout();
  const [newCrateName, setNewCrateName] = useState('');
  const [showNewCrate, setShowNewCrate] = useState(false);

  const username = sessionStorage.getItem('user');
  const isAdmin  = username === 'lnv_admin';

  const { data: crates = [] } = useQuery({
    queryKey: ['crates-mine', username],
    queryFn: async () => {
      if (!username) return [];
      const res = await fetch(`${BASE}/crates/mine?username=${username}`);
      return res.json();
    },
    enabled: !!username,
  });

  const { data: artists = [] } = useQuery({
    queryKey: ['artists'],
    queryFn: async () => {
      const res = await fetch(`${BASE}/artists`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: genres = [] } = useQuery({
    queryKey: ['genres'],
    queryFn: async () => {
      const res = await fetch(`${BASE}/genres`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: logs = [] } = useQuery({
    queryKey: ['logs'],
    queryFn: async () => {
      if (!isAdmin) return [];
      const res = await fetch(`${BASE}/logs`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!isAdmin,
  });

  return (
    <div
      id="lnv-drawer"
      style={{
        width: '260px',
        minWidth: '0px',
        height: '100vh',
        background: 'var(--theme-sidebar)',
        borderRight: '1px solid var(--theme-border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
        transition: 'background 0.8s, border-color 0.8s',
      }}
    >
      {/* LANDING VIEW — logo + scroll hint */}
      {drawerIsLanding && (
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'16px', position:'relative', overflow:'hidden' }}>
          <div data-logo style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'16px', opacity:1 }}>
            {/* Logo bars — colour follows theme */}
            <svg width="150" height="150" viewBox="0 0 90 90" fill="none">
              <rect x="8"  y="8"  width="74" height="13" rx="2" fill="var(--theme-text-ter)"/>
              <rect x="8"  y="27" width="52" height="13" rx="2" fill="var(--theme-text-ter)"/>
              <rect x="8"  y="46" width="74" height="13" rx="2" fill="var(--theme-text-ter)"/>
              <rect x="8"  y="65" width="38" height="13" rx="2" fill="var(--theme-text-ter)"/>
            </svg>
            <div style={{ fontFamily:'VT323,monospace', fontSize:'12px', letterSpacing:'3px', color:'var(--theme-text-ter)', transition:'color 0.8s' }}>
              LATE NIGHT VIBES
            </div>
          </div>
          <div data-hint style={{ position:'absolute', bottom:'24px', fontFamily:'VT323,monospace', fontSize:'11px', letterSpacing:'3px', color:'var(--theme-text-ter)', animation:'pulse 2s ease-in-out infinite', transition:'color 0.8s' }}>
            SCROLL TO EXPLORE →
          </div>
        </div>
      )}

      {/* DIRECTORY VIEW */}
      {!drawerIsLanding && (
        <>
          {/* Header */}
          <div style={{ padding:'16px 18px 12px', borderBottom:'1px solid var(--theme-border)', flexShrink:0, transition:'border-color 0.8s' }}>
            <div style={{ fontSize:'18px', fontWeight:900, color:'var(--theme-text-pri)', letterSpacing:'-1px', marginBottom:'12px', fontFamily:'Barlow, sans-serif', transition:'color 0.8s' }}>
              Late Night Vibes
            </div>
            {username ? (
              <div style={{ display:'flex', alignItems:'center', gap:'10px', cursor:'pointer' }} onClick={() => openD3('profile', { username })}>
                <div style={{ width:'32px', height:'32px', borderRadius:'50%', background:'var(--theme-accent)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', fontWeight:900, color:'#fff', flexShrink:0, transition:'background 0.8s' }}>
                  {username[0].toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize:'13px', fontWeight:700, color:'var(--theme-text-pri)', fontFamily:'Barlow, sans-serif', transition:'color 0.8s' }}>{username}</div>
                  <div style={{ fontFamily:'VT323,monospace', fontSize:'11px', color:'var(--theme-text-ter)', letterSpacing:'1px', transition:'color 0.8s' }}>{crates.length} crates</div>
                </div>
              </div>
            ) : (
              <a href="/login" style={{ fontFamily:'VT323,monospace', fontSize:'13px', color:'var(--theme-accent)', letterSpacing:'1px' }}>LOGIN →</a>
            )}
          </div>

          {/* Body */}
          <div style={{ flex:1, overflowY:'auto' }}>

            {activeTab === 'collection' && (
              <>
                <Section label="COLLECTION" />
                {crates.length === 0 && <Empty label="No crates yet." />}
                {crates.slice(0,5).map(c => (
                  <NavItem key={c.id} label={c.name} meta={`${c.record_count||0} rec`} onClick={() => openD3('crate',{id:c.id,name:c.name})} />
                ))}
                {crates.length > 5 && <NavItem label={`+${crates.length-5} more`} muted onClick={() => openD3('hdd')} />}
                <Divider />
                {showNewCrate ? (
                  <div style={{ padding:'8px 18px', display:'flex', gap:'6px' }}>
                    <input autoFocus value={newCrateName} onChange={e => setNewCrateName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Escape') { setShowNewCrate(false); setNewCrateName(''); } }}
                      placeholder="crate name..."
                      style={{ flex:1, fontFamily:'VT323,monospace', fontSize:'13px', letterSpacing:'1px', background:'var(--theme-dark3)', border:'1px solid var(--theme-border)', borderRadius:'4px', padding:'4px 8px', color:'var(--theme-text-pri)', outline:'none' }} />
                    <button onClick={() => { setShowNewCrate(false); setNewCrateName(''); }}
                      style={{ background:'none', border:'none', cursor:'pointer', color:'var(--theme-text-sec)', fontSize:'13px' }}>✕</button>
                  </div>
                ) : (
                  <NavItem label="+ New crate" muted onClick={() => setShowNewCrate(true)} />
                )}
              </>
            )}

            {activeTab === 'profile' && (
              <>
                <Section label="PROFILE" />
                {!username ? (
                  <div style={{ padding:'16px 18px' }}>
                    <a href="/login" style={{ fontFamily:'VT323,monospace', fontSize:'13px', color:'var(--theme-accent)', letterSpacing:'1px' }}>LOGIN →</a>
                  </div>
                ) : (
                  <>
                    <div style={{ padding:'14px 18px', display:'flex', flexDirection:'column', gap:'8px' }}>
                      <Stat label="CRATES"  value={crates.length} />
                      <Stat label="RECORDS" value={crates.reduce((n,c) => n+(c.record_count||0), 0)} />
                    </div>
                    <Divider />
                    <NavItem label="View full profile" onClick={() => openD3('profile',{username})} />
                    {isAdmin && <NavItem label="Admin: Logs" onClick={() => openD3('logs')} />}
                  </>
                )}
              </>
            )}

            {activeTab === 'artists' && (
              <>
                <Section label="ARTISTS" />
                {artists.length === 0 && <Empty label="No artists found." />}
                {artists.map(a => (
                  <NavItem key={a.id||a.artist_name} label={a.artist_name} meta={a.record_count ? `${a.record_count}` : undefined} onClick={() => openD3('artists',{name:a.artist_name})} />
                ))}
              </>
            )}

            {activeTab === 'genres' && (
              <>
                <Section label="GENRES" />
                {genres.length === 0 && <Empty label="No genres found." />}
                {genres.map(g => (
                  <NavItem key={g.id||g.genre} label={g.genre} meta={g.record_count ? `${g.record_count}` : undefined} onClick={() => openD3('genres',{name:g.genre})} />
                ))}
              </>
            )}

            {activeTab === 'logs' && (
              <>
                <Section label="LOGS" />
                {!isAdmin ? <Empty label="Admin only." /> : logs.length === 0 ? <Empty label="No logs yet." /> : (
                  logs.slice(0,30).map((log,i) => (
                    <div key={i} style={{ padding:'6px 18px', borderBottom:'1px solid var(--theme-border)' }}>
                      <div style={{ fontFamily:'VT323,monospace', fontSize:'11px', color:'var(--theme-text-sec)', letterSpacing:'0.5px', lineHeight:'1.5' }}>
                        {log.action || log.message || JSON.stringify(log)}
                      </div>
                      {log.created_at && <div style={{ fontFamily:'VT323,monospace', fontSize:'10px', color:'var(--theme-text-ter)' }}>{new Date(log.created_at).toLocaleString()}</div>}
                    </div>
                  ))
                )}
              </>
            )}

            {activeTab === 'readme' && <TxtView name="readme" />}
            {activeTab === 'about'  && <TxtView name="about"  />}

          </div>
        </>
      )}
    </div>
  );
}

function TxtView({ name }) {
  const content = TXT_CONTENT[name];
  if (!content) return null;
  return (
    <div style={{ padding:'14px 18px' }}>
      {content.lines.map((line,i) => (
        <div key={i} style={{
          fontFamily:'VT323,monospace', fontSize:'13px', letterSpacing:'0.5px', lineHeight:'1.7',
          height: line==='' ? '8px' : undefined,
          color: line.startsWith('─') ? 'var(--theme-border)'
               : line.startsWith('>') ? 'var(--theme-text-sec)'
               : 'var(--theme-text-pri)',
          transition: 'color 0.8s',
        }}>
          {line || '\u00A0'}
        </div>
      ))}
    </div>
  );
}

function Section({ label }) {
  return <div style={{ padding:'10px 18px 4px', fontFamily:'VT323,monospace', fontSize:'10px', letterSpacing:'3px', color:'var(--theme-text-ter)', transition:'color 0.8s' }}>{label}</div>;
}
function Divider() {
  return <div style={{ height:'1px', background:'var(--theme-border)', margin:'4px 0', transition:'background 0.8s' }} />;
}
function Empty({ label }) {
  return <div style={{ padding:'10px 18px', fontFamily:'VT323,monospace', fontSize:'12px', color:'var(--theme-text-ter)' }}>{label}</div>;
}
function Stat({ label, value }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
      <span style={{ fontFamily:'VT323,monospace', fontSize:'11px', letterSpacing:'2px', color:'var(--theme-text-ter)', transition:'color 0.8s' }}>{label}</span>
      <span style={{ fontFamily:'Barlow,sans-serif', fontSize:'20px', fontWeight:900, color:'var(--theme-text-pri)', lineHeight:1, transition:'color 0.8s' }}>{value}</span>
    </div>
  );
}
function NavItem({ label, meta, onClick, muted }) {
  return (
    <div
      onClick={onClick}
      style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 18px', cursor:onClick?'pointer':'default', fontSize:'13px', fontWeight:muted?400:500, color:muted?'var(--theme-text-ter)':'var(--theme-text-pri)', fontFamily:'Barlow, sans-serif', transition:'color 0.3s' }}
      onMouseEnter={e => { if(onClick) e.currentTarget.style.background='var(--theme-dark3)'; }}
      onMouseLeave={e => { e.currentTarget.style.background='transparent'; }}
    >
      <span>{label}</span>
      {meta && <span style={{ fontFamily:'VT323,monospace', fontSize:'11px', color:'var(--theme-text-ter)', letterSpacing:'1px' }}>{meta}</span>}
    </div>
  );
}
