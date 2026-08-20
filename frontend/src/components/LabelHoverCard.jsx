import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import HoverCard from './HoverCard';

const BASE = import.meta.env.VITE_API_URL;

export default function LabelHoverCard({ name, catno, children }) {
  const { data } = useQuery({
    queryKey: ['posts', { label: name }],
    queryFn: async () => {
      const res = await fetch(`${BASE}/posts?label=${encodeURIComponent(name)}&limit=10`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    staleTime: 1000 * 60 * 10,
  });

  const count = data?.total || 0;

  const content = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontFamily: 'VT323, monospace' }}>
      <p style={{ color: 'var(--charcoal)', fontSize: '14px', letterSpacing: '2px', borderBottom: '1px solid var(--border)', paddingBottom: '4px', marginBottom: '4px' }}>
        {name.toUpperCase()}
      </p>
      <p style={{ color: 'var(--grey-text)', fontSize: '11px', letterSpacing: '2px' }}>
        {count} RECORD{count !== 1 ? 'S' : ''} IN COLLECTION
      </p>
      {catno && (
        <p style={{ color: 'var(--grey-mid)', fontSize: '11px', letterSpacing: '2px' }}>
          CAT: {catno}
        </p>
      )}
      <p style={{ color: 'var(--grey-mid)', fontSize: '11px', letterSpacing: '2px', marginTop: '6px', borderTop: '1px solid var(--border)', paddingTop: '4px' }}>
        CLICK TO BROWSE LABEL
      </p>
    </div>
  );

  return (
    <HoverCard content={content}>
      <Link to={`/labels/${encodeURIComponent(name)}`} style={{ color: 'inherit', textDecoration: 'none' }}>
        {children}
      </Link>
    </HoverCard>
  );
}