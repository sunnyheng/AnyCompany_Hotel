/**
 * DefineAuthChallenge trigger — the state machine of the CUSTOM_AUTH flow.
 *
 * The client starts a CUSTOM_AUTH round only when the booking API demands
 * step-up, so every round is: issue one CUSTOM_CHALLENGE (an emailed OTP),
 * then either succeed (issue tokens) or let the user retry up to
 * MAX_ATTEMPTS times before failing the whole session.
 */

const MAX_ATTEMPTS = 3;

export const handler = async (event) => {
  const session = event.request.session ?? [];
  const last = session[session.length - 1];

  if (last && last.challengeName === 'CUSTOM_CHALLENGE' && last.challengeResult === true) {
    // OTP answered correctly — finish the flow and issue fresh tokens.
    event.response.issueTokens = true;
    event.response.failAuthentication = false;
    return event;
  }

  const failedAttempts = session.filter(
    (entry) => entry.challengeName === 'CUSTOM_CHALLENGE' && entry.challengeResult === false,
  ).length;

  if (failedAttempts >= MAX_ATTEMPTS) {
    // Too many wrong OTPs — kill this session; the user must restart step-up.
    event.response.issueTokens = false;
    event.response.failAuthentication = true;
    return event;
  }

  event.response.issueTokens = false;
  event.response.failAuthentication = false;
  event.response.challengeName = 'CUSTOM_CHALLENGE';
  return event;
};
