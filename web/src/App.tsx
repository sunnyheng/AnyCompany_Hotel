import { useCallback, useEffect, useState } from 'react';
import { config } from './config';
import type { Booking, BookingInput, Session, StepUpProof } from './types';
import { bookingApi } from './services';
import SignIn from './components/SignIn';
import Rooms, { BookingRequest } from './components/Rooms';
import Bookings from './components/Bookings';
import StepUpModal from './components/StepUpModal';
import EventLog from './components/EventLog';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [pendingBooking, setPendingBooking] = useState<BookingInput | null>(null);
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
    if (session) void refresh(session);
  }, [session, refresh]);

  const submitBooking = async (input: BookingInput, proof?: StepUpProof) => {
    if (!session) return;
    setBusy(true);
    try {
      const result = await bookingApi.create(session, input, proof);
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
        setPendingBooking(input);
      } else {
        setPendingBooking(input);
        showToast(result.reason);
      }
    } catch (err) {
      showToast((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onBook = (req: BookingRequest) =>
    void submitBooking({
      roomId: req.room.id,
      roomName: req.room.name,
      nights: req.nights,
      amount: req.total,
      currency: 'USD',
    });

  if (!session) {
    return <SignIn onSignedIn={setSession} />;
  }

  return (
    <div className="app-shell">
      <header className="header">
        <div className="brand">
          <span className="brand-mark">ANYCOMPANY</span>
          <span className="brand-sub">Hotels &amp; Resorts</span>
        </div>
        <div className="header-user">
          <span className={`mode-pill ${config.mode}`}>{config.mode} mode</span>
          <span>{session.email}</span>
          <button className="btn-ghost" onClick={() => setSession(null)}>
            Sign out
          </button>
        </div>
      </header>

      <div className="main-grid">
        <main>
          <Rooms onBook={onBook} busy={busy} />
          <Bookings bookings={bookings} />
        </main>
        <aside className="sidebar">
          <EventLog />
        </aside>
      </div>

      {pendingBooking && (
        <StepUpModal
          session={session}
          amount={pendingBooking.amount}
          onCancel={() => setPendingBooking(null)}
          onVerified={(proof) => void submitBooking(pendingBooking, proof)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
