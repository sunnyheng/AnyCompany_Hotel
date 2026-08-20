/**
 * Live implementations talking to a deployed stack: Amazon Cognito for the
 * USER_PASSWORD_AUTH and CUSTOM_AUTH flows, and the booking HTTP API for
 * bookings. Selected when web/.env.local carries the CDK stack outputs.
 */
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { config } from '../config';
import type {
  Booking,
  BookingInput,
  CreateBookingResult,
  Session,
  StepUpAnswerResult,
  StepUpProof,
} from '../types';
import type { AuthService, BookingService, StepUpChallenge } from './types';
import { logEvent } from './types';

// Instantiated lazily: the module can be imported before configuration is
// checked, and the SDK client constructor throws without a region.
let cognitoClient: CognitoIdentityProviderClient | null = null;
const client = () =>
  (cognitoClient ??= new CognitoIdentityProviderClient({ region: config.region }));

const MAX_ATTEMPTS = 3;

/** Decode a JWT payload without verifying — display-only, never for trust decisions. */
const jwtPayload = (token: string): Record<string, unknown> => {
  const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(base64));
};

interface PendingChallenge {
  username: string;
  session: string;
  attempts: number;
}

let pending: PendingChallenge | null = null;

export const liveAuth: AuthService = {
  async signIn(email, password) {
    logEvent('Browser', 'InitiateAuth (USER_PASSWORD_AUTH)', email);
    const result = await client().send(
      new InitiateAuthCommand({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: config.userPoolClientId,
        AuthParameters: { USERNAME: email, PASSWORD: password },
      }),
    );
    const auth = result.AuthenticationResult;
    if (!auth?.IdToken || !auth.AccessToken) {
      throw new Error('Unexpected challenge during primary sign-in.');
    }
    logEvent('Cognito', 'Tokens issued', 'ID + access + refresh (primary session)');
    return {
      email,
      sub: String(jwtPayload(auth.IdToken).sub),
      idToken: auth.IdToken,
      accessToken: auth.AccessToken,
    };
  },

  async startStepUp(session): Promise<StepUpChallenge> {
    logEvent('Browser', 'InitiateAuth (CUSTOM_AUTH)', session.email);
    const result = await client().send(
      new InitiateAuthCommand({
        AuthFlow: 'CUSTOM_AUTH',
        ClientId: config.userPoolClientId,
        AuthParameters: { USERNAME: session.email },
      }),
    );
    if (result.ChallengeName !== 'CUSTOM_CHALLENGE' || !result.Session) {
      throw new Error(`Expected CUSTOM_CHALLENGE, got ${result.ChallengeName ?? 'tokens'}`);
    }
    pending = { username: session.email, session: result.Session, attempts: 0 };
    const destination = result.ChallengeParameters?.destination ?? 'your email';
    logEvent('Cognito', 'CUSTOM_CHALLENGE issued', `OTP delivered to ${destination}`);
    return { destination };
  },

  async answerStepUp(code): Promise<StepUpAnswerResult> {
    if (!pending) {
      return { status: 'failed', reason: 'No step-up in progress. Start again.' };
    }
    logEvent('Browser', 'RespondToAuthChallenge', 'ANSWER submitted');
    try {
      const result = await client().send(
        new RespondToAuthChallengeCommand({
          ClientId: config.userPoolClientId,
          ChallengeName: 'CUSTOM_CHALLENGE',
          Session: pending.session,
          ChallengeResponses: { USERNAME: pending.username, ANSWER: code },
        }),
      );
      if (result.AuthenticationResult?.IdToken) {
        pending = null;
        const payload = jwtPayload(result.AuthenticationResult.IdToken);
        logEvent('Cognito', 'Fresh tokens issued', `auth_time = ${payload.auth_time} (step-up proof)`);
        return {
          status: 'verified',
          proof: { token: result.AuthenticationResult.IdToken, completedAt: Date.now() },
        };
      }
      // Wrong answer: Cognito re-issues the challenge with a new session handle.
      pending.attempts += 1;
      pending.session = result.Session ?? pending.session;
      logEvent('Cognito', 'Wrong OTP', `Attempt ${pending.attempts}/${MAX_ATTEMPTS}`);
      return { status: 'retry', attemptsLeft: MAX_ATTEMPTS - pending.attempts };
    } catch (err) {
      pending = null;
      logEvent('Cognito', 'Custom auth session failed', String((err as Error).name));
      return { status: 'failed', reason: 'Too many incorrect codes. Start the verification again.' };
    }
  },
};

const api = async (
  session: Session,
  method: 'GET' | 'POST',
  body?: unknown,
  proof?: StepUpProof,
): Promise<{ status: number; data: any }> => {
  const headers: Record<string, string> = {
    authorization: `Bearer ${session.idToken}`,
    'content-type': 'application/json',
  };
  if (proof) headers['x-step-up-token'] = proof.token;
  const response = await fetch(`${config.apiUrl}/bookings`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
};

export const liveBookings: BookingService = {
  async list(session): Promise<Booking[]> {
    const { status, data } = await api(session, 'GET');
    if (status !== 200) throw new Error(`Failed to list bookings (${status})`);
    return data.bookings;
  },

  async create(session, input: BookingInput, proof?: StepUpProof): Promise<CreateBookingResult> {
    logEvent('Browser', 'POST /bookings', `${input.roomName}, $${input.amount}`);
    const { status, data } = await api(session, 'POST', input, proof);
    if (status === 201) {
      logEvent('Booking API', '201 booking created', data.booking.id.slice(0, 8));
      return { status: 'created', booking: data.booking };
    }
    if (status === 403 && data.error === 'step_up_required') {
      logEvent('Booking API', '403 step_up_required', `Amount exceeds $${data.threshold}`);
      return { status: 'step_up_required', threshold: data.threshold };
    }
    if (status === 403) {
      logEvent('Booking API', `403 ${data.error}`, data.message);
      return { status: 'step_up_rejected', reason: data.message ?? 'Step-up token rejected.' };
    }
    throw new Error(data.message ?? `Booking failed (${status})`);
  },
};
