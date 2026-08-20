import { useState, useEffect, useRef, useCallback } from 'react';

const BASE = import.meta.env.VITE_API_URL;

const FRAMES = [
  { width: '20%', height: '15%' },
  { width: '50%', height: '40%' },
  { width: '80%', height: '70%' },
  { width: '95%', height: '90%' },
];

export default function CrateCompose({ onClose, onSaved, crate = null }) {
  // If `crate` is passed in, we're editing. If null, we're creating.
  const isEditing = !!crate;

  const [frame, setFrame]       = useState(0);
  const [animDone, setAnimDone] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pos, setPos]           = useState({ x: 30, y: 30 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const [name, setName]           = useState(crate?.name || '');
  const [description, setDescription] = useState(crate?.description || '');
  const [isPublic, setIsPublic]   = useState(crate?.is_public ? true : false);
  const [error, setError]         = useState('');
  const [saving, setSaving]       = useState(false);

  const inputRef = useRef(null);

  // ── Opening animation ──────────────────────────────────────────────────────

  useEffect(() => {
    if (frame < FRAMES.length - 1) {
      const timer = setTimeout(() => setFrame(f => f + 1), 80);
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => {
        setAnimDone(true);
        inputRef.current?.focus();
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [frame]);

  // ── Drag ───────────────────────────────────────────────────────────────────

  const handleMouseDown = useCallback((e) => {
    setDragging(true);
    setDragStart({ x: e.clientX - pos.x, y: e.clientY - pos.y });
    e.preventDefault();
  }, [pos]);

  const handleMouseMove = useCallback((e) => {
    if (!dragging) return;
    setPos({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  }, [dragging, dragStart]);

  const handleMouseUp = useCallback(() => setDragging(false), []);

  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, handleMouseMove, handleMouseUp]);

  // ── Save ───────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!name.trim()) {
      setError('CRATE NAME CANNOT BE EMPTY');
      return;
    }

    setSaving(true);
    setError('');

    const username = sessionStorage.getItem('user');

    try {
      if (isEditing) {
        // PATCH — update existing crate
        const res = await fetch(`${BASE}/crates/${crate.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username,
            name:        name.trim(),
            description: description.trim(),
            is_public:   isPublic ? 1 : 0,
          }),
        });

        if (!res.ok) throw new Error('Failed to update crate');
        onSaved({ ...crate, name: name.trim(), description: description.trim(), is_public: isPublic ? 1 : 0 });

      } else {
        // POST — create new crate
        const res = await fetch(`${BASE}/crates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username,
            name:        name.trim(),
            description: description.trim(),
            is_public:   isPublic ? 1 : 0,
          }),
        });

        if (!res.ok) throw new Error('Failed to create crate');
        const data = await res.json();
        onSaved(data);
      }

    } catch (err) {
      setError(`FAILED — ${err.message.toUpperCase()}`);
    } finally {
      setSaving(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const currentFrame = FRAMES[frame];

  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
      style={{ zIndex: 60 }}
    >
      <div
        className="pointer-events-auto font-terminal bg-amber-bg border-2 border-amber-mid flex flex-col overflow-hidden"
        style={{
          width:     currentFrame.width,
          height:    currentFrame.height,
          transition: 'none',
          transform: `translate(${pos.x}px, ${pos.y}px)`,
          cursor:    dragging ? 'grabbing' : 'default',
        }}
      >

        {/* Title bar */}
        <div
          onMouseDown={handleMouseDown}
          className="flex items-center justify-between px-3 py-1 bg-amber-dim border-b-2 border-amber-mid flex-shrink-0 cursor-grab active:cursor-grabbing select-none"
        >
          <span className="text-amber-bright text-base tracking-widest">
            ■ {isEditing ? 'EDIT CRATE' : 'NEW CRATE'}
          </span>
          <button
            onClick={onClose}
            className="text-amber-mid hover:text-amber-bright border border-amber-mid hover:border-amber-bright px-2 text-sm tracking-widest transition-all"
          >
            [X]
          </button>
        </div>

        {animDone && (
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-5">

            {/* Name */}
            <div>
              <p className="text-amber-bright text-sm tracking-widest mb-2">CRATE NAME</p>
              <div className="flex items-center gap-2">
                <span className="text-amber-mid text-sm">&gt;</span>
                <input
                  ref={inputRef}
                  value={name}
                  onChange={e => { setName(e.target.value); setError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                  placeholder="E.G. LATE NIGHT SELECTS"
                  className="flex-1 bg-transparent border-b border-amber-hover text-amber-text text-sm tracking-wide focus:outline-none focus:border-amber-mid font-terminal placeholder-amber-dim caret-amber-bright"
                  spellCheck={false}
                  maxLength={80}
                />
              </div>
              <p className="text-amber-dim text-xs tracking-widest mt-1">
                {name.length}/80
              </p>
            </div>

            {/* Description */}
            <div className="border-t border-amber-hover pt-4">
              <p className="text-amber-bright text-sm tracking-widest mb-2">DESCRIPTION</p>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="OPTIONAL — WHAT IS THIS CRATE ABOUT?"
                rows={4}
                maxLength={300}
                className="w-full bg-transparent border border-amber-hover text-amber-text text-sm tracking-wide focus:outline-none focus:border-amber-mid font-terminal placeholder-amber-dim p-2 resize-none caret-amber-bright"
              />
              <p className="text-amber-dim text-xs tracking-widest mt-1">
                {description.length}/300
              </p>
            </div>

            {/* Public / private toggle */}
            <div className="border-t border-amber-hover pt-4">
              <p className="text-amber-bright text-sm tracking-widest mb-3">VISIBILITY</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsPublic(false)}
                  className={`text-sm tracking-widest px-3 py-1 border transition-all ${
                    !isPublic
                      ? 'border-amber-bright text-amber-bright bg-amber-sel'
                      : 'border-amber-dim text-amber-dim hover:border-amber-mid hover:text-amber-mid'
                  }`}
                >
                  [PRIVATE]
                </button>
                <button
                  onClick={() => setIsPublic(true)}
                  className={`text-sm tracking-widest px-3 py-1 border transition-all ${
                    isPublic
                      ? 'border-amber-bright text-amber-bright bg-amber-sel'
                      : 'border-amber-dim text-amber-dim hover:border-amber-mid hover:text-amber-mid'
                  }`}
                >
                  [PUBLIC]
                </button>
              </div>
              <p className="text-amber-dim text-xs tracking-widest mt-2">
                {isPublic
                  ? 'VISIBLE IN FDD\\ — OTHER USERS CAN LIKE, FOLLOW AND COPY THIS CRATE'
                  : 'ONLY VISIBLE IN YOUR HDD\\ — HIDDEN FROM THE COMMUNITY'}
              </p>
            </div>

            {/* Summary */}
            {name.trim() && (
              <div className="border border-amber-dim px-3 py-2 space-y-1">
                <p className="text-amber-dim text-xs tracking-widest">PREVIEW</p>
                <p className="text-amber-bright text-sm tracking-widest">[///] {name.toUpperCase()}\</p>
                {description && (
                  <p className="text-amber-muted text-xs tracking-wide truncate">{description}</p>
                )}
                <p className="text-amber-dim text-xs tracking-widest">
                  {isPublic ? 'PUBLIC · VISIBLE IN FDD\\' : 'PRIVATE · HDD\\ ONLY'}
                </p>
              </div>
            )}

            {/* Error */}
            {error && (
              <p className="text-amber-orange text-sm tracking-widest">⚠ {error}</p>
            )}

            {/* Save button */}
            <div className="border-t border-amber-hover pt-4 pb-1">
              <button
                onClick={handleSave}
                disabled={!name.trim() || saving}
                className="w-full text-amber-bright text-base tracking-widest border border-amber-mid py-2 hover:bg-amber-sel hover:border-amber-bright transition-all disabled:opacity-30"
              >
                {saving
                  ? 'SAVING...'
                  : isEditing
                    ? '[SAVE CHANGES]'
                    : '[CREATE CRATE]'}
              </button>
              {!name.trim() && (
                <p className="text-amber-dim text-xs tracking-widest mt-2 text-center">
                  ENTER A NAME TO CONTINUE
                </p>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
