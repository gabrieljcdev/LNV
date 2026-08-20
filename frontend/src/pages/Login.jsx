import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../lib/auth';

// No real auth: a username is just a display/attribution label, not a
// security boundary (confirmed with the user — "get rid of auth entirely,
// just create a username and that's it, to simplify"). Anyone can still
// hit the API directly with any user_id; this is a client-side identity
// picker, not a login wall.
export default function Login() {
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [messageColor, setMessageColor] = useState('text-amber-bright');
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => { inputRef.current?.focus(); }, []);

  function showMessage(text, color = 'text-amber-mid') {
    setMessage(text);
    setMessageColor(color);
  }

  async function handleSubmit(e) {
    if (e.key !== 'Enter') return;
    const val = username.trim();
    if (!val || busy) return;
    setBusy(true);
    setMessage('');
    try {
      // Existing username → reuse it. New username → create it. Either way,
      // no password is ever asked for or checked.
      const existing = await fetch(import.meta.env.VITE_API_URL + `/users/${encodeURIComponent(val)}`);
      if (existing.ok) {
        const user = await existing.json();
        showMessage('WELCOME BACK ' + val.toUpperCase(), 'text-amber-bright');
        login(user.username, user.id);
        setTimeout(() => navigate('/'), 900);
        return;
      }
      const created = await fetch(import.meta.env.VITE_API_URL + '/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: val }),
      });
      if (created.status === 409) {
        // Race with another tab/request creating the same name — just log in as it.
        const retry = await fetch(import.meta.env.VITE_API_URL + `/users/${encodeURIComponent(val)}`);
        if (retry.ok) {
          const user = await retry.json();
          login(user.username, user.id);
          setTimeout(() => navigate('/'), 300);
          return;
        }
        throw new Error('username taken');
      }
      if (!created.ok) throw new Error('create failed');
      const user = await created.json();
      showMessage('WELCOME ' + val.toUpperCase(), 'text-amber-bright');
      login(user.username, user.id);
      setTimeout(() => navigate('/'), 900);
    } catch {
      showMessage('ERROR · COULD NOT REACH SERVER', 'text-amber-mid');
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-amber-bg font-terminal p-8 scanlines">
      <div className="space-y-2 text-lg">

        <p className="text-amber-bright tracking-widest">LATE NIGHT VIBES</p>
        <p className="text-amber-dim">────────────────────────────────</p>
        <p className="text-amber-dim text-base">Pick a username. That's it — no password.</p>
        <p className="block h-2"></p>

        <div className="flex items-center gap-2">
          <span className="text-amber-mid tracking-wide">Username:</span>
          <input
            ref={inputRef}
            value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={handleSubmit}
            disabled={busy}
            className="bg-transparent border-none outline-none text-amber-bright tracking-wide font-terminal text-lg caret-transparent"
            spellCheck={false}
            autoComplete="off"
          />
          {!busy && <span className="blink text-amber-bright">_</span>}
        </div>

        {message && (
          <p className={`${messageColor} tracking-widest mt-4`}>{message}</p>
        )}

        {!message && (
          <p className="text-amber-dim text-base mt-6">&gt; PRESS ENTER — NEW NAMES ARE CREATED AUTOMATICALLY</p>
        )}

      </div>
    </div>
  );
}
