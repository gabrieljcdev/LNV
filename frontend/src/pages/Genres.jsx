import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BrowseHeader, PillList, BrowseTile, RecordThumbGrid, BrowseLoading, BrowseEmpty } from '../components/BrowseGrid';
import { useReportPanelWidth } from '../hooks/useReportPanelWidth';

const BASE = import.meta.env.VITE_API_URL;

async function getGenres() {
  const res = await fetch(`${BASE}/posts?limit=200`);
  if (!res.ok) throw new Error('Failed');
  const data = await res.json();
  const map = {};
  data.posts.forEach(post => {
    post.genres?.forEach(g => {
      if (!map[g]) map[g] = { count: 0, posts: [] };
      map[g].count++;
      map[g].posts.push(post);
    });
  });
  return Object.entries(map)
    .sort((a, b) => a[0].localeCompare(b[0])) // alphabetical, not by count
    .map(([name, { count, posts }]) => ({ name, count, posts }));
}

export default function Genres({ filter }) {
  const [selected, setSelected] = useState(filter || null);

  const { data: genres = [], isLoading } = useQuery({
    queryKey: ['genres-panel'],
    queryFn: getGenres,
  });

  const selectedGenre = selected ? genres.find(g => g.name === selected) : null;
  const isDetail = !!selectedGenre;

  // Drawer width scales to the single-genre record grid (fixed 140px square
  // tiles). The all-genres list is a wrapping row of variable-width pills
  // (PillList/BrowseTile) with no fixed per-tile width to size from — it
  // just wraps within whatever width the panel already has.
  useReportPanelWidth(isLoading || !isDetail ? null : selectedGenre.posts.length, 140);

  if (isLoading) return <BrowseLoading />;
  if (genres.length === 0) return <BrowseEmpty label="No genres found." />;

  if (isDetail) {
    return (
      <div style={{ padding: '20px' }}>
        <BrowseHeader title={selected} count={selectedGenre.count} onBack={() => setSelected(null)} />
        <RecordThumbGrid posts={selectedGenre.posts} />
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      <PillList>
        {genres.map(({ name, count }) => (
          <BrowseTile key={name} label={name} count={count} onClick={() => setSelected(name)} />
        ))}
      </PillList>
    </div>
  );
}
