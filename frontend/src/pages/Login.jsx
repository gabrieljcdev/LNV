import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { signIn, register, resendConfirmation, isLoggedIn, getUser, logout, forgotPassword, resetPassword, checkResetLink } from '../lib/auth';
import { applyPalette, getAutoIndex } from '../services/themeService';
import { Blk } from '../components/Blocks';
import { BLOCK_CP, BLOCK_CSS } from '../lib/blocksKit';
import { MODULE_CARDS, MODULE_CSS, moduleLook, modFrameFor, solid } from '../lib/moduleKit';

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

export default function Login({ embedded = false, startTab, onClose } = {}) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState(params.get('tab') === 'create' || startTab === 'create' ? 'create' : 'signin');
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

  useEffect(() => { if (!embedded) applyPalette(getAutoIndex()); }, [embedded]); // embedded in the feed it keeps the palette you chose
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
      if (embedded) window.location.assign('/'); else navigate('/');
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

  const P1 = MODULE_CARDS ? { ...primary, background: 'var(--lv-pri)', color: 'var(--blk-bg)' } : primary;
  const tabBtn = active => ({ flex: 1, border: 'none', borderRadius: 99, padding: '9px 0', cursor: 'pointer', fontFamily: SANS, fontSize: 14, fontWeight: 700, background: active ? 'var(--theme-text-pri)' : 'transparent', color: active ? 'var(--blk-bg)' : 'var(--theme-text-sec)' });
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
          <div><button type="submit" style={{ ...P1, opacity: busy ? 0.5 : 1 }} disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button></div>
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
          <button type="submit" style={{ ...P1, opacity: busy ? 0.5 : 1 }} disabled={busy}>{busy ? 'Sending…' : 'Email me a link'}</button>
          <button type="button" style={quiet} onClick={() => { setForgot(false); setError(null); }}>Back to sign in</button>
        </div>
      </form>
    </>;
  } else if (isLoggedIn()) {
    body = <>
      <Notice tone="ok">You're signed in as <b>{getUser()}</b>.</Notice>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <Link to="/" style={{ ...P1, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>Back to the feed</Link>
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
            <button type="submit" style={{ ...P1, opacity: busy ? 0.5 : 1 }} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
            <button type="button" style={quiet} onClick={() => { setForgot(true); setError(null); setForm(f => ({ ...f, email: f.login.includes('@') ? f.login : f.email })); }}>Forgot your password?</button>
          </div>
        </form>
      ) : (
        <form onSubmit={onCreate} style={{ display: 'grid', gap: 16 }}>
          {/* What an account is for (gabriel, 2026-10-10): digging through other people, playlists, your Discogs shelf, and building the link database together. */}
          <div style={{ display: 'grid', gap: 8, padding: '14px 16px', borderRadius: 18, background: 'color-mix(in srgb, var(--theme-text-pri) 7%, transparent)' }}>
            <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--theme-text-ter)' }}>Dig with other people</div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 7, fontFamily: SANS, fontSize: 14, lineHeight: 1.4, color: 'var(--theme-text-sec)' }}>
              <li><b style={{ color: 'var(--theme-text-pri)' }}>Find people</b> and look through their shelves: what they post, keep and highlight.</li>
              <li><b style={{ color: 'var(--theme-text-pri)' }}>Make playlists</b> and share them with friends.</li>
              <li><b style={{ color: 'var(--theme-text-pri)' }}>Bring in your Discogs</b> collection and wantlist as playlists. They’re private to you; sharing them with friends is coming.</li>
              <li><b style={{ color: 'var(--theme-text-pri)' }}>Help build it.</b> This is a community-built database: post a record, add a link to a track with none, highlight your favourite.</li>
            </ul>
          </div>
          <label style={label}>Username {errFor('username')}<input style={field} value={form.username} onChange={set('username')} autoComplete="username" autoFocus required minLength={3} maxLength={24} pattern="[A-Za-z0-9_.\-]{3,24}" title="3–24 characters: letters, numbers, . _ or -" /></label>
          <label style={label}>Email {errFor('email')}<input style={field} type="email" value={form.email} onChange={set('email')} autoComplete="email" required /></label>
          <label style={label}>Password {errFor('password')}<input style={field} type="password" value={form.password} onChange={set('password')} autoComplete="new-password" required minLength={8} /></label>
          <p style={{ margin: 0, fontFamily: SANS, fontSize: 13, color: 'var(--theme-text-ter)' }}>At least 8 characters. We'll email you a link to confirm your address.</p>
          {error && !error.field && <Notice tone="error">{error.message}</Notice>}
          <div><button type="submit" style={{ ...P1, opacity: busy ? 0.5 : 1 }} disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button></div>
        </form>
      )}
    </>;
  }

  const MOD = MODULE_CARDS
  const ML = moduleLook(0);
  const stateKey = resetToken && resetState ? 'reset' : forgot ? (resetSentTo ? 'email' : 'forgot') : sentTo ? 'email' : isLoggedIn() ? 'in' : tab;
  const tone = t => (MOD ? solid(t === 'showcase' ? ML.a1 : ML.base) : [`var(--theme-${t})`, `var(--theme-${t})`]);
  if (MOD && embedded) {
    const SIDE = {
      signin: ['New here?', <p key="p" style={{ margin: 0, fontSize: 15.5, lineHeight: 1.45 }}>Make an account to follow people, build playlists and bring in your Discogs.</p>, <button key="b" onClick={() => { setTab('create'); setError(null); }} style={{ ...P1, marginTop: 'auto' }}>Create an account</button>],
      create: ['Dig with other people', <ul key="u" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 11, fontSize: 14.5, lineHeight: 1.4 }}><li><b>Find people</b> and look through their shelves.</li><li><b>Make playlists</b> and share them with friends.</li><li><b>Bring in your Discogs</b> as private playlists.</li><li><b>Help build it:</b> post a record, add a link to a track with none.</li></ul>, null],
      forgot: ['How it works', <ul key="u" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 11, fontSize: 14.5, lineHeight: 1.4 }}><li><b>We email you</b> a one-time link.</li><li><b>You choose</b> a new password.</li><li><b>You're back in.</b> The link works for an hour.</li></ul>, null],
      email: ["If it doesn't come", <ul key="u" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 11, fontSize: 14.5, lineHeight: 1.4 }}><li><b>Look in spam</b> or promotions.</li><li><b>Check the address</b> you typed.</li><li><b>Ask for another</b> from the button beside it.</li></ul>, null],
      reset: ['Almost there', <p key="p" style={{ margin: 0, fontSize: 15.5, lineHeight: 1.45 }}>Choose a new password. Changing it signs you out on every device.</p>, null],
    };
    const side = SIDE[stateKey] || SIDE.signin;
    const ink = { '--theme-text-pri': 'var(--lv-pri)', '--theme-text-sec': 'var(--lv-sec)', '--theme-text-ter': 'var(--lv-ter)', '--theme-border': 'color-mix(in srgb, var(--lv-pri) 22%, transparent)' };
    const mono = { fontFamily: MONO, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' };
    return (
      <div style={{ position: 'relative', flexShrink: 0, width: 800, height: '100%', padding: '14px 0', boxSizing: 'border-box' }}>
        <style>{BLOCK_CSS}{MODULE_CSS}</style>
        <div className="lnv-mod" style={{ ...modFrameFor(ML), height: '100%', display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr) 300px', gridTemplateRows: 'minmax(120px, 190px) minmax(0, 1fr)', gridTemplateAreas: '"brand brand" "form side"' }}>
          {/* the Chewing the Ceiling box: blank until the brand is done (TODO, 14 Oct) */}
          <Blk bg={solid(ML.base)} className="lnv-still" aria-hidden="true" style={{ gridArea: 'brand', borderRadius: 40 }} />
          <Blk bg={solid(ML.base)} className="lnv-still" style={{ gridArea: 'form', borderRadius: 40, padding: '26px 30px 28px', overflowY: 'auto', scrollbarWidth: 'none', display: 'grid', gap: 18, alignContent: 'start', ...ink }}>
            {body}
          </Blk>
          <div style={{ gridArea: 'side', display: 'grid', gap: 7, gridTemplateRows: 'minmax(0, 1fr) auto', minHeight: 0 }}>
            <Blk bg={solid(ML.a1)} className="lnv-still" style={{ borderRadius: 40, padding: 14, display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
              <div className="mod-hatch" style={{ flex: '0 0 40px' }}><span style={{ ...mono, position: 'absolute', left: 10, top: 10, fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'var(--lv-pri)', color: 'var(--blk-bg)' }}>{side[0]}</span></div>
              {side[1]}{side[2]}
            </Blk>
            <Blk bg={solid(ML.base)} className="lnv-still" style={{ borderRadius: 40, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} onClick={() => onClose?.()}>
              <span style={{ minWidth: 0 }}><b style={{ display: 'block', fontFamily: SANS, fontSize: 15, fontWeight: 600 }}>Keep browsing</b><span style={{ fontFamily: SANS, fontSize: 12.5, opacity: 0.65 }}>The feed needs no account</span></span>
              <span aria-hidden="true" style={{ marginLeft: 'auto', width: 34, height: 34, borderRadius: '50%', background: 'var(--lv-pri)', color: 'var(--blk-bg)', display: 'grid', placeItems: 'center', flex: 'none' }}>›</span>
            </Blk>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ minHeight: '100vh', background: 'var(--theme-bg)', color: 'var(--theme-text-pri)', display: 'grid', placeItems: 'center', padding: '32px 16px', boxSizing: 'border-box', transition: 'background 0.8s' }}>
      <style>{BLOCK_CSS}{MODULE_CSS}</style>
      <div className={MOD ? 'lnv-mod' : undefined} style={{ width: '100%', maxWidth: 480, display: 'grid', gap: MOD ? 7 : 8, ...(MOD ? modFrameFor(ML) : null) }}>
        {/* the sign-in page is the blocks look too: the name in the profile card's colour, the form in a block of its own */}
        <Blk bg={tone('showcase')} cut={MOD ? undefined : 'br'} style={{ padding: '30px 30px 34px' }}>
          {MOD ? <div style={{ minHeight: 110 }} aria-hidden="true" /> : <Link to="/" style={{ position: 'relative', textDecoration: 'none', color: 'inherit', display: 'grid', gap: 14 }}>
            <div style={MOD ? { fontFamily: SANS, fontWeight: 600, fontSize: 58, letterSpacing: '-0.05em', lineHeight: 0.92 } : { fontFamily: BLOCK_CP, fontWeight: 700, fontSize: 46, letterSpacing: '-0.01em', lineHeight: 0.95, textTransform: 'uppercase' }}>Chewing<br />the Ceiling{MOD && <span style={{ opacity: 0.55 }}>.</span>}</div>
            <span className="lnv-pb" style={{ justifySelf: 'start', border: '1.5px solid currentColor', borderRadius: 999, padding: '8px 16px', fontFamily: BLOCK_CP, fontWeight: 700, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase' }}>← back to the feed</span>
          </Link>}
        </Blk>
        <Blk bg={tone('light2')} cut={MOD ? undefined : 'tl'} style={{ padding: '30px 30px 34px', display: 'grid', gap: 18 }}>
          {body}
          {MOD && <Link to="/" style={{ ...quiet, justifySelf: 'start', color: 'inherit', fontSize: 13 }}>← back to the feed</Link>}
        </Blk>
      </div>
    </div>
  );
}
