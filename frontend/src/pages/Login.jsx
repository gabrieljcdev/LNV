import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { signIn, register, resendConfirmation, isLoggedIn, getUser, logout, forgotPassword, resetPassword, checkResetLink } from '../lib/auth';
import { applyPalette, getAutoIndex } from '../services/themeService';

// ── Sign in / Create account (2026-10-01) ─────────────────────────────────────
// One card, two tabs. Creating an account sends a confirmation email; the
// link in it lands back here with ?verified=1 (or ?verify=expired|invalid).
// Sign-in takes a username or the email address.
// Forgotten password (2026-10-02): "Forgot your password?" emails a reset
// link; it lands here with ?reset=<token>, which asks for the new password.

const SANS = "'Barlow', sans-serif", MONO = "'IBM Plex Mono', monospace";
const field = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--theme-border)', outline: 'none', borderRadius: 12, padding: '12px 14px', background: 'color-mix(in srgb, var(--theme-text-pri) 6%, transparent)', color: 'var(--theme-text-pri)', fontFamily: SANS, fontSize: 15 };
const label = { display: 'grid', gap: 6, fontFamily: SANS, fontSize: 12, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--theme-text-sec)' };
const primary = { border: 'none', borderRadius: 99, height: 46, padding: '0 24px', cursor: 'pointer', background: 'var(--theme-accent)', color: '#fff', fontFamily: SANS, fontSize: 14, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' };
const quiet = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--theme-text-pri)', fontFamily: SANS, fontSize: 14, textDecoration: 'underline', textUnderlineOffset: 3 };

function Notice({ tone = 'info', children }) {
  const color = tone === 'error' ? '#c2410c' : tone === 'ok' ? 'var(--theme-accent)' : 'var(--theme-text-sec)';
  return <div role={tone === 'error' ? 'alert' : 'status'} style={{ border: `1px solid ${color}`, color, borderRadius: 12, padding: '10px 14px', fontFamily: SANS, fontSize: 14, lineHeight: 1.45 }}>{children}</div>;
}

