import { liveAuth, liveBookings } from './live';
import type { AuthService, BookingService } from './types';

export const auth: AuthService = liveAuth;
export const bookingApi: BookingService = liveBookings;

export { eventLog, logEvent } from './types';
export type { StepUpChallenge } from './types';
