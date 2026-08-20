import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

const BASE = import.meta.env.VITE_API_URL;

export default function Artists({ name, filter }) {
  const artistName = filter || name || null;
  const [selected, setSelected] = useState(artistName);

  const { data, isLoading } = useQuery({
    queryKey: ['artists', selected],
    queryFn: async () => {
      const url = selected
        ? `${BASE}/artists/${encodeURIComponent(selected)}`
        : `${BASE}/artists`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });

  if (isLoading) return <Loading />;

  // Single artist view
  if (selected && data?.posts) {
    return (
      <div style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '20px' }}>
          <button onClick={() => setSelected(null)} style={{ background: 'none', border: '1px solid var(--theme-border)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontFamily: 'VT323, monospace', fontSize: 11, color: 'var(--theme-text-sec)', letterSpacing: 1 }}>← ALL</button>
          <h2 style={{ fontSize: '22px', fontWeight: 900, color: 'var(--theme-text-pri)', margin: 0 }}>{selected}</h2>
          <span style={{ fontFamily: 'VT323, monospace', fontSize: '11px', color: 'var(--theme-text-ter)', letterSpacing: '1px' }}>{data.posts.length} RECORDS</span>
        </div>
        <RecordGrid posts={data.posts} />
      </div>
    );
  }

  // All artists grid
  const artists = Array.isArray(data) ? data : [];
  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px' }}>
        {artists.map(a => (
          <div key={a.artist_name}
            onClick={() => setSelected(a.artist_name)}
            style={{ background: 'var(--theme-dark3)', borderRadius: '8px', padding: '14px', border: '1px solid var(--theme-border)', cursor: 'pointer', transition: 'border-color 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--theme-accent)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--theme-border)'}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--theme-text-pri)', marginBottom: '4px' }}>{a.artist_name}</div>
            <div style={{ fontFamily: 'VT323, monospace', fontSize: '11px', color: 'var(--theme-text-ter)', letterSpacing: '1px' }}>{a.record_count} RECORDS</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecordGrid({ posts }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
      {posts.map(p => (
        <div key={p.id} style={{ background: 'var(--theme-dark3)', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--theme-border)' }}>
          {p.cover_image || p.thumb_image
            ? <img src={p.cover_image || p.thumb_image} alt={p.title} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
            : <div style={{ width: '100%', aspectRatio: '1', background: 'var(--theme-dark2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', color: 'var(--theme-text-ter)' }}>◈</div>
          }
          <div style={{ padding: '8px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--theme-text-pri)', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
            <div style={{ fontFamily: 'VT323, monospace', fontSize: '10px', color: 'var(--theme-text-ter)' }}>{p.year || '—'}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Loading() {
  return <div style={{ padding: '24px', fontFamily: 'VT323, monospace', fontSize: '14px', color: 'var(--theme-text-ter)', letterSpacing: '2px' }}>LOADING...</div>;
}
