import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BrowseHeader, PillList, BrowseTile, RecordThumbGrid, BrowseLoading, BrowseEmpty } from '../components/BrowseGrid';
import { useReportPanelWidth } from '../hooks/useReportPanelWidth';

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
    .sort((a, b) => a[0].localeCompare(b[0])) // alphabetical, not by count
    .map(([name, { count, posts }]) => ({ name, count, posts }));
}

export default function Labels({ filter }) {
  const [selected, setSelected] = useState(filter || null);

  const { data: labels = [], isLoading } = useQuery({
    queryKey: ['labels-panel'],
    queryFn: getLabels,
  });

  const selectedLabel = selected ? labels.find(l => l.name === selected) : null;
  const isDetail = !!selectedLabel;

  // Drawer width scales to the single-label record grid (fixed 140px square
  // tiles). The all-labels list is a wrapping row of variable-width pills
  // (PillList/BrowseTile) with no fixed per-tile width to size from — it
  // just wraps within whatever width the panel already has.
  useReportPanelWidth(isLoading || !isDetail ? null : selectedLabel.posts.length, 140);

  if (isLoading) return <BrowseLoading />;
  if (labels.length === 0) return <BrowseEmpty label="No labels found." />;

  if (isDetail) {
    return (
      <div style={{ padding: '20px' }}>
        <BrowseHeader title={selected} count={selectedLabel.count} onBack={() => setSelected(null)} />
        <RecordThumbGrid posts={selectedLabel.posts} />
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      <PillList>
        {labels.map(({ name, count }) => (
          <BrowseTile key={name} label={name} count={count} onClick={() => setSelected(name)} />
        ))}
      </PillList>
    </div>
  );
}
