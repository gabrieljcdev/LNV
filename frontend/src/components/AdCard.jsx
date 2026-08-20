export default function AdCard() {
  return (
    <div style={{
      scrollSnapAlign: 'start',
      flexShrink:      0,
      width:           '200px',
      height:          'calc(100% - 4px)',
      background:      'var(--pastel-blue)',
      borderRadius:    '10px',
      border:          '1px solid var(--pastel-blue-mid)',
      display:         'flex',
      flexDirection:   'column',
      alignItems:      'center',
      justifyContent:  'center',
      gap:             '8px',
    }}>
      <div style={{ fontFamily:'VT323,monospace', fontSize:'10px', letterSpacing:'3px', color:'var(--pastel-blue-dark)', opacity:0.6 }}>
        SPONSORED
      </div>
      <div style={{ width:'80px', height:'80px', background:'var(--pastel-blue-mid)', borderRadius:'50%', opacity:0.3 }} />
      <div style={{ fontFamily:'VT323,monospace', fontSize:'10px', letterSpacing:'2px', color:'var(--pastel-blue-dark)', opacity:0.4 }}>
        AD SPACE
      </div>
    </div>
  );
}