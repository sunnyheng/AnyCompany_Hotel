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
 * The narrow seams between the UI and the identity/booking backends,
 * implemented by `live` against the deployed Cognito user pool and API.
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

type Listener<T> = (items: T[]) => void;

/** Minimal observable list used for the event log. */
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

export const logEvent = (actor: AuthEvent['actor'], title: string, detail?: string) =>
  eventLog.push({ at: Date.now(), actor, title, detail });
