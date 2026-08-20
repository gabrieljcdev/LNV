import { useQuery } from '@tanstack/react-query';
import { useLayout } from '../context/LayoutContext';

const BASE = import.meta.env.VITE_API_URL;

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return (
    String(d.getDate()).padStart(2, '0') + '/' +
    String(d.getMonth() + 1).padStart(2, '0') + '/' +
    String(d.getFullYear()).slice(2) + ' ' +
    String(d.getHours()).padStart(2, '0') + ':' +
    String(d.getMinutes()).padStart(2, '0')
  );
}

export default function Logs() {
  const { closeD3, scrollToPost } = useLayout() || {};

  const { data, isLoading } = useQuery({
    queryKey: ['posts', 'logs'],
    queryFn: async () => {
      const res = await fetch(`${BASE}/posts?limit=100`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });

  const posts = data?.posts || [];

  return (
    <div style={{ fontFamily: 'VT323, monospace' }}>

      {/* Header */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'var(--charcoal)', fontSize: '15px', letterSpacing: '2px' }}>
          ACTIVITY STREAM
        </span>
        <span style={{ color: 'var(--grey-mid)', fontSize: '12px', letterSpacing: '1px' }}>
          {posts.length} ENTRIES
        </span>
      </div>

      {/* Content */}
      {isLoading ? (
        <div style={{ padding: '24px 16px', color: 'var(--grey-mid)', letterSpacing: '2px', fontSize: '13px' }}>
          LOADING...<span className="blink">_</span>
        </div>
      ) : posts.length === 0 ? (
        <div style={{ padding: '24px 16px', color: 'var(--grey-mid)', letterSpacing: '2px', fontSize: '13px' }}>
          NO ACTIVITY YET
        </div>
      ) : (
        posts.map(post => {
          const artist = post.artists?.[0]?.artist_name || 'UNKNOWN';
          return (
            <div
              key={post.id}
              // scrollToPost only finds the post if Feed is mounted in the same
              // tree (true when this renders inside ContentPanel's drawer, which
              // sits over the feed; a no-op on the standalone /logs route where
              // Feed isn't mounted — fine for now, Phase 3 reworks this shell).
              onClick={() => { closeD3?.(); scrollToPost?.(post.id); }}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '8px 16px',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--grey-light)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ color: 'var(--grey-mid)', fontSize: '12px', flexShrink: 0, width: '120px' }}>
                [{formatDate(post.created_at)}]
              </span>
              <span style={{ color: 'var(--grey-text)', fontSize: '12px', flexShrink: 0, width: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {post.user?.username || 'lnv_admin'}
              </span>
              <span style={{ color: 'var(--grey-mid)', fontSize: '12px', flexShrink: 0 }}>→</span>
              <span style={{ color: 'var(--charcoal)', fontSize: '13px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {artist.toUpperCase()} — {post.title.toUpperCase()}
              </span>
              <span style={{ color: 'var(--lnv-orange)', fontSize: '11px', border: '1px solid var(--border)', padding: '1px 8px', flexShrink: 0 }}>
                [OPEN]
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}