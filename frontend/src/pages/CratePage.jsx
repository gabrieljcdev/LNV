import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import ComposeModal from '../components/ComposeModal'
import CrateComments from '../components/CrateComments';
import PostCard from '../components/PostCard';

const API = import.meta.env.VITE_API_URL;

async function getCrate(id) {
  const res = await fetch(`${API}/crates/${id}`);
  return res.json();
}

async function getCrateActivity(id) {
  const res = await fetch(`${API}/crates/${id}/activity`);
  return res.json();
}

async function updateCrate(id, data) {
  const res = await fetch(`${API}/crates/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, username: sessionStorage.getItem('user') }),
  });
  return res.json();
}

async function removeRecord(crateId, postId) {
  const res = await fetch(`${API}/crates/${crateId}/records/${postId}`, {
    method: 'DELETE',
  });
  return res.json();
}

async function addCollaborator(crateId, targetUsername) {
  const res = await fetch(`${API}/crates/${crateId}/collaborators`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: sessionStorage.getItem('user'),
      target_username: targetUsername,
    }),
  });
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

function formatTimestamp(raw) {
  if (!raw) return '—';
  const d   = new Date(raw);
  const dd  = String(d.getDate()).padStart(2, '0');
  const mm  = String(d.getMonth() + 1).padStart(2, '0');
  const yy  = String(d.getFullYear()).slice(2);
  const hh  = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yy} ${hh}:${min}`;
}

function exportTracklist(crate) {
  const lines = [
    `LATE NIGHT VIBES — ${crate.name.toUpperCase()}`,
    '─'.repeat(40),
    `AUTHOR : ${crate.author || sessionStorage.getItem('user') || 'UNKNOWN'}`,
    `RECORDS: ${crate.records?.length || 0}`,
    `GENRES : ${(crate.genres || []).join(', ') || '—'}`,
    '',
    ...(crate.records || []).map((r, i) =>
      `${String(i + 1).padStart(2, '0')}  ${r.artist || '—'} — ${r.title || '—'} (${r.year || '—'})`
    ),
    '',
    `EXPORTED: ${new Date().toISOString().slice(0, 10)}`,
    'LATE NIGHT VIBES · LATENIGHTVIBES.COM',
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${crate.name.replace(/\s+/g, '_').toUpperCase()}.TXT`;
  a.click();
  URL.revokeObjectURL(url);
}

const EVENT_LABELS = {
  created:            'CREATED',
  record_added:       'RECORD ADDED',
  record_removed:     'RECORD REMOVED',
  liked:              'LIKED',
  followed:           'FOLLOWED',
  name_changed:       'RENAMED',
  collaborator_added: 'COLLABORATOR ADDED',
  duplicated:         'DUPLICATED',
};

export default function CratePage() {
  const { id }      = useParams();
  const navigate    = useNavigate();
  const queryClient = useQueryClient();
  const currentUser = sessionStorage.getItem('user');

  // All state inside the component
  const [editingName, setEditingName]       = useState(false);
  const [editingDesc, setEditingDesc]       = useState(false);
  const [nameInput, setNameInput]           = useState('');
  const [descInput, setDescInput]           = useState('');
  const [collabInput, setCollabInput]       = useState('');
  const [collabFeedback, setCollabFeedback] = useState('');
  const [confirmDel, setConfirmDel]         = useState(null);
  const [showActivity, setShowActivity]     = useState(false);
  const [feedback, setFeedback]             = useState('');
  const [addingPost, setAddingPost]         = useState(false);

  const { data: crate, isLoading } = useQuery({
    queryKey: ['crate', id],
    queryFn: () => getCrate(id),
  });

  const { data: activity = [] } = useQuery({
    queryKey: ['crate-activity', id],
    queryFn: () => getCrateActivity(id),
    enabled: showActivity,
  });

  const updateMutation = useMutation({
    mutationFn: (data) => updateCrate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crate', id] });
      setEditingName(false);
      setEditingDesc(false);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (postId) => removeRecord(id, postId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crate', id] });
      setConfirmDel(null);
    },
  });

  const collabMutation = useMutation({
    mutationFn: (username) => addCollaborator(id, username),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crate', id] });
      setCollabInput('');
      setCollabFeedback('COLLABORATOR ADDED');
      setTimeout(() => setCollabFeedback(''), 2000);
    },
    onError: () => {
      setCollabFeedback('ALREADY A COLLABORATOR');
      setTimeout(() => setCollabFeedback(''), 2000);
    },
  });

  const likeMutation = useMutation({
    mutationFn: () => likeCrate(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['crate', id] });
      setFeedback(data.liked ? '♥ LIKED' : '♥ UNLIKED');
      setTimeout(() => setFeedback(''), 2000);
    },
  });

  const followMutation = useMutation({
    mutationFn: () => followCrate(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['crate', id] });
      setFeedback(data.following ? 'NOW FOLLOWING' : 'UNFOLLOWED');
      setTimeout(() => setFeedback(''), 2000);
    },
  });

  // Called when NetlinkCompose finishes posting — adds the new post to this crate
  async function handlePostAdded({ postId } = {}) {
    if (postId) {
      await fetch(`${API}/crates/${id}/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId, username: currentUser }),
      });
      queryClient.invalidateQueries({ queryKey: ['crate', id] });
    }
    setAddingPost(false);
  }

  if (isLoading) {
    return (
      <div className="px-4 py-8 text-amber-muted tracking-widest font-terminal">
        LOADING...<span className="blink">_</span>
      </div>
    );
  }

  if (!crate || crate.error) {
    return (
      <div className="px-4 py-8 text-amber-muted tracking-widest font-terminal">
        CRATE NOT FOUND
      </div>
    );
  }

  const isOwner = crate.author === currentUser;
  const isCollab = (crate.collaborators || []).includes(currentUser);
  const canEdit  = isOwner || isCollab;

  return (
    <div className="font-terminal">

      {/* Header */}
      <div className="px-4 py-3 border-b border-amber-hover flex justify-between items-center flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="text-amber-dim text-xs tracking-widest hover:text-amber-mid transition-all"
          >
            [←]
          </button>
          <span className="text-amber-dim text-xs tracking-widest">
            {isOwner ? 'HDD' : 'FDD'}\
          </span>
          <span className="text-amber-dim text-xs">›</span>

          {/* Editable name */}
          {editingName && canEdit ? (
            <form
              onSubmit={e => {
                e.preventDefault();
                if (nameInput.trim()) updateMutation.mutate({ name: nameInput.trim() });
              }}
              className="flex items-center gap-2"
            >
              <input
                autoFocus
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                className="bg-transparent border-b border-amber-bright outline-none text-amber-bright tracking-widest text-base py-0"
                spellCheck={false}
              />
              <button type="submit" className="text-xs tracking-widest border border-amber-bright text-amber-bright px-2 py-1">[SAVE]</button>
              <button type="button" onClick={() => setEditingName(false)} className="text-xs tracking-widest border border-amber-dim text-amber-dim px-2 py-1">[X]</button>
            </form>
          ) : (
            <span
              className={`text-amber-mid text-base tracking-widest ${canEdit ? 'cursor-pointer hover:text-amber-bright' : ''}`}
              onClick={() => {
                if (canEdit) {
                  setNameInput(crate.name);
                  setEditingName(true);
                }
              }}
              title={canEdit ? 'Click to rename' : ''}
            >
              {crate.name.toUpperCase()}\
              {canEdit && <span className="text-amber-dim text-xs ml-2">[EDIT]</span>}
            </span>
          )}
        </div>

        <span className="text-amber-dim text-xs tracking-widest hidden sm:block">
          C:\LATE_NIGHT_VIBES\COLLECTIONS\{isOwner ? 'HDD' : 'FDD'}\{crate.name.toUpperCase()}\
        </span>
      </div>

      {/* Meta bar */}
      <div className="px-4 py-2 border-b border-amber-hover flex flex-wrap gap-4 text-xs tracking-widest text-amber-dim items-center">
        {crate.author && <span>BY <span className="text-amber-mid">@{crate.author}</span></span>}
        <span>RECORDS: <span className="text-amber-mid">{crate.records?.length || 0}</span></span>
        <span>♥ <span className="text-amber-mid">{crate.like_count || 0}</span></span>
        <span className={crate.is_public ? 'text-amber-mid' : 'text-amber-dim'}>
          {crate.is_public ? 'PUBLIC' : 'PRIVATE'}
        </span>
        {(crate.genres || []).map(g => (
          <span key={g} className="border border-amber-hover text-amber-muted px-1">
            {g.toUpperCase()}
          </span>
        ))}
        {feedback && <span className="text-amber-bright">{feedback}</span>}
      </div>

      {/* Description */}
      <div className="px-4 py-2 border-b border-amber-hover">
        {editingDesc && canEdit ? (
          <form
            onSubmit={e => {
              e.preventDefault();
              updateMutation.mutate({ description: descInput });
            }}
            className="flex items-center gap-2"
          >
            <input
              autoFocus
              value={descInput}
              onChange={e => setDescInput(e.target.value)}
              className="flex-1 bg-transparent border-b border-amber-mid outline-none text-amber-bright tracking-widest text-xs py-1"
              placeholder="CRATE DESCRIPTION..."
              spellCheck={false}
            />
            <button type="submit" className="text-xs tracking-widest border border-amber-bright text-amber-bright px-2 py-1">[SAVE]</button>
            <button type="button" onClick={() => setEditingDesc(false)} className="text-xs tracking-widest border border-amber-dim text-amber-dim px-2 py-1">[X]</button>
          </form>
        ) : (
          <div
            className={`text-xs tracking-wide ${crate.description ? 'text-amber-muted' : 'text-amber-dim'} ${canEdit ? 'cursor-pointer hover:text-amber-text' : ''}`}
            onClick={() => {
              if (canEdit) {
                setDescInput(crate.description || '');
                setEditingDesc(true);
              }
            }}
          >
            {crate.description || (canEdit ? '+ ADD DESCRIPTION' : '—')}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="px-4 py-2 border-b border-amber-hover flex flex-wrap gap-2 items-center">

        {/* Add record — owner/collab only */}
        {canEdit && (
          <button
            onClick={() => setAddingPost(true)}
            className="text-xs tracking-widest border border-amber-bright text-amber-bright hover:bg-amber-sel px-2 py-1 transition-all"
          >
            [+ ADD RECORD]
          </button>
        )}

        {/* Export */}
        <button
          onClick={() => exportTracklist(crate)}
          className="text-xs tracking-widest border border-amber-dim text-amber-dim hover:border-amber-mid hover:text-amber-mid px-2 py-1 transition-all"
        >
          [EXPORT .TXT]
        </button>

        {/* Public toggle — owner only */}
        {isOwner && (
          <button
            onClick={() => updateMutation.mutate({ is_public: crate.is_public ? 0 : 1 })}
            className="text-xs tracking-widest border border-amber-dim text-amber-dim hover:border-amber-mid hover:text-amber-mid px-2 py-1 transition-all"
          >
            {crate.is_public ? '[MAKE PRIVATE]' : '[MAKE PUBLIC]'}
          </button>
        )}

        {/* Pin — owner only */}
        {isOwner && (
          <button
            onClick={() => updateMutation.mutate({ is_pinned: crate.is_pinned ? 0 : 1 })}
            className="text-xs tracking-widest border border-amber-dim text-amber-dim hover:border-amber-mid hover:text-amber-mid px-2 py-1 transition-all"
          >
            {crate.is_pinned ? '[UNPIN]' : '[PIN TO TOP]'}
          </button>
        )}

        {/* Like — non-owners only */}
        {!isOwner && currentUser && (
          <button
            onClick={() => likeMutation.mutate()}
            className="text-xs tracking-widest border border-amber-dim text-amber-dim hover:border-amber-bright hover:text-amber-bright px-2 py-1 transition-all"
          >
            [♥ LIKE]
          </button>
        )}

        {/* Follow — non-owners only */}
        {!isOwner && currentUser && (
          <button
            onClick={() => followMutation.mutate()}
            className="text-xs tracking-widest border border-amber-dim text-amber-dim hover:border-amber-mid hover:text-amber-mid px-2 py-1 transition-all"
          >
            [FOLLOW]
          </button>
        )}

        {/* Activity log toggle */}
        <button
          onClick={() => setShowActivity(a => !a)}
          className="text-xs tracking-widest border border-amber-dim text-amber-dim hover:border-amber-mid hover:text-amber-mid px-2 py-1 transition-all"
        >
          {showActivity ? '[HIDE LOG]' : '[VIEW LOG]'}
        </button>

      </div>

      {/* Activity log */}
      {showActivity && (
        <div className="border-b border-amber-hover">
          <div className="px-4 py-2 text-xs tracking-widest text-amber-dim border-b border-amber-hover">
            ACTIVITY LOG — {activity.length} EVENTS
          </div>
          {activity.length === 0 ? (
            <div className="px-4 py-4 text-amber-muted text-xs tracking-widest">NO ACTIVITY YET</div>
          ) : (
            activity.map((log, i) => (
              <div key={log.id ?? i} className="px-4 py-2 flex gap-4 text-xs tracking-wide border-b border-amber-hover hover:bg-amber-hover transition-all">
                <span className="text-amber-dim w-32 flex-shrink-0">{formatTimestamp(log.created_at)}</span>
                <span className="text-amber-mid w-32 flex-shrink-0">{EVENT_LABELS[log.event_type] || log.event_type}</span>
                <span className="text-amber-muted">
                  {log.username && <span className="text-amber-dim">@{log.username} </span>}
                  {log.detail}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Collaborators — owner only */}
      {isOwner && (
        <div className="px-4 py-3 border-b border-amber-hover">
          <div className="text-amber-dim text-xs tracking-widest mb-2">
            COLLABORATORS: {(crate.collaborators || []).length > 0
              ? crate.collaborators.map(u => `@${u}`).join(' · ')
              : 'NONE'}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-amber-dim text-xs tracking-widest">INVITE:</span>
            <input
              value={collabInput}
              onChange={e => setCollabInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && collabInput.trim()) {
                  collabMutation.mutate(collabInput.trim());
                }
              }}
              placeholder="USERNAME"
              className="bg-transparent border-b border-amber-dim outline-none text-amber-bright tracking-widest text-xs py-1 w-40"
              spellCheck={false}
            />
            <button
              onClick={() => { if (collabInput.trim()) collabMutation.mutate(collabInput.trim()); }}
              className="text-xs tracking-widest border border-amber-dim text-amber-dim hover:border-amber-mid hover:text-amber-mid px-2 py-1 transition-all"
            >
              [ADD]
            </button>
            {collabFeedback && <span className="text-amber-mid text-xs tracking-widest">{collabFeedback}</span>}
          </div>
        </div>
      )}

      {/* Tracklist */}
      <div>
        <div className="px-4 py-2 border-b border-amber-hover flex justify-between items-center">
          <span className="text-amber-dim text-xs tracking-widest">
            TRACKLIST — {crate.records?.length || 0} RECORDS
          </span>
        </div>

        {(!crate.records || crate.records.length === 0) ? (
          <div className="px-4 py-8 text-amber-muted text-xs tracking-widest">
            NO RECORDS IN THIS CRATE YET
            {canEdit && ' — PRESS [+ ADD RECORD] ABOVE TO ADD ONE'}
          </div>
        ) : (
       crate.records.map(post => (
 <div key={post.id}>
  <PostCard post={post} />
    <CrateComments crateId={id} postId={post.id} />

    {/* Remove button — canEdit only */}

              {/* Remove button — canEdit only */}
              {canEdit && (
    <div className="flex justify-end px-4 py-1 border-b border-amber-hover bg-amber-card">
                  {confirmDel === post.id ? (
                    <div className="flex gap-1 items-center">
                      <span className="text-xs tracking-widest text-amber-mid">REMOVE?</span>
                      <button
                        onClick={() => removeMutation.mutate(post.id)}
                        className="text-xs tracking-widest border border-red-500 text-red-500 px-1 hover:bg-red-500 hover:text-black transition-all"
                      >
                        [YES]
                      </button>
                      <button
                        onClick={() => setConfirmDel(null)}
                        className="text-xs tracking-widest border border-amber-dim text-amber-dim px-1 hover:border-amber-mid transition-all"
                      >
                        [NO]
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDel(post.id)}
                      className="text-xs tracking-widest border border-amber-hover text-amber-dim hover:border-red-500 hover:text-red-500 px-2 py-1 transition-all bg-amber-bg"
                    >
                      [REMOVE]
                    </button>
                    
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* NetlinkCompose — floats over page when adding a post */}
      {addingPost && (
        <ComposeModal
          onClose={() => setAddingPost(false)}
          onPosted={handlePostAdded}
        />
      )}

{addingPost && (
  <ComposeModal
    onClose={() => setAddingPost(false)}
    onPosted={handlePostAdded}
  />
)}

    </div>
  );
}