export default function Login() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState(params.get('tab') === 'create' ? 'create' : 'signin');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);       // { field?, message }
  const [sentTo, setSentTo] = useState(null);     // email a confirmation went to
  const [devLink, setDevLink] = useState(null);   // only when the backend has no email set up
  const [unconfirmed, setUnconfirmed] = useState(null); // email of an account that still needs confirming
  const [form, setForm] = useState({ login: '', username: '', email: '', password: '', confirm: '' });
  const [forgot, setForgot] = useState(false);           // showing the "email me a reset link" form
  const [resetSentTo, setResetSentTo] = useState(null);  // email a reset link went to
  const [devResetLink, setDevResetLink] = useState(null);
  const resetToken = params.get('reset');
  const [resetState, setResetState] = useState(resetToken ? 'checking' : null); // checking | ok | expired | invalid
  const passwordChanged = params.get('reset_done') === '1';
  const set = k => e => { setForm(f => ({ ...f, [k]: e.target.value })); setError(null); };

  useEffect(() => { applyPalette(getAutoIndex()); }, []);
  // A reset link: check it's still good before asking for a password.
  useEffect(() => {
    if (!resetToken) return;
    let live = true;
    checkResetLink(resetToken).then(st => { if (live) setResetState(st); });
    return () => { live = false; };
  }, [resetToken]);

  const verified = params.get('verified') === '1';
  const verifyProblem = params.get('verify'); // 'expired' | 'invalid'

  async function onSignIn(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null); setUnconfirmed(null);
    try {
      await signIn(form.login.trim(), form.password);
      navigate('/');
    } catch (err) {
      if (err.needsVerification) setUnconfirmed(err.email);
      setError({ message: err.message });
    } finally { setBusy(false); }
  }

  async function onCreate(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const r = await register(form.username.trim(), form.email.trim(), form.password);
      setSentTo(r.email); setDevLink(r.devVerifyUrl || null);
    } catch (err) {
      setError({ field: err.field, message: err.message });
    } finally { setBusy(false); }
  }

  async function onForgot(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const r = await forgotPassword(form.email.trim());
      setResetSentTo(form.email.trim()); setDevResetLink(r.devResetUrl || null);
    } catch (err) { setError({ field: err.field, message: err.message }); }
    finally { setBusy(false); }
  }

  async function onReset(e) {
    e.preventDefault();
    if (busy) return;
    if (form.password !== form.confirm) { setError({ field: 'confirm', message: "The two passwords don't match." }); return; }
    setBusy(true); setError(null);
    try {
      await resetPassword(resetToken, form.password);
      navigate('/login?reset_done=1', { replace: true });
      setResetState(null); setForm(f => ({ ...f, password: '', confirm: '' })); setTab('signin');
    } catch (err) { setError({ field: err.field, message: err.message }); }
    finally { setBusy(false); }
  }

  async function resend(email) {
    if (!email || busy) return;
    setBusy(true);
    try {
      const r = await resendConfirmation(email);
      setSentTo(email); setDevLink(r.devVerifyUrl || null); setUnconfirmed(null); setError(null);
    } catch (err) { setError({ message: err.message }); }
    finally { setBusy(false); }
  }

  const tabBtn = active => ({ flex: 1, border: 'none', borderRadius: 99, padding: '9px 0', cursor: 'pointer', fontFamily: SANS, fontSize: 14, fontWeight: 700, background: active ? 'var(--theme-text-pri)' : 'transparent', color: active ? 'var(--theme-bg)' : 'var(--theme-text-sec)' });
  const errFor = f => error?.field === f ? <span style={{ color: '#c2410c', textTransform: 'none', letterSpacing: 0, fontWeight: 500, fontSize: 13 }}>{error.message}</span> : null;

  let body;
  if (resetToken && resetState) {
    body = resetState === 'checking' ? <Notice>Checking your reset link…</Notice>
      : resetState !== 'ok' ? <>
        <h2 style={{ margin: 0, fontFamily: SANS, fontWeight: 900, fontSize: 26 }}>Reset link {resetState === 'expired' ? 'expired' : 'not valid'}</h2>
        <Notice tone="error">{resetState === 'expired' ? 'Reset links work for one hour.' : "That link isn't valid any more (it may already have been used)."} Ask for a new one below.</Notice>
        <button style={quiet} onClick={() => { navigate('/login', { replace: true }); setResetState(null); setForgot(true); }}>Email me a new link</button>
      </> : <>
        <h2 style={{ margin: 0, fontFamily: SANS, fontWeight: 900, fontSize: 26 }}>Choose a new password</h2>
        <form onSubmit={onReset} style={{ display: 'grid', gap: 16 }}>
          <label style={label}>New password {errFor('password')}<input style={field} type="password" value={form.password} onChange={set('password')} autoComplete="new-password" autoFocus required minLength={8} /></label>
          <label style={label}>Type it again {errFor('confirm')}<input style={field} type="password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" required minLength={8} /></label>
          <p style={{ margin: 0, fontFamily: SANS, fontSize: 13, color: 'var(--theme-text-ter)' }}>At least 8 characters. Changing it signs you out on every device.</p>
          {error && !error.field && <Notice tone="error">{error.message}</Notice>}
          <div><button type="submit" style={{ ...primary, opacity: busy ? 0.5 : 1 }} disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button></div>
        </form>
      </>;
  } else if (forgot) {
    body = resetSentTo ? <>
      <h2 style={{ margin: 0, fontFamily: SANS, fontWeight: 900, fontSize: 26 }}>Check your email</h2>
      <p style={{ margin: 0, fontFamily: SANS, fontSize: 15, lineHeight: 1.5, color: 'var(--theme-text-sec)' }}>If there's an account for <b style={{ color: 'var(--theme-text-pri)' }}>{resetSentTo}</b>, we've sent it a link to choose a new password. The link works for one hour.</p>
      {devResetLink && <Notice>Email sending isn't set up on this server yet, so here's the link: <a href={devResetLink} style={{ color: 'var(--theme-text-pri)', wordBreak: 'break-all' }}>reset the password</a></Notice>}
      <button style={quiet} onClick={() => { setForgot(false); setResetSentTo(null); setDevResetLink(null); }}>Back to sign in</button>
    </> : <>
      <h2 style={{ margin: 0, fontFamily: SANS, fontWeight: 900, fontSize: 26 }}>Forgot your password?</h2>
      <form onSubmit={onForgot} style={{ display: 'grid', gap: 16 }}>
        <label style={label}>Your account's email {errFor('email')}<input style={field} type="email" value={form.email} onChange={set('email')} autoComplete="email" autoFocus required /></label>
        <p style={{ margin: 0, fontFamily: SANS, fontSize: 13, color: 'var(--theme-text-ter)' }}>We'll email you a link to choose a new one.</p>
        {error && !error.field && <Notice tone="error">{error.message}</Notice>}
        <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="submit" style={{ ...primary, opacity: busy ? 0.5 : 1 }} disabled={busy}>{busy ? 'Sending…' : 'Email me a link'}</button>
          <button type="button" style={quiet} onClick={() => { setForgot(false); setError(null); }}>Back to sign in</button>
        </div>
      </form>
    </>;
  } else if (isLoggedIn()) {
    body = <>
      <Notice tone="ok">You're signed in as <b>{getUser()}</b>.</Notice>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <Link to="/" style={{ ...primary, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>Back to the feed</Link>
        <button style={quiet} onClick={async () => { await logout(); navigate('/login'); }}>Sign out</button>
      </div>
    </>;
  } else if (sentTo) {
    body = <>
      <h2 style={{ margin: 0, fontFamily: SANS, fontWeight: 900, fontSize: 26 }}>Check your email</h2>
      <p style={{ margin: 0, fontFamily: SANS, fontSize: 15, lineHeight: 1.5, color: 'var(--theme-text-sec)' }}>We sent a confirmation link to <b style={{ color: 'var(--theme-text-pri)' }}>{sentTo}</b>. Click it, then sign in. The link works for 24 hours.</p>
      {devLink && <Notice>Email sending isn't set up on this server yet, so here's the link: <a href={devLink} style={{ color: 'var(--theme-text-pri)', wordBreak: 'break-all' }}>confirm {sentTo}</a></Notice>}
      {error && <Notice tone="error">{error.message}</Notice>}
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        <button style={quiet} disabled={busy} onClick={() => resend(sentTo)}>{busy ? 'Sending…' : 'Send it again'}</button>
        <button style={quiet} onClick={() => { setSentTo(null); setDevLink(null); setTab('signin'); }}>Go to sign in</button>
      </div>
    </>;
  } else {
    body = <>
      <div role="tablist" style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 99, border: '1px solid var(--theme-border)' }}>
        <button role="tab" aria-selected={tab === 'signin'} style={tabBtn(tab === 'signin')} onClick={() => { setTab('signin'); setError(null); }}>Sign in</button>
        <button role="tab" aria-selected={tab === 'create'} style={tabBtn(tab === 'create')} onClick={() => { setTab('create'); setError(null); }}>Create account</button>
      </div>

      {verified && <Notice tone="ok">Email confirmed. Sign in to start posting.</Notice>}
      {passwordChanged && <Notice tone="ok">Password changed. Sign in with your new one.</Notice>}
      {verifyProblem && <Notice tone="error">{verifyProblem === 'expired' ? 'That confirmation link has expired.' : "That confirmation link isn't valid any more (it may already have been used)."} Sign in and we'll offer to send a new one.</Notice>}

      {tab === 'signin' ? (
        <form onSubmit={onSignIn} style={{ display: 'grid', gap: 16 }}>
          <label style={label}>Username or email<input style={field} value={form.login} onChange={set('login')} autoComplete="username" autoFocus required /></label>
          <label style={label}>Password<input style={field} type="password" value={form.password} onChange={set('password')} autoComplete="current-password" required /></label>
          {error && !error.field && <Notice tone="error">{error.message}{unconfirmed && <> <button type="button" style={quiet} onClick={() => resend(unconfirmed)}>Send a new link</button></>}</Notice>}
          <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="submit" style={{ ...primary, opacity: busy ? 0.5 : 1 }} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
            <button type="button" style={quiet} onClick={() => { setForgot(true); setError(null); setForm(f => ({ ...f, email: f.login.includes('@') ? f.login : f.email })); }}>Forgot your password?</button>
          </div>
        </form>
      ) : (
        <form onSubmit={onCreate} style={{ display: 'grid', gap: 16 }}>
          <label style={label}>Username {errFor('username')}<input style={field} value={form.username} onChange={set('username')} autoComplete="username" autoFocus required minLength={3} maxLength={24} pattern="[A-Za-z0-9_.\-]{3,24}" title="3–24 characters: letters, numbers, . _ or -" /></label>
          <label style={label}>Email {errFor('email')}<input style={field} type="email" value={form.email} onChange={set('email')} autoComplete="email" required /></label>
          <label style={label}>Password {errFor('password')}<input style={field} type="password" value={form.password} onChange={set('password')} autoComplete="new-password" required minLength={8} /></label>
          <p style={{ margin: 0, fontFamily: SANS, fontSize: 13, color: 'var(--theme-text-ter)' }}>At least 8 characters. We'll email you a link to confirm your address.</p>
          {error && !error.field && <Notice tone="error">{error.message}</Notice>}
          <p style={{ margin: 0, fontFamily: SANS, fontSize: 13, lineHeight: 1.5, color: 'var(--theme-text-ter)' }}>By creating an account you agree to the <Link to="/terms" style={{ color: 'var(--theme-text-pri)' }}>Terms</Link> and that you’re 13 or over. What we keep and why: <Link to="/privacy" style={{ color: 'var(--theme-text-pri)' }}>Privacy</Link>.</p>
          <div><button type="submit" style={{ ...primary, opacity: busy ? 0.5 : 1 }} disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button></div>
        </form>
      )}
    </>;
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--theme-bg)', color: 'var(--theme-text-pri)', display: 'grid', placeItems: 'center', padding: '32px 16px', boxSizing: 'border-box', transition: 'background 0.8s' }}>
      <div style={{ width: '100%', maxWidth: 420, display: 'grid', gap: 22 }}>
        <Link to="/" style={{ textDecoration: 'none', color: 'var(--theme-text-pri)' }}>
          <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 44, letterSpacing: '-0.03em', lineHeight: 0.9 }}>Late Night<br />Vibes</div>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--theme-text-ter)', marginTop: 10 }}>← back to the feed</div>
        </Link>
        <div style={{ background: 'var(--theme-sidebar)', borderRadius: 40, padding: '30px 30px 34px', display: 'grid', gap: 18, boxShadow: '0 0 48px rgba(0,0,0,0.11), 0 30px 60px -12px rgba(0,0,0,0.19)' }}>
          {body}
        </div>
      </div>
    </div>
  );
}
