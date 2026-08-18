/**
 * Runtime configuration. When all Cognito/API settings are present the app
 * runs in "live" mode against a deployed stack; otherwise it falls back to
 * "mock" mode, an in-browser simulation of the exact same flow (ADR-007).
 */
export interface AppConfig {
  mode: 'live' | 'mock';
  region: string;
  userPoolId: string;
  userPoolClientId: string;
  apiUrl: string;
  stepUpThreshold: number;
}

const env = import.meta.env;

const hasLiveConfig = Boolean(
  env.VITE_AWS_REGION && env.VITE_USER_POOL_ID && env.VITE_USER_POOL_CLIENT_ID && env.VITE_API_URL,
);

export const config: AppConfig = {
  mode: hasLiveConfig ? 'live' : 'mock',
  region: env.VITE_AWS_REGION ?? '',
  userPoolId: env.VITE_USER_POOL_ID ?? '',
  userPoolClientId: env.VITE_USER_POOL_CLIENT_ID ?? '',
  apiUrl: (env.VITE_API_URL ?? '').replace(/\/$/, ''),
  stepUpThreshold: Number(env.VITE_STEP_UP_THRESHOLD ?? 500),
};
