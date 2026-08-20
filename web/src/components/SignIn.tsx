import { FormEvent, useState } from 'react';
import type { Session } from '../types';
import { auth } from '../services';

type View = 'signin' | 'signup' | 'confirm';

export default function SignIn({ onSignedIn }: { onSignedIn: (session: Session) => void }) {
  const [view, setView] = useState<View>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    fn()
      .catch((err) => setError((err as Error).message))
      .finally(() => setBusy(false));
  };

  const switchTo = (v: View) => {
    setView(v);
    setError(null);
    setNotice(null);
    setCode('');
  };

  const submitSignIn = (e: FormEvent) => {
    e.preventDefault();
    run(async () => onSignedIn(await auth.signIn(email.trim(), password)));
  };

  const submitSignUp = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      await auth.signUp(email.trim(), password);
      setNotice(`We emailed a verification code to ${email.trim()}.`);
      setView('confirm');
    });
  };

  const submitConfirm = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      await auth.confirmSignUp(email.trim(), code.trim());
      // The account is confirmed; sign straight in with the same credentials.
      onSignedIn(await auth.signIn(email.trim(), password));
    });
  };

  const emailField = (
    <div className="field">
      <label htmlFor="email">Email</label>
      <input
        id="email"
        type="email"
        autoComplete="username"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
    </div>
  );

  const passwordField = (autoComplete: string) => (
    <div className="field">
      <label htmlFor="password">Password</label>
      <input
        id="password"
        type="password"
        autoComplete={autoComplete}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
    </div>
  );

  return (
    <div className="signin-wrap">
      {view === 'signin' && (
        <form className="signin-card" onSubmit={submitSignIn}>
          <h1>ANYCOMPANY</h1>
          <p className="tagline">Hotels &amp; Resorts — Loyalty sign-in</p>
          {emailField}
          {passwordField('current-password')}
          {error && <p className="error-text">{error}</p>}
          <button className="btn-primary" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <div className="hint">
            New to AnyCompany?{' '}
            <button type="button" className="btn-ghost" onClick={() => switchTo('signup')}>
              Create an account
            </button>
          </div>
        </form>
      )}

      {view === 'signup' && (
        <form className="signin-card" onSubmit={submitSignUp}>
          <h1>ANYCOMPANY</h1>
          <p className="tagline">Hotels &amp; Resorts — Create your account</p>
          {emailField}
          {passwordField('new-password')}
          <div className="hint">
            At least 12 characters with upper and lower case, a digit and a symbol.
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn-primary" disabled={busy}>
            {busy ? 'Creating account…' : 'Create account'}
          </button>
          <div className="hint">
            Already registered?{' '}
            <button type="button" className="btn-ghost" onClick={() => switchTo('signin')}>
              Sign in
            </button>
          </div>
        </form>
      )}

      {view === 'confirm' && (
        <form className="signin-card" onSubmit={submitConfirm}>
          <h1>ANYCOMPANY</h1>
          <p className="tagline">Hotels &amp; Resorts — Verify your email</p>
          {notice && <div className="hint">{notice}</div>}
          <div className="field">
            <label htmlFor="code">Verification code</label>
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn-primary" disabled={busy}>
            {busy ? 'Verifying…' : 'Verify and sign in'}
          </button>
          <div className="hint">
            Wrong address?{' '}
            <button type="button" className="btn-ghost" onClick={() => switchTo('signup')}>
              Start over
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
