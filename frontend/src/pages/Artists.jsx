import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BrowseHeader, PillList, BrowseTile, RecordThumbGrid, BrowseLoading, BrowseEmpty } from '../components/BrowseGrid';
import { useReportPanelWidth } from '../hooks/useReportPanelWidth';

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

  const isDetail = !!(selected && data?.posts);
  // Alphabetical, not the API's default (count-ish) order.
  const artists  = Array.isArray(data) ? [...data].sort((a, b) => a.artist_name.localeCompare(b.artist_name)) : [];

  // Drawer width scales to the single-artist record grid (fixed 140px
  // square tiles — the math holds there). The all-artists list is now a
  // wrapping row of variable-width pills (PillList/BrowseTile below), which
  // doesn't have a fixed per-tile width to compute a panel width from — it
  // just wraps within whatever width the panel already has, so this only
  // reports while in the detail view.
  useReportPanelWidth(isLoading || !isDetail ? null : data.posts.length, 140);

  if (isLoading) return <BrowseLoading />;

  // Single artist view
  if (isDetail) {
    return (
      <div style={{ padding: '20px' }}>
        <BrowseHeader title={selected} count={data.posts.length} onBack={() => setSelected(null)} />
        <RecordThumbGrid posts={data.posts} />
      </div>
    );
  }

  // All artists grid
  if (artists.length === 0) return <BrowseEmpty label="No artists found." />;

  return (
    <div style={{ padding: '20px' }}>
      <PillList>
        {artists.map(a => (
          <BrowseTile
            key={a.artist_name}
            label={a.artist_name}
            count={a.record_count}
            onClick={() => setSelected(a.artist_name)}
          />
        ))}
      </PillList>
    </div>
  );
}
