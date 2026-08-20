import { useCallback, useEffect, useState } from 'react';
import { isConfigured } from './config';
import type { Booking, RemoteConfig, Session, StepUpProof } from './types';
import { bookingApi } from './services';
import SignIn from './components/SignIn';
import Rooms, { BookingRequest } from './components/Rooms';
import Bookings from './components/Bookings';
import StepUpModal from './components/StepUpModal';
import EventLog from './components/EventLog';
import AdminPanel from './components/AdminPanel';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [remote, setRemote] = useState<RemoteConfig | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [pendingBooking, setPendingBooking] = useState<BookingRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(null), 3500);
  };

  const refresh = useCallback(async (s: Session) => {
    setBookings(await bookingApi.list(s));
  }, []);

  useEffect(() => {
    if (!session) return;
    bookingApi
      .getConfig(session)
      .then(setRemote)
      .catch((err) => showToast((err as Error).message));
    void refresh(session);
  }, [session, refresh]);

  const submitBooking = async (req: BookingRequest, proof?: StepUpProof) => {
    if (!session) return;
    setBusy(true);
    try {
      const result = await bookingApi.create(
        session,
        { roomId: req.room.id, nights: req.nights },
        proof,
      );
      if (result.status === 'created') {
        setPendingBooking(null);
        showToast(
          result.booking.stepUpVerified
            ? `Booking confirmed with step-up verification — ${result.booking.roomName}`
            : `Booking confirmed — ${result.booking.roomName}`,
        );
        await refresh(session);
      } else if (result.status === 'step_up_required') {
        // The API refused: keep the request and open the step-up dialog.
        setPendingBooking(req);
      } else {
        setPendingBooking(req);
        showToast(result.reason);
      }
    } catch (err) {
      showToast((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!isConfigured) {
    return (
      <div className="signin-wrap">
        <div className="signin-card">
          <h1>ANYCOMPANY</h1>
          <p className="tagline">Demo UI is not configured</p>
          <p>
            Deploy the stack with <code>./scripts/deploy.sh</code> — it writes{' '}
            <code>web/.env.local</code> with the Cognito and API settings this UI needs, then
            publishes the site.
          </p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <SignIn onSignedIn={setSession} />;
  }

  const isAdmin = session.groups.includes('admins');

  return (
    <div className="app-shell">
      <header className="header">
        <div className="brand">
          <span className="brand-mark">ANYCOMPANY</span>
          <span className="brand-sub">Hotels &amp; Resorts</span>
        </div>
        <div className="header-user">
          <span className="mode-pill live">{isAdmin ? 'admin' : 'live mode'}</span>
          <span>{session.email}</span>
          <button
            className="btn-ghost"
            onClick={() => {
              setSession(null);
              setRemote(null);
              setBookings([]);
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="main-grid">
        <main>
          {remote ? (
            <Rooms rooms={remote.rooms} threshold={remote.threshold} onBook={(req) => void submitBooking(req)} busy={busy} />
          ) : (
            <h2 className="section-title">Loading room catalog…</h2>
          )}
          <Bookings bookings={bookings} />
        </main>
        <aside className="sidebar">
          {isAdmin && remote && (
            <AdminPanel
              session={session}
              threshold={remote.threshold}
              onThresholdChanged={(value) => setRemote({ ...remote, threshold: value })}
            />
          )}
          <EventLog />
        </aside>
      </div>

      {pendingBooking && (
        <StepUpModal
          session={session}
          amount={pendingBooking.total}
          onCancel={() => setPendingBooking(null)}
          onVerified={(proof) => void submitBooking(pendingBooking, proof)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
