import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

const API = import.meta.env.VITE_API_URL;

async function getPublicCrates() {
  const res = await fetch(`${API}/crates/public`);
  return res.json();
}

async function likeCrate(id) {
  const res = await fetch(`${API}/crates/${id}/like`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: sessionStorage.getItem('user') }),
  });
  return res.json();
}

async function followCrate(id) {
  const res = await fetch(`${API}/crates/${id}/follow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: sessionStorage.getItem('user') }),
  });
  return res.json();
}

async function duplicateCrate(id) {
  const res = await fetch(`${API}/crates/${id}/duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: sessionStorage.getItem('user') }),
  });
  return res.json();
}

const SORT_OPTIONS = ['MOST LIKED', 'NEWEST', 'MOST RECORDS'];

export default function FDD() {
  const navigate    = useNavigate();
  const queryClient = useQueryClient();
  const currentUser = sessionStorage.getItem('user');

  const [sort, setSort]               = useState('MOST LIKED');
  const [genreFilter, setGenreFilter] = useState('ALL');
  const [feedback, setFeedback]       = useState({});

  const { data: crates = [], isLoading } = useQuery({
    queryKey: ['crates-public'],
    queryFn: getPublicCrates,
  });

  const likeMutation = useMutation({
    mutationFn: likeCrate,
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: ['crates-public'] });
      setFeedback(f => ({ ...f, [id]: data.liked ? '♥ LIKED' : '♥ UNLIKED' }));
      setTimeout(() => setFeedback(f => ({ ...f, [id]: null })), 2000);
    },
  });

  const followMutation = useMutation({
    mutationFn: followCrate,
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: ['crates-public'] });
      setFeedback(f => ({ ...f, [id]: data.following ? 'FOLLOWING' : 'UNFOLLOWED' }));
      setTimeout(() => setFeedback(f => ({ ...f, [id]: null })), 2000);
    },
  });

  const dupMutation = useMutation({
    mutationFn: duplicateCrate,
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: ['crates-mine'] });
      setFeedback(f => ({ ...f, [id]: 'COPIED TO HDD\\' }));
      setTimeout(() => setFeedback(f => ({ ...f, [id]: null })), 2000);
    },
  });

  const allGenres = ['ALL', ...new Set(crates.flatMap(c => (c.genres || [])))];

  const sorted = [...crates].sort((a, b) => {
    if (sort === 'MOST LIKED')   return (b.like_count || 0) - (a.like_count || 0);
    if (sort === 'NEWEST')       return new Date(b.created_at) - new Date(a.created_at);
    if (sort === 'MOST RECORDS') return (b.record_count || 0) - (a.record_count || 0);
    return 0;
  });

  const filtered = genreFilter === 'ALL'
    ? sorted
    : sorted.filter(c => (c.genres || []).includes(genreFilter));

  return (
    <div className="font-terminal">

      {/* Header */}
      <div className="px-4 py-3 border-b border-amber-hover flex justify-between items-center">
        <span className="text-amber-mid text-base tracking-widest">
          [DIR] FDD\ — {filtered.length} COMMUNITY CRATES
        </span>
        <span className="text-amber-dim-text text-xs tracking-widest hidden sm:block">
          C:\LATE_NIGHT_VIBES\COLLECTIONS\FDD\
        </span>
      </div>

      {/* Toolbar */}
      <div className="px-4 py-2 border-b border-amber-hover flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <span className="text-amber-dim-text text-xs tracking-widest">SORT:</span>
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt}
              onClick={() => setSort(opt)}
              className={`text-xs tracking-widest border px-2 py-1 transition-all ${
                sort === opt
                  ? 'border-amber-bright text-amber-bright'
                  : 'border-amber-dim text-amber-dim-text hover:border-amber-mid hover:text-amber-mid'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>

        {allGenres.length > 1 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-amber-dim-text text-xs tracking-widest">GENRE:</span>
            {allGenres.map(g => (
              <button
                key={g}
                onClick={() => setGenreFilter(g)}
                className={`text-xs tracking-widest border px-2 py-1 transition-all ${
                  genreFilter === g
                    ? 'border-amber-bright text-amber-bright'
                    : 'border-amber-dim text-amber-dim-text hover:border-amber-mid hover:text-amber-mid'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="px-4 py-8 text-amber-muted-text tracking-widest">
          LOADING...<span className="blink">_</span>
        </div>
      )}

      {/* Empty */}
      {!isLoading && filtered.length === 0 && (
        <div className="px-4 py-8 text-amber-muted-text tracking-widest">
          NO PUBLIC CRATES YET — BE THE FIRST TO PUBLISH ONE FROM HDD\
        </div>
      )}

      {/* Crate grid */}
      {!isLoading && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px border-b border-amber-hover">
          {filtered.map(crate => {
            const isOwner = crate.author === currentUser;

            return (
              <div
                key={crate.id}
                onClick={() => navigate(`/crates/${crate.id}`)}
                className="border border-amber-hover bg-amber-bg hover:border-amber-mid hover:bg-amber-card transition-all relative p-4 flex flex-col gap-2 cursor-pointer"
              >
                {/* Like count badge */}
                <div className="absolute top-3 right-3">
                  <span className={`text-xs tracking-widest border px-1 ${
                    (crate.like_count || 0) > 0
                      ? 'border-amber-mid text-amber-mid'
                      : 'border-amber-hover text-amber-card-text'
                  }`}>
                    ♥ {crate.like_count || 0}
                  </span>
                </div>

                {/* Icon + name */}
                <div>
                  <div className="text-amber-card-text text-sm tracking-widest mb-1">[===]</div>
                  <div className="text-amber-bright text-base tracking-widest pr-14 truncate">
                    {crate.name.toUpperCase()}
                  </div>
                </div>

                {/* Author + meta */}
                <div className="text-amber-card-text text-xs tracking-widest">
                  BY <span className="text-amber-mid">@{crate.author}</span>
                  {' · '}{crate.record_count || 0} RECORDS
                </div>

                {/* Genre tags */}
                {crate.genres?.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {crate.genres.slice(0, 4).map(g => (
                      <span
                        key={g}
                        className="text-xs tracking-widest border border-amber-hover text-amber-muted-text px-1"
                      >
                        {g.toUpperCase()}
                      </span>
                    ))}
                  </div>
                )}

                {/* Description */}
                {crate.description ? (
                  <div className="text-amber-muted-text text-xs tracking-wide truncate">
                    {crate.description}
                  </div>
                ) : null}

                {/* Feedback flash */}
                {feedback[crate.id] && (
                  <div className="text-amber-bright text-xs tracking-widest">
                    {feedback[crate.id]}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 mt-auto pt-2 flex-wrap">
                  <button
                    onClick={e => { e.stopPropagation(); navigate(`/crates/${crate.id}`); }}
                    className="text-xs tracking-widest border border-amber-dim text-amber-card-text hover:border-amber-bright hover:text-amber-bright px-2 py-1 transition-all"
                  >
                    [OPEN]
                  </button>

                  {!isOwner && currentUser && (
                    <button
                      onClick={e => { e.stopPropagation(); likeMutation.mutate(crate.id); }}
                      disabled={likeMutation.isPending}
                      className="text-xs tracking-widest border border-amber-dim text-amber-card-text hover:border-amber-bright hover:text-amber-bright px-2 py-1 transition-all"
                    >
                      [♥ LIKE]
                    </button>
                  )}

                  {!isOwner && currentUser && (
                    <button
                      onClick={e => { e.stopPropagation(); followMutation.mutate(crate.id); }}
                      disabled={followMutation.isPending}
                      className="text-xs tracking-widest border border-amber-dim text-amber-card-text hover:border-amber-mid hover:text-amber-mid px-2 py-1 transition-all"
                    >
                      [FOLLOW]
                    </button>
                  )}

                  {!isOwner && currentUser && (
                    <button
                      onClick={e => { e.stopPropagation(); dupMutation.mutate(crate.id); }}
                      disabled={dupMutation.isPending}
                      className="text-xs tracking-widest border border-amber-dim text-amber-card-text hover:border-amber-mid hover:text-amber-mid px-2 py-1 transition-all"
                    >
                      [COPY]
                    </button>
                  )}

                  {isOwner && (
                    <span className="text-xs tracking-widest text-amber-card-text px-2 py-1">
                      YOUR CRATE
                    </span>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
