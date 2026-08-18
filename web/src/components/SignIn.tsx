import { FormEvent, useState } from 'react';
import { config } from '../config';
import type { Session } from '../types';
import { auth } from '../services';

export default function SignIn({ onSignedIn }: { onSignedIn: (session: Session) => void }) {
  const [email, setEmail] = useState(config.mode === 'mock' ? 'demo@anycompany.example' : '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await auth.signIn(email.trim(), password));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="signin-wrap">
      <form className="signin-card" onSubmit={submit}>
        <h1>ANYCOMPANY</h1>
        <p className="tagline">Hotels &amp; Resorts — Loyalty sign-in</p>
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
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn-primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        {config.mode === 'mock' && (
          <div className="hint">
            Mock mode — sign in with <code>demo@anycompany.example</code> /{' '}
            <code>Demo#Pass1</code>. No AWS resources are used.
          </div>
        )}
      </form>
    </div>
  );
}
