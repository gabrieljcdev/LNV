import { useEffect, useRef, useState } from 'react';
import { useLayout } from '../context/LayoutContext';

const BASE = import.meta.env.VITE_API_URL;

export default function LandingPanel() {
  const { landingPanelRef, handleFeedScroll } = useLayout();
  const [stats, setStats] = useState({ records: 0, members: 0, lastPost: null });
  const clockRef = useRef(null);
  const dayRef = useRef(null);

  useEffect(() => {
    fetch(BASE + '/netlink/stats').then(r => r.json()).then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    function update() {
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const days = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
      const h = now.getHours();
      const period = h < 4 ? 'EARLY HOURS' : h < 12 ? 'MORNING' : h < 17 ? 'AFTERNOON' : h < 19 ? 'LATE AFTERNOON' : h < 21 ? 'EVENING' : h < 23 ? 'NIGHT' : 'LATE NIGHT';
      if (clockRef.current) clockRef.current.textContent = pad(h) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
      if (dayRef.current) dayRef.current.textContent = days[now.getDay()] + ' · ' + period;
    }
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const el = landingPanelRef?.current;
    if (!el) return;
    const stop = e => e.stopPropagation();
    el.addEventListener('wheel', stop, { passive: false });
    return () => el.removeEventListener('wheel', stop);
  }, [landingPanelRef]);

  function formatLastPost(ts) {
    if (!ts) return '—';
    const d = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    return d < 60 ? d + 's' : d < 3600 ? Math.floor(d/60) + 'm' : d < 86400 ? Math.floor(d/3600) + 'h' : Math.floor(d/86400) + 'd';
  }

  function handleExplore() {
    const outer = document.getElementById('scroll-outer');
    const spacer = document.getElementById('scroll-spacer');
    if (!outer || !spacer) return;
    window.lnvSpacerLocked = true;
    outer.scrollTop = parseFloat(spacer.style.height) * 0.45;
    outer.dispatchEvent(new Event('scroll'));
    setTimeout(() => {
      window.lnvSpacerLocked = false;
      window.lnvShowCollections?.();
    }, 100);
  }


  return (
    <div id="lnv-landing" ref={landingPanelRef} style={{ height: '100vh', background: 'var(--theme-sidebar)', display: 'flex', flexDirection: 'column', flexShrink: 0, borderRight: '1px solid var(--theme-border)', overflow: 'hidden', transition: 'background 0.8s, border-color 0.8s' }}>
      <div style={{ flex:1, display:'flex', flexDirection:'column', padding:'28px 28px 0', overflow:'hidden', background:'var(--theme-sidebar)', transition:'background 0.8s' }}>
        <div ref={clockRef} style={{ fontSize:'64px', fontWeight:900, color:'var(--theme-text-pri)', letterSpacing:'-3px', lineHeight:1, marginBottom:'4px', fontFamily:'Barlow,sans-serif', transition:'color 0.8s' }}>00:00:00</div>
        <div ref={dayRef} style={{ fontFamily:'VT323,monospace', fontSize:'11px', letterSpacing:'3px', color:'var(--theme-text-ter)', marginBottom:'28px', transition:'color 0.8s' }}>— · —</div>
        <div style={{ width:'32px', height:'1px', background:'var(--theme-border)', marginBottom:'20px' }} />
        <p style={{ fontSize:'14px', lineHeight:1.7, color:'var(--theme-text-sec)', margin:'0 0 6px', maxWidth:'340px', fontFamily:'Barlow,sans-serif', transition:'color 0.8s' }}>A community for serious music lovers. Dig deep. Share your crate. Discover what others are digging.</p>
        <p style={{ fontFamily:'VT323,monospace', fontSize:'11px', letterSpacing:'2px', color:'var(--theme-text-ter)', margin:'0 0 28px', transition:'color 0.8s' }}>EST. 2024</p>
        <div style={{ display:'flex', gap:'28px', marginBottom:'32px' }}>
          {[{ value: stats.records.toLocaleString(), label: 'RECORDS' }, { value: stats.members.toLocaleString(), label: 'MEMBERS' }, { value: formatLastPost(stats.lastPost), label: 'LAST POST' }].map(s => (
            <div key={s.label}>
              <div style={{ fontSize:'28px', fontWeight:900, color:'var(--theme-text-pri)', lineHeight:1, fontFamily:'Barlow,sans-serif', transition:'color 0.8s' }}>{s.value}</div>
              <div style={{ fontFamily:'VT323,monospace', fontSize:'10px', letterSpacing:'2px', color:'var(--theme-text-ter)', marginTop:'3px', transition:'color 0.8s' }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
          <button onClick={handleExplore} style={{ fontFamily:'VT323,monospace', fontSize:'12px', letterSpacing:'0.1em', padding:'6px 18px', borderRadius:'99px', border:'none', background:'var(--theme-accent)', color:'#fff', cursor:'pointer' }}>EXPLORE FEED →</button>
          {['JOIN','LOG IN'].map(label => (
            <button key={label} style={{ fontFamily:'VT323,monospace', fontSize:'12px', letterSpacing:'0.1em', padding:'6px 18px', borderRadius:'99px', border:'1px solid var(--theme-border)', background:'transparent', color:'var(--theme-text-sec)', cursor:'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.background='var(--theme-dark3)'; e.currentTarget.style.color='var(--theme-text-pri)'; }}
              onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='var(--theme-text-sec)'; }}
            >{label}</button>
          ))}
        </div>
      </div>
      <div style={{ padding:'20px 28px', borderTop:'1px solid var(--theme-border)', flexShrink:0, background:'var(--theme-sidebar)', transition:'background 0.8s, border-color 0.8s' }}>
        <span style={{ fontFamily:'VT323,monospace', fontSize:'10px', letterSpacing:'2px', color:'var(--theme-text-ter)', transition:'color 0.8s' }}>SCROLL RIGHT TO EXPLORE THE FEED →</span>
      </div>
    </div>
  );
}
