import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const BASE = import.meta.env.VITE_API_URL;

function RecordGrid({ posts }) {
  if (!posts?.length) return (
    <div style={{ padding: '20px', fontFamily: 'VT323, monospace', fontSize: '13px', color: 'var(--grey-mid)', letterSpacing: '2px' }}>
      NO RECORDS YET
    </div>
  );
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px', padding: '16px' }}>
      {posts.map(p => (
        <div key={p.id} style={{ background: 'var(--off-white)', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)', cursor: 'pointer' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--grey-light)'}
          onMouseLeave={e => e.currentTarget.style.background = 'var(--off-white)'}>
          {p.cover_image || p.thumb_image
            ? <img src={p.cover_image || p.thumb_image} alt={p.title} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
            : <div style={{ width: '100%', aspectRatio: '1', background: 'var(--pastel-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', color: 'var(--pastel-blue-dark)' }}>◈</div>
          }
          <div style={{ padding: '7px 8px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--charcoal)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '2px' }}>{p.title}</div>
            <div style={{ fontFamily: 'VT323, monospace', fontSize: '10px', color: 'var(--grey-mid)' }}>{p.year || '—'}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Profile({ username: propUsername }) {
  const { username: paramUsername } = useParams();
  const username     = propUsername || paramUsername;
  const queryClient  = useQueryClient();
  const loggedInUser = sessionStorage.getItem('user');
  const isOwner      = loggedInUser === username;

  const [activeTab, setActiveTab]       = useState('COLLECTION');
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [bioDraft, setBioDraft]         = useState('');

  const { data: profile, isLoading } = useQuery({
    queryKey: ['user-manifest', username],
    queryFn: async () => {
      const res = await fetch(`${BASE}/users/${username}/manifest`);
      if (!res.ok) throw new Error('Failed to load manifest');
      return res.json();
    },
    enabled: !!username,
  });

  // Fetch user's posts for collection grid
  const { data: userPosts = [] } = useQuery({
    queryKey: ['user-posts', username],
    queryFn: async () => {
      const res = await fetch(`${BASE}/posts?username=${username}&limit=100`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.posts || [];
    },
    enabled: !!username,
  });

  const bioMutation = useMutation({
    mutationFn: async (newBio) => {
      const res = await fetch(`${BASE}/users/${username}/bio`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ bio: newBio }),
      });
      if (!res.ok) throw new Error('Failed to update bio');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['user-manifest', username]);
      setIsEditingBio(false);
    },
  });

  if (isLoading) return (
    <div style={{ padding: '24px', fontFamily: 'VT323, monospace', fontSize: '14px', color: 'var(--grey-mid)', letterSpacing: '2px' }}>
      LOADING...
    </div>
  );

  if (!profile) return (
    <div style={{ padding: '24px', fontFamily: 'VT323, monospace', fontSize: '14px', color: 'var(--grey-mid)', letterSpacing: '2px' }}>
      USER NOT FOUND
    </div>
  );

  const { user, stats, favorites, crates } = profile;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--off-white)', color: 'var(--charcoal)' }}>

      {/* ── HEADER ── */}
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', background: 'var(--white)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {/* Avatar */}
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--gunmetal)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 900, color: 'var(--pastel-blue)', flexShrink: 0 }}>
              {username?.[0]?.toUpperCase()}
            </div>
            <div>
              <h1 style={{ fontSize: '20px', fontWeight: 900, color: 'var(--charcoal)', letterSpacing: '-0.5px', marginBottom: '2px' }}>
                {username?.toUpperCase()}
              </h1>
              <p style={{ fontFamily: 'VT323, monospace', fontSize: '11px', color: 'var(--grey-mid)', letterSpacing: '1px' }}>
                JOINED {user?.created_at?.split(' ')[0]}
              </p>
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', gap: '16px', flexShrink: 0 }}>
            {[
              { label: 'RECORDS', value: stats?.uploads || 0 },
              { label: 'CRATES',  value: stats?.crates  || 0 },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--charcoal)' }}>{s.value}</div>
                <div style={{ fontFamily: 'VT323, monospace', fontSize: '10px', color: 'var(--grey-mid)', letterSpacing: '2px' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Bio */}
        <div style={{ borderLeft: '2px solid var(--grey-light)', paddingLeft: '14px', marginBottom: '16px' }}>
          {isEditingBio ? (
            <div>
              <textarea
                value={bioDraft}
                onChange={e => setBioDraft(e.target.value)}
                rows={3}
                style={{ width: '100%', padding: '8px', background: 'var(--grey-light)', border: '1px solid var(--border)', color: 'var(--charcoal)', fontSize: '13px', outline: 'none', borderRadius: '4px', resize: 'vertical', fontFamily: 'Barlow, sans-serif' }}
              />
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                <button onClick={() => bioMutation.mutate(bioDraft)} style={{ fontFamily: 'VT323, monospace', fontSize: '12px', color: 'var(--charcoal)', background: 'none', border: '1px solid var(--border)', padding: '2px 10px', cursor: 'pointer', borderRadius: '3px' }}>
                  [SAVE]
                </button>
                <button onClick={() => setIsEditingBio(false)} style={{ fontFamily: 'VT323, monospace', fontSize: '12px', color: 'var(--grey-mid)', background: 'none', border: 'none', cursor: 'pointer' }}>
                  [CANCEL]
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => isOwner && (setBioDraft(user?.bio || ''), setIsEditingBio(true))}
              style={{ cursor: isOwner ? 'pointer' : 'default' }}
            >
              <p style={{ fontSize: '13px', fontStyle: 'italic', color: 'var(--grey-text)' }}>
                "{user?.bio || (isOwner ? 'No bio set. Click to edit...' : 'No bio.')}"
              </p>
              {isOwner && (
                <span style={{ fontFamily: 'VT323, monospace', fontSize: '11px', color: 'var(--grey-mid)', opacity: 0.5 }}>
                  [EDIT]
                </span>
              )}
            </div>
          )}
        </div>

        {/* Favorites */}
        {(favorites?.artists?.length > 0 || favorites?.labels?.length > 0 || favorites?.genres?.length > 0) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
            {[
              { label: 'TOP ARTISTS', items: favorites?.artists?.map(a => a.artist_name) },
              { label: 'TOP LABELS',  items: favorites?.labels?.map(l => l.label_name) },
              { label: 'TOP GENRES',  items: favorites?.genres },
            ].map(({ label, items }) => (
              <div key={label}>
                <p style={{ fontFamily: 'VT323, monospace', fontSize: '10px', letterSpacing: '2px', color: 'var(--grey-mid)', marginBottom: '6px' }}>{label}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {items?.slice(0, 5).map(item => (
                    <span key={item} style={{ fontFamily: 'VT323, monospace', fontSize: '11px', background: 'var(--pastel-blue)', color: 'var(--gunmetal)', padding: '1px 8px', borderRadius: '8px', letterSpacing: '1px' }}>
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── TABS ── */}
      <div style={{ display: 'flex', padding: '0 24px', gap: '24px', borderBottom: '1px solid var(--border)', background: 'var(--white)', flexShrink: 0 }}>
        {['COLLECTION', 'CRATES', 'LOGS'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding:      '12px 0',
              fontFamily:   'VT323, monospace',
              fontSize:     '12px',
              letterSpacing:'2px',
              color:        activeTab === tab ? 'var(--charcoal)' : 'var(--grey-mid)',
              borderBottom: activeTab === tab ? '2px solid var(--charcoal)' : '2px solid transparent',
              background:   'transparent',
              border:       'none',
              borderBottom: activeTab === tab ? '2px solid var(--charcoal)' : '2px solid transparent',
              cursor:       'pointer',
              transition:   'color 0.15s',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── CONTENT ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* Collection grid */}
        {activeTab === 'COLLECTION' && (
          <RecordGrid posts={userPosts} />
        )}

        {/* Crates */}
        {activeTab === 'CRATES' && (
          <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
            {crates?.created?.map(c => (
              <div key={c.id} style={{ padding: '14px', background: 'var(--white)', borderRadius: '8px', border: '1px solid var(--border)', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--grey-light)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--white)'}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--charcoal)', marginBottom: '4px' }}>{c.name}</div>
                <div style={{ fontFamily: 'VT323, monospace', fontSize: '11px', color: 'var(--grey-mid)', letterSpacing: '1px' }}>
                  {c.record_count || 0} RECORDS · {c.is_public ? 'PUBLIC' : 'PRIVATE'}
                </div>
                {c.description && (
                  <div style={{ fontSize: '12px', color: 'var(--grey-text)', marginTop: '6px' }}>{c.description}</div>
                )}
              </div>
            ))}
            {!crates?.created?.length && (
              <div style={{ fontFamily: 'VT323, monospace', fontSize: '13px', color: 'var(--grey-mid)', letterSpacing: '2px', padding: '4px' }}>
                NO CRATES YET
              </div>
            )}
          </div>
        )}

        {/* Logs */}
        {activeTab === 'LOGS' && (
          <div style={{ padding: '16px' }}>
            <div style={{ background: 'var(--grey-light)', borderRadius: '6px', padding: '16px', minHeight: '200px' }}>
              <div style={{ fontFamily: 'VT323, monospace', fontSize: '11px', color: 'var(--grey-mid)', letterSpacing: '1px', marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid var(--border)' }}>
                {profile.logs?.length || 0} ENTRIES
              </div>
              {profile.logs?.map((log, i) => (
                <div key={i} style={{ display: 'flex', gap: '16px', padding: '4px 0', fontSize: '12px' }}>
                  <span style={{ fontFamily: 'VT323, monospace', color: 'var(--grey-mid)', flexShrink: 0 }}>
                    [{new Date(log.created_at).toLocaleDateString()}]
                  </span>
                  <span style={{ color: 'var(--charcoal)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {log.title?.toUpperCase()}
                  </span>
                </div>
              ))}
              {!profile.logs?.length && (
                <div style={{ fontFamily: 'VT323, monospace', fontSize: '13px', color: 'var(--grey-mid)', letterSpacing: '2px' }}>
                  NO ENTRIES FOUND
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
