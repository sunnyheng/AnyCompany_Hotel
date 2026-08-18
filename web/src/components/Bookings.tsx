import type { Booking } from '../types';

export default function Bookings({ bookings }: { bookings: Booking[] }) {
  return (
    <>
      <h2 className="section-title">My bookings</h2>
      {bookings.length === 0 ? (
        <div className="empty">No bookings yet — pick a room above.</div>
      ) : (
        <div className="booking-list">
          {bookings.map((b) => (
            <div className="booking-row" key={b.id}>
              <div>
                <div>
                  {b.roomName} · {b.nights} night{b.nights > 1 ? 's' : ''} · ${b.amount}
                </div>
                <div className="booking-meta">{new Date(b.createdAt).toLocaleString()}</div>
              </div>
              {b.stepUpVerified ? (
                <span className="badge verified">step-up verified</span>
              ) : (
                <span className="badge standard">standard</span>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
