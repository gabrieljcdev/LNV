import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLayout } from '../context/LayoutContext';
import { useState } from 'react';

const API = import.meta.env.VITE_API_URL;

async function getMyCrates() {
  const username = sessionStorage.getItem('user');
  const res = await fetch(`${API}/crates/mine?username=${username}`);
  return res.json();
}
async function createCrate(data) {
  const res = await fetch(`${API}/crates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, username: sessionStorage.getItem('user') }),
  });
  return res.json();
}
async function deleteCrate(id) {
  await fetch(`${API}/crates/${id}`, { method: 'DELETE' });
}
async function togglePin(id, is_pinned) {
  await fetch(`${API}/crates/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_pinned: is_pinned ? 0 : 1, username: sessionStorage.getItem('user') }),
  });
}

export default function HDD() {
  const { openD3 } = useLayout();
  const queryClient = useQueryClient();
  const currentUser = sessionStorage.getItem('user');

  const [composing, setComposing]   = useState(false);
  const [newName, setNewName]       = useState('');
  const [newDesc, setNewDesc]       = useState('');
  const [newPublic, setNewPublic]   = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);

  const { data: cratesRaw = [], isLoading } = useQuery({
    queryKey: ['crates-mine'],
    queryFn: getMyCrates,
  });

  const crates = Array.isArray(cratesRaw) ? cratesRaw : [];

  const createMutation = useMutation({
    mutationFn: createCrate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crates-mine'] });
      setComposing(false); setNewName(''); setNewDesc(''); setNewPublic(false);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: deleteCrate,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['crates-mine'] }); setConfirmDel(null); },
  });
  const pinMutation = useMutation({
    mutationFn: ({ id, is_pinned }) => togglePin(id, is_pinned),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['crates-mine'] }),
  });

  function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    createMutation.mutate({ name: newName.trim(), description: newDesc.trim(), is_public: newPublic });
  }

  const totalRecords = crates.reduce((sum, c) => sum + (c.record_count || 0), 0);
  const publicCount  = crates.filter(c => c.is_public).length;

  return (
    <div>
      {/* Stat bar */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '20px' }}>
        {[['CRATES', crates.length], ['RECORDS', totalRecords], ['PUBLIC', publicCount]].map(([label, val]) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontFamily: 'VT323, monospace', fontSize: '10px', letterSpacing: '2px', color: 'var(--grey-mid)' }}>{label}</span>
            <span style={{ fontFamily: 'Barlow, sans-serif', fontSize: '20px', fontWeight: 900, color: 'var(--gunmetal-dark)', lineHeight: 1 }}>{val}</span>
          </div>
        ))}
      </div>

      {/* New crate compose */}
      {composing && (
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--off-white)' }}>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Crate name..."
              style={{ fontFamily: 'Barlow, sans-serif', fontSize: '14px', fontWeight: 700, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px 12px', outline: 'none', color: 'var(--gunmetal-dark)' }}
            />
            <input
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              placeholder="Description (optional)..."
              style={{ fontFamily: 'Barlow, sans-serif', fontSize: '13px', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px 12px', outline: 'none', color: 'var(--charcoal)' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button type="button" onClick={() => setNewPublic(p => !p)}
                style={{ fontFamily: 'VT323, monospace', fontSize: '12px', letterSpacing: '1px', padding: '4px 10px', border: '1px solid var(--border)', borderRadius: '4px', background: newPublic ? 'var(--pastel-blue)' : 'transparent', color: 'var(--charcoal)', cursor: 'pointer' }}>
                {newPublic ? '◉ PUBLIC' : '○ PRIVATE'}
              </button>
              <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                <button type="button" onClick={() => setComposing(false)}
                  style={{ fontFamily: 'Barlow, sans-serif', fontSize: '13px', fontWeight: 500, padding: '6px 14px', border: '1px solid var(--border)', borderRadius: '6px', background: 'transparent', color: 'var(--grey-text)', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit"
                  style={{ fontFamily: 'Barlow, sans-serif', fontSize: '13px', fontWeight: 700, padding: '6px 14px', border: 'none', borderRadius: '6px', background: 'var(--gunmetal-dark)', color: 'var(--pastel-blue)', cursor: 'pointer' }}>
                  Create
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Loading */}
      {isLoading && <Empty label="Loading..." />}

      {/* Empty */}
      {!isLoading && crates.length === 0 && <Empty label="No crates yet." />}

      {/* Grid */}
      {!isLoading && crates.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', padding: '20px' }}>
          {crates.map(crate => (
            <CrateCard
              key={crate.id}
              crate={crate}
              currentUser={currentUser}
              confirmDel={confirmDel}
              setConfirmDel={setConfirmDel}
              onOpen={() => openD3('crate', { id: crate.id, name: crate.name })}
              onPin={() => pinMutation.mutate({ id: crate.id, is_pinned: crate.is_pinned })}
              onDelete={() => deleteMutation.mutate(crate.id)}
            />
          ))}

          {/* New crate placeholder */}
          <div
            onClick={() => setComposing(true)}
            style={{ minHeight: '140px', border: '1.5px dashed var(--border)', borderRadius: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer', transition: 'border-color 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--grey-mid)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            <span style={{ fontSize: '22px', color: 'var(--grey-mid)' }}>+</span>
            <span style={{ fontFamily: 'VT323, monospace', fontSize: '11px', letterSpacing: '2px', color: 'var(--grey-mid)' }}>NEW CRATE</span>
          </div>
        </div>
      )}
    </div>
  );
}

function CrateCard({ crate, currentUser, confirmDel, setConfirmDel, onOpen, onPin, onDelete }) {
  return (
    <div
      onClick={onOpen}
      style={{ background: 'var(--off-white)', borderRadius: '10px', border: '1px solid var(--border)', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px', cursor: 'pointer', position: 'relative', transition: 'border-color 0.15s, box-shadow 0.15s' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--pastel-blue-dark)'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.06)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
    >
      {/* Badges */}
      <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', gap: '4px' }}>
        {crate.is_pinned && (
          <span style={{ fontFamily: 'VT323, monospace', fontSize: '10px', letterSpacing: '1px', background: 'var(--pastel-blue)', color: 'var(--gunmetal-dark)', borderRadius: '3px', padding: '1px 5px' }}>PIN</span>
        )}
        <span style={{ fontFamily: 'VT323, monospace', fontSize: '10px', letterSpacing: '1px', background: crate.is_public ? 'var(--grey-light)' : 'transparent', border: '1px solid var(--border)', color: 'var(--grey-text)', borderRadius: '3px', padding: '1px 5px' }}>
          {crate.is_public ? 'PUBLIC' : 'PRIVATE'}
        </span>
      </div>

      {/* Name */}
      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--gunmetal-dark)', paddingRight: '60px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {crate.name}
      </div>

      {/* Meta */}
      <div style={{ fontFamily: 'VT323, monospace', fontSize: '11px', letterSpacing: '1px', color: 'var(--grey-text)' }}>
        {crate.record_count || 0} RECORDS · ♥ {crate.like_count || 0}
      </div>

      {/* Description */}
      {crate.description && (
        <div style={{ fontSize: '11px', color: 'var(--grey-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {crate.description}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '6px', marginTop: 'auto', flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
        <ActionBtn label="Pin" onClick={onPin} />
        <ActionBtn label="Delete" onClick={() => setConfirmDel(crate.id)} danger />
      </div>

      {/* Delete confirm */}
      {confirmDel === crate.id && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }} onClick={e => e.stopPropagation()}>
          <span style={{ fontFamily: 'VT323, monospace', fontSize: '11px', color: 'var(--charcoal)', letterSpacing: '1px' }}>DELETE?</span>
          <ActionBtn label="Yes" onClick={onDelete} danger />
          <ActionBtn label="No" onClick={() => setConfirmDel(null)} />
        </div>
      )}
    </div>
  );
}

function ActionBtn({ label, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      style={{ fontFamily: 'VT323, monospace', fontSize: '11px', letterSpacing: '1px', padding: '2px 8px', border: `1px solid ${danger ? 'rgba(220,38,38,0.3)' : 'var(--border)'}`, borderRadius: '4px', background: 'transparent', color: danger ? 'rgb(220,38,38)' : 'var(--grey-text)', cursor: 'pointer', transition: 'background 0.15s, color 0.15s' }}
      onMouseEnter={e => { e.currentTarget.style.background = danger ? 'rgba(220,38,38,0.08)' : 'var(--grey-light)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      {label}
    </button>
  );
}

function Empty({ label }) {
  return (
    <div style={{ padding: '32px 20px', fontFamily: 'VT323, monospace', fontSize: '13px', letterSpacing: '2px', color: 'var(--grey-mid)' }}>
      {label}
    </div>
  );
}
