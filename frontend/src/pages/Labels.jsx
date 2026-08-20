import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

const BASE = import.meta.env.VITE_API_URL;

async function getLabels() {
  const res = await fetch(`${BASE}/posts?limit=200`);
  if (!res.ok) throw new Error('Failed');
  const data = await res.json();
  const map = {};
  data.posts.forEach(post => {
    post.labels?.forEach(l => {
      const name = l.label_name;
      if (!name) return;
      if (!map[name]) map[name] = { count: 0, posts: [] };
      map[name].count++;
      map[name].posts.push(post);
    });
  });
  return Object.entries(map)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([name, { count, posts }]) => ({ name, count, posts }));
}

export default function Labels({ filter }) {
  const [selected, setSelected] = useState(filter || null);

  const { data: labels = [], isLoading } = useQuery({
    queryKey: ['labels-panel'],
    queryFn: getLabels,
  });

  if (isLoading) return <Empty label="Loading..." />;
  if (labels.length === 0) return <Empty label="No labels found." />;

  const selectedLabel = selected ? labels.find(l => l.name === selected) : null;

  if (selected && selectedLabel) {
    return (
      <div style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <button onClick={() => setSelected(null)} style={{ background: 'none', border: '1px solid var(--theme-border)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontFamily: 'VT323, monospace', fontSize: 11, color: 'var(--theme-text-sec)', letterSpacing: 1 }}>← ALL</button>
          <span style={{ fontSize: 18, fontWeight: 900, color: 'var(--theme-text-pri)' }}>{selected}</span>
          <span style={{ fontFamily: 'VT323, monospace', fontSize: 11, color: 'var(--theme-text-ter)', letterSpacing: 1 }}>{selectedLabel.count} RECORDS</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
          {selectedLabel.posts.map(p => (
            <div key={p.id} style={{ background: 'var(--theme-dark3)', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--theme-border)' }}>
              {p.cover_image || p.thumb_image
                ? <img src={p.cover_image || p.thumb_image} alt={p.title} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
                : <div style={{ width: '100%', aspectRatio: '1', background: 'var(--theme-dark2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: 'var(--theme-text-ter)' }}>◈</div>
              }
              <div style={{ padding: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--theme-text-pri)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                <div style={{ fontFamily: 'VT323, monospace', fontSize: 10, color: 'var(--theme-text-ter)' }}>{p.year || '—'}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px' }}>
        {labels.map(({ name, count }) => (
          <div key={name} onClick={() => setSelected(name)}
            style={{ background: 'var(--theme-dark3)', borderRadius: '8px', padding: '14px', border: '1px solid var(--theme-border)', cursor: 'pointer', transition: 'border-color 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--theme-accent)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--theme-border)'}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--theme-text-pri)', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
            <div style={{ fontFamily: 'VT323, monospace', fontSize: '11px', color: 'var(--theme-text-ter)', letterSpacing: '1px' }}>{count} {count === 1 ? 'RECORD' : 'RECORDS'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Empty({ label }) {
  return <div style={{ padding: '32px 20px', fontFamily: 'VT323, monospace', fontSize: '13px', letterSpacing: '2px', color: 'var(--theme-text-ter)' }}>{label}</div>;
}
