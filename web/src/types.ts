/** Shared domain types used by the UI and the service layer. */

export interface Session {
  email: string;
  /** Cognito subject. */
  sub: string;
  /** Cognito group memberships from the ID token (display/routing only — the API re-checks). */
  groups: string[];
  idToken: string;
  accessToken: string;
}

/** Proof of a completed step-up: the fresh ID token from the CUSTOM_AUTH round. */
export interface StepUpProof {
  token: string;
  completedAt: number;
}

export interface Room {
  id: string;
  name: string;
  description: string;
  pricePerNight: number;
}

export interface Booking {
  id: string;
  roomId: string;
  roomName: string;
  nights: number;
  amount: number;
  currency: string;
  stepUpVerified: boolean;
  createdAt: string;
}

/**
 * What the client is allowed to say about a booking. The amount is priced
 * server-side from the room catalog, so it cannot be tampered with.
 */
export interface BookingInput {
  roomId: string;
  nights: number;
}

/** Room catalog and step-up threshold, served by GET /config from DynamoDB. */
export interface RemoteConfig {
  rooms: Room[];
  threshold: number;
}

export type CreateBookingResult =
  | { status: 'created'; booking: Booking }
  | { status: 'step_up_required'; threshold: number }
  | { status: 'step_up_rejected'; reason: string };

export type StepUpAnswerResult =
  | { status: 'verified'; proof: StepUpProof }
  | { status: 'retry'; attemptsLeft: number }
  | { status: 'failed'; reason: string };

/** One entry in the demo's auth event log sidebar. */
export interface AuthEvent {
  at: number;
  actor: 'Browser' | 'Cognito' | 'Booking API';
  title: string;
  detail?: string;
}

