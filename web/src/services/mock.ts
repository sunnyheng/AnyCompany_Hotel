/**
 * Mock implementations for offline demos: an in-browser simulation that is
 * behaviorally faithful to the Lambda triggers and booking API —
 * same 3-attempt lockout, same 5-minute step-up freshness window,
 * same error codes. Keep in sync with backend/src (ADR-007).
 */
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
import { logEvent, mockInbox } from './types';

const DEMO_EMAIL = 'demo@anycompany.example';
const DEMO_PASSWORD = 'Demo#Pass1';
const MAX_ATTEMPTS = 3;
const STEP_UP_MAX_AGE_MS = 5 * 60 * 1000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const maskEmail = (email: string) => {
  const [local, domain] = email.split('@');
  return `${local.slice(0, 2)}${'*'.repeat(Math.max(local.length - 2, 1))}@${domain}`;
};

interface PendingChallenge {
  otp: string;
  attempts: number;
}

let pending: PendingChallenge | null = null;
const bookings: Booking[] = [];

export const mockAuth: AuthService = {
  async signIn(email, password) {
    logEvent('Browser', 'InitiateAuth (USER_PASSWORD_AUTH)', email);
    await delay(450);
    if (email !== DEMO_EMAIL || password !== DEMO_PASSWORD) {
      logEvent('Cognito', 'NotAuthorizedException', 'Incorrect username or password');
      throw new Error('Incorrect username or password.');
    }
    logEvent('Cognito', 'Tokens issued', 'ID + access + refresh (primary session)');
    return {
      email,
      sub: 'mock-sub-0001',
      idToken: 'mock-id-token',
      accessToken: 'mock-access-token',
    };
  },

  async startStepUp(session): Promise<StepUpChallenge> {
    logEvent('Browser', 'InitiateAuth (CUSTOM_AUTH)', session.email);
    await delay(400);
    const otp = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
    pending = { otp, attempts: 0 };
    logEvent('Cognito', 'DefineAuthChallenge → CUSTOM_CHALLENGE', 'New custom auth session');
    logEvent('Cognito', 'CreateAuthChallenge → OTP issued', `Delivered to ${maskEmail(session.email)}`);
    mockInbox.push({
      at: Date.now(),
      to: session.email,
      subject: 'Your AnyCompany Hotels verification code',
      otp,
    });
    return { destination: maskEmail(session.email) };
  },

  async answerStepUp(code): Promise<StepUpAnswerResult> {
    logEvent('Browser', 'RespondToAuthChallenge', 'ANSWER submitted');
    await delay(400);
    if (!pending) {
      return { status: 'failed', reason: 'No step-up in progress. Start again.' };
    }
    if (code === pending.otp) {
      pending = null;
      logEvent('Cognito', 'VerifyAuthChallengeResponse → correct', 'DefineAuthChallenge issues tokens');
      logEvent('Cognito', 'Fresh tokens issued', 'auth_time = now (step-up proof)');
      return {
        status: 'verified',
        proof: { token: `mock-stepup-${Date.now()}`, completedAt: Date.now() },
      };
    }
    pending.attempts += 1;
    logEvent('Cognito', 'VerifyAuthChallengeResponse → wrong', `Attempt ${pending.attempts}/${MAX_ATTEMPTS}`);
    if (pending.attempts >= MAX_ATTEMPTS) {
      pending = null;
      logEvent('Cognito', 'DefineAuthChallenge → fail', 'Too many attempts, session terminated');
      return { status: 'failed', reason: 'Too many incorrect codes. Start the verification again.' };
    }
    return { status: 'retry', attemptsLeft: MAX_ATTEMPTS - pending.attempts };
  },
};

export const mockBookings: BookingService = {
  async list() {
    await delay(200);
    return [...bookings];
  },

  async create(_session: Session, input: BookingInput, proof?: StepUpProof): Promise<CreateBookingResult> {
    logEvent('Browser', 'POST /bookings', `${input.roomName}, $${input.amount}`);
    await delay(400);
    let stepUpVerified = false;
    if (input.amount > config.stepUpThreshold) {
      if (!proof) {
        logEvent('Booking API', '403 step_up_required', `Amount exceeds $${config.stepUpThreshold}`);
        return { status: 'step_up_required', threshold: config.stepUpThreshold };
      }
      if (Date.now() - proof.completedAt > STEP_UP_MAX_AGE_MS) {
        logEvent('Booking API', '403 step_up_expired', 'auth_time older than 300 s');
        return { status: 'step_up_rejected', reason: 'Step-up expired. Verify again.' };
      }
      logEvent('Booking API', 'Step-up token verified', 'Signature, subject and auth_time OK');
      stepUpVerified = true;
    }
    const booking: Booking = {
      id: crypto.randomUUID(),
      roomId: input.roomId,
      roomName: input.roomName,
      nights: input.nights,
      amount: input.amount,
      currency: input.currency,
      stepUpVerified,
      createdAt: new Date().toISOString(),
    };
    bookings.unshift(booking);
    logEvent('Booking API', '201 booking created', booking.id.slice(0, 8));
    return { status: 'created', booking };
  },
};
