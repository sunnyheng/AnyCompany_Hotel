/**
 * Runtime configuration for the deployed stack. Values are baked in at build
 * time from `web/.env.local`, which `scripts/deploy.sh` writes from the CDK
 * stack outputs.
 */
export interface AppConfig {
  region: string;
  userPoolId: string;
  userPoolClientId: string;
  apiUrl: string;
  stepUpThreshold: number;
}

const env = import.meta.env;

/** True when all Cognito/API settings are present. */
export const isConfigured = Boolean(
  env.VITE_AWS_REGION && env.VITE_USER_POOL_ID && env.VITE_USER_POOL_CLIENT_ID && env.VITE_API_URL,
);

export const config: AppConfig = {
  region: env.VITE_AWS_REGION ?? '',
  userPoolId: env.VITE_USER_POOL_ID ?? '',
  userPoolClientId: env.VITE_USER_POOL_CLIENT_ID ?? '',
  apiUrl: (env.VITE_API_URL ?? '').replace(/\/$/, ''),
  stepUpThreshold: Number(env.VITE_STEP_UP_THRESHOLD ?? 500),
};
