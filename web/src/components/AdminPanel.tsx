import { FormEvent, useEffect, useState } from 'react';
import type { Session } from '../types';
import { bookingApi } from '../services';

/**
 * Admin-only panel (the API independently enforces the admins group): shows
 * the current step-up threshold and lets an administrator change it. The new
 * value takes effect immediately for every user's next booking.
 */
export default function AdminPanel({
  session,
  threshold,
  onThresholdChanged,
}: {
  session: Session;
  threshold: number;
  onThresholdChanged: (value: number) => void;
}) {
  const [value, setValue] = useState(String(threshold));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => setValue(String(threshold)), [threshold]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next = Number(value);
    if (!Number.isFinite(next) || next <= 0) {
      setStatus('Enter a positive amount.');
      return;
    }
    setBusy(true);
    setStatus(null);
    bookingApi
      .updateThreshold(session, next)
      .then((applied) => {
        onThresholdChanged(applied);
        setStatus(`Saved — step-up now required above $${applied}.`);
      })
      .catch((err) => setStatus((err as Error).message))
      .finally(() => setBusy(false));
  };

  return (
    <div className="panel">
      <h2>Admin — step-up threshold</h2>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="threshold">Require step-up above ($)</label>
          <input
            id="threshold"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
          />
        </div>
        {status && <div className="hint">{status}</div>}
        <button className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save threshold'}
        </button>
      </form>
    </div>
  );
}
