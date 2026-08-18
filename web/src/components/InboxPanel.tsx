import { useEffect, useState } from 'react';
import { mockInbox, MockEmail } from '../services';

/**
 * Simulated email inbox, only rendered in mock mode. Stands in for the SES
 * delivery of the OTP so the full step-up flow can be demonstrated with no
 * AWS resources (ADR-006 / ADR-007).
 */
export default function InboxPanel() {
  const [emails, setEmails] = useState<MockEmail[]>([]);

  useEffect(() => mockInbox.subscribe(setEmails), []);

  return (
    <div className="panel">
      <h2>Simulated inbox (mock mode)</h2>
      {emails.length === 0 ? (
        <div className="empty">OTP emails will land here.</div>
      ) : (
        emails.map((mail) => (
          <div className="inbox-mail" key={mail.at}>
            <div className="subject">{mail.subject}</div>
            <div className="booking-meta">
              to {mail.to} · {new Date(mail.at).toLocaleTimeString()}
            </div>
            <div className="otp">{mail.otp}</div>
          </div>
        ))
      )}
    </div>
  );
}
