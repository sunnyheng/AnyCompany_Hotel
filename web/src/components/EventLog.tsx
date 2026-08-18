import { useEffect, useState } from 'react';
import type { AuthEvent } from '../types';
import { eventLog } from '../services';

/**
 * Live view of every auth interaction — the piece that makes the pattern
 * visible during a customer demo: which party (browser, Cognito, booking
 * API) did what, in what order.
 */
export default function EventLog() {
  const [events, setEvents] = useState<AuthEvent[]>([]);

  useEffect(() => eventLog.subscribe(setEvents), []);

  return (
    <div className="panel">
      <h2>Auth event log</h2>
      {events.length === 0 ? (
        <div className="empty">Events appear here as you interact.</div>
      ) : (
        <div className="event-log">
          {events.map((e, i) => (
            <div className="event-row" key={`${e.at}-${i}`}>
              <span className={`actor ${e.actor.replace(' ', '')}`}>
                {e.actor} · {new Date(e.at).toLocaleTimeString()}
              </span>
              <div className="title">{e.title}</div>
              {e.detail && <div className="detail">{e.detail}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
