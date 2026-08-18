import type {
  AuthEvent,
  Booking,
  BookingInput,
  CreateBookingResult,
  Session,
  StepUpAnswerResult,
  StepUpProof,
} from '../types';

/**
 * The narrow seams between the UI and the identity/booking backends.
 * `mock` and `live` implement the same contracts (ADR-007), so the demo
 * flow is identical with and without a deployed stack.
 */

export interface StepUpChallenge {
  /** Masked delivery destination shown to the user, e.g. gu***@example.com */
  destination: string;
}

export interface AuthService {
  signIn(email: string, password: string): Promise<Session>;
  /** Begin a CUSTOM_AUTH round; resolves once the OTP has been issued. */
  startStepUp(session: Session): Promise<StepUpChallenge>;
  /** Answer the pending OTP challenge. */
  answerStepUp(code: string): Promise<StepUpAnswerResult>;
}

export interface BookingService {
  list(session: Session): Promise<Booking[]>;
  create(session: Session, input: BookingInput, proof?: StepUpProof): Promise<CreateBookingResult>;
}

/** Simulated email delivered in mock mode, rendered by the inbox panel. */
export interface MockEmail {
  at: number;
  to: string;
  subject: string;
  otp: string;
}

type Listener<T> = (items: T[]) => void;

/** Minimal observable list used for the event log and the mock inbox. */
export class Feed<T> {
  private items: T[] = [];
  private listeners = new Set<Listener<T>>();

  push(item: T) {
    this.items = [item, ...this.items];
    this.listeners.forEach((fn) => fn(this.items));
  }

  subscribe(fn: Listener<T>): () => void {
    this.listeners.add(fn);
    fn(this.items);
    return () => this.listeners.delete(fn);
  }
}

export const eventLog = new Feed<AuthEvent>();
export const mockInbox = new Feed<MockEmail>();

export const logEvent = (actor: AuthEvent['actor'], title: string, detail?: string) =>
  eventLog.push({ at: Date.now(), actor, title, detail });
