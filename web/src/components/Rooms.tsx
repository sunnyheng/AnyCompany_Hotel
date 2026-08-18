import { useState } from 'react';
import { config } from '../config';
import { ROOMS, Room } from '../types';

export interface BookingRequest {
  room: Room;
  nights: number;
  total: number;
}

export default function Rooms({ onBook, busy }: { onBook: (req: BookingRequest) => void; busy: boolean }) {
  const [nights, setNights] = useState<Record<string, number>>({});

  return (
    <>
      <h2 className="section-title">Rooms — Grand Marina Property</h2>
      <div className="rooms-grid">
        {ROOMS.map((room) => {
          const n = nights[room.id] ?? 1;
          const total = room.pricePerNight * n;
          const needsStepUp = total > config.stepUpThreshold;
          return (
            <div className="room-card" key={room.id}>
              <h3>{room.name}</h3>
              <div className="desc">{room.description}</div>
              <div className="room-price">
                ${room.pricePerNight} <small>/ night</small>
              </div>
              <div className="room-actions">
                <select
                  className="nights-select"
                  value={n}
                  aria-label={`Nights for ${room.name}`}
                  onChange={(e) => setNights({ ...nights, [room.id]: Number(e.target.value) })}
                >
                  {[1, 2, 3, 4, 5].map((v) => (
                    <option key={v} value={v}>
                      {v} night{v > 1 ? 's' : ''}
                    </option>
                  ))}
                </select>
                <button
                  className="btn-book"
                  disabled={busy}
                  onClick={() => onBook({ room, nights: n, total })}
                >
                  Book · ${total}
                </button>
              </div>
              {needsStepUp && <div className="stepup-note">⬆ Step-up verification will be required</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}
