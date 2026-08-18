import { config } from '../config';
import { liveAuth, liveBookings } from './live';
import { mockAuth, mockBookings } from './mock';
import type { AuthService, BookingService } from './types';

export const auth: AuthService = config.mode === 'live' ? liveAuth : mockAuth;
export const bookingApi: BookingService = config.mode === 'live' ? liveBookings : mockBookings;

export { eventLog, mockInbox, logEvent } from './types';
export type { StepUpChallenge, MockEmail } from './types';
