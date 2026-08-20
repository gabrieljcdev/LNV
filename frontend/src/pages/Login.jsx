import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [stage, setStage] = useState('username');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [messageColor, setMessageColor] = useState('text-amber-bright');
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    inputRef.current?.focus();
  }, [stage, mode]);

  function reset() {
    setStage('username');
    setUsername('');
    setPassword('');
    setConfirmPassword('');
    setMessage('');
  }

  function showMessage(text, color = 'text-amber-bright') {
    setMessage(text);
    setMessageColor(color);
  }

  // ── LOGIN FLOW ──────────────────────────────
  function handleLoginUsername(e) {
    if (e.key !== 'Enter') return;
    const val = username.trim().toLowerCase();
    if (val === 'register') {
      setMode('register');
      reset();
      return;
    }
    if (!val) return;
    setStage('password');
  }

  async function handleLoginPassword(e) {
    if (e.key !== 'Enter') return;
    try {
      const res = await fetch(
        import.meta.env.VITE_API_URL + `/users/${username}`
      );
      if (!res.ok) {
        showMessage('ACCESS DENIED · USER NOT FOUND', 'text-amber-mid');
        setTimeout(reset, 2000);
        return;
      }
      // For now accept any password — swap for real auth later
      showMessage('ACCESS GRANTED · WELCOME BACK ' + username.toUpperCase());
      setTimeout(() => {
        sessionStorage.setItem('user', username);
        navigate('/');
      }, 1500);
    } catch {
      showMessage('ERROR · COULD NOT REACH SERVER', 'text-amber-mid');
      setTimeout(reset, 2000);
    }
  }

  // ── REGISTER FLOW ───────────────────────────
  function handleRegisterUsername(e) {
    if (e.key !== 'Enter') return;
    if (!username.trim()) return;
    setStage('password');
  }

  function handleRegisterPassword(e) {
    if (e.key !== 'Enter') return;
    if (!password.trim()) return;
    setStage('confirm');
  }

  async function handleRegisterConfirm(e) {
    if (e.key !== 'Enter') return;
    if (password !== confirmPassword) {
      showMessage('ERROR · PASSWORDS DO NOT MATCH', 'text-amber-mid');
      setTimeout(() => {
        setConfirmPassword('');
        setPassword('');
        setStage('password');
        setMessage('');
      }, 2000);
      return;
    }
    try {
      const res = await fetch(import.meta.env.VITE_API_URL + '/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
      });
      if (res.status === 409) {
        showMessage('ERROR · USERNAME ALREADY TAKEN', 'text-amber-mid');
        setTimeout(reset, 2000);
        return;
      }
      if (!res.ok) throw new Error();
      showMessage('ACCOUNT CREATED · WELCOME ' + username.toUpperCase());
      setTimeout(() => {
        sessionStorage.setItem('user', username);
        navigate('/');
      }, 1500);
    } catch {
      showMessage('ERROR · COULD NOT CREATE ACCOUNT', 'text-amber-mid');
      setTimeout(reset, 2000);
    }
  }

  return (
    <div className="min-h-screen bg-amber-bg font-terminal p-8 scanlines">
      <div className="space-y-2 text-lg">

        {/* Header */}
        <p className="text-amber-bright tracking-widest">LATE NIGHT VIBES OS v1.0</p>
        <p className="text-amber-dim">────────────────────────────────</p>
        <p className="block h-4"></p>


        {mode === 'register' && (
          <p className="text-amber-bright tracking-widest">REGISTERING NEW USER</p>
        )}

        <p className="block h-2"></p>

        {/* Username */}
        <div className="flex items-center gap-2">
          <span className="text-amber-mid tracking-wide">Username:</span>
          {stage === 'username' ? (
            <input
              ref={inputRef}
              value={username}
              onChange={e => setUsername(e.target.value)}
              onKeyDown={mode === 'login' ? handleLoginUsername : handleRegisterUsername}
              className="bg-transparent border-none outline-none text-amber-bright tracking-wide font-terminal text-lg caret-transparent"
              spellCheck={false}
              autoComplete="off"
            />
          ) : (
            <span className="text-amber-bright">{username}</span>
          )}
          {stage === 'username' && <span className="blink text-amber-bright">_</span>}
        </div>

        {/* Password */}
        {(stage === 'password' || stage === 'confirm') && (
          <div className="flex items-center gap-2">
            <span className="text-amber-mid tracking-wide">Password:</span>
            {stage === 'password' ? (
              <input
                ref={inputRef}
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={mode === 'login' ? handleLoginPassword : handleRegisterPassword}
                className="bg-transparent border-none outline-none text-amber-bright tracking-wide font-terminal text-lg caret-transparent"
              />
            ) : (
              <span className="text-amber-bright">{'*'.repeat(password.length)}</span>
            )}
            {stage === 'password' && <span className="blink text-amber-bright">_</span>}
          </div>
        )}

        {/* Confirm Password — register only */}
        {mode === 'register' && stage === 'confirm' && (
          <div className="flex items-center gap-2">
            <span className="text-amber-mid tracking-wide">Confirm Password:</span>
            <input
              ref={inputRef}
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              onKeyDown={handleRegisterConfirm}
              className="bg-transparent border-none outline-none text-amber-bright tracking-wide font-terminal text-lg caret-transparent"
            />
            <span className="blink text-amber-bright">_</span>
          </div>
        )}

        {/* Response message */}
        {message && (
          <p className={`${messageColor} tracking-widest mt-4`}>
            {message}
          </p>
        )}

        {/* Switch mode */}
        {!message && mode === 'login' && (
  <p className="text-amber-dim text-base mt-6">
    &gt; TYPE REGISTER TO CREATE A NEW ACCOUNT
  </p>
)}

      </div>
    </div>
  );
}