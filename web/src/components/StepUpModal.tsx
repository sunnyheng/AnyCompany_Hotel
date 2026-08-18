import { FormEvent, useEffect, useState } from 'react';
import type { Session, StepUpProof } from '../types';
import { auth } from '../services';

interface Props {
  session: Session;
  amount: number;
  onVerified: (proof: StepUpProof) => void;
  onCancel: () => void;
}

type Phase = 'sending' | 'awaiting' | 'verifying' | 'failed';

export default function StepUpModal({ session, amount, onVerified, onCancel }: Props) {
  const [phase, setPhase] = useState<Phase>('sending');
  const [destination, setDestination] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const begin = async () => {
    setPhase('sending');
    setMessage(null);
    setCode('');
    try {
      const challenge = await auth.startStepUp(session);
      setDestination(challenge.destination);
      setPhase('awaiting');
    } catch (err) {
      setMessage((err as Error).message);
      setPhase('failed');
    }
  };

  useEffect(() => {
    void begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setPhase('verifying');
    setMessage(null);
    const result = await auth.answerStepUp(code.trim());
    if (result.status === 'verified') {
      onVerified(result.proof);
      return;
    }
    if (result.status === 'retry') {
      setMessage(`Incorrect code — ${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? '' : 's'} left.`);
      setCode('');
      setPhase('awaiting');
      return;
    }
    setMessage(result.reason);
    setPhase('failed');
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Step-up verification">
      <div className="modal">
        <h2>Verify it&apos;s you</h2>
        <p>
          This booking of <strong>${amount}</strong> exceeds your standard limit. We&apos;ve sent a
          6-digit code to <strong>{destination || 'your email'}</strong> to confirm this
          high-value transaction.
        </p>
        {phase === 'sending' ? (
          <p className="success-text">Sending verification code…</p>
        ) : (
          <form onSubmit={submit}>
            <input
              className="otp-input"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              placeholder="••••••"
              value={code}
              autoFocus
              disabled={phase === 'failed' || phase === 'verifying'}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
            {message && <p className="error-text">{message}</p>}
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={onCancel}>
                Cancel
              </button>
              {phase === 'failed' ? (
                <button type="button" className="btn-primary" onClick={() => void begin()}>
                  Start again
                </button>
              ) : (
                <button className="btn-primary" disabled={code.length !== 6 || phase === 'verifying'}>
                  {phase === 'verifying' ? 'Verifying…' : 'Verify & book'}
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
