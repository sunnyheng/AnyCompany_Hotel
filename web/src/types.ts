/** Shared domain types used by the UI and the service layer. */

export interface Session {
  email: string;
  /** Cognito subject. */
  sub: string;
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

export interface BookingInput {
  roomId: string;
  roomName: string;
  nights: number;
  amount: number;
  currency: string;
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

export const ROOMS: Room[] = [
  {
    id: 'standard',
    name: 'Standard King',
    description: 'City view, king bed, workspace',
    pricePerNight: 180,
  },
  {
    id: 'deluxe',
    name: 'Deluxe Terrace',
    description: 'Private terrace, marble bath',
    pricePerNight: 320,
  },
  {
    id: 'executive',
    name: 'Executive Suite',
    description: 'Separate living room, lounge access',
    pricePerNight: 780,
  },
  {
    id: 'presidential',
    name: 'Presidential Suite',
    description: 'Panoramic floor, butler service',
    pricePerNight: 1500,
  },
];
