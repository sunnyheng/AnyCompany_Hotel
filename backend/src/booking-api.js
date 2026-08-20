/**
 * Booking API — the resource server that enforces the step-up policy.
 *
 * Routes (API Gateway HTTP API, payload v2, behind a Cognito JWT authorizer):
 *   GET  /config          — room catalog and the current step-up threshold
 *   GET  /bookings        — list the caller's bookings
 *   POST /bookings        — create a booking from { roomId, nights }; the
 *                           amount is priced server-side from the catalog and,
 *                           above the threshold, additionally requires a fresh
 *                           step-up token (X-StepUp-Token header, ADR-003)
 *   PUT  /admin/threshold — update the step-up threshold (admins group only)
 *
 * The room catalog and the threshold live in the DynamoDB table under the
 * CONFIG partition (sk ROOM#<id> / THRESHOLD); the THRESHOLD item falls back
 * to the STEP_UP_THRESHOLD environment default until an admin sets one.
 *
 * Dependencies (JWT verifier, DynamoDB client, clock) are injectable for
 * unit testing; the default export wires the real ones.
 */
import { randomUUID } from 'node:crypto';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const config = () => ({
  tableName: process.env.TABLE_NAME,
  defaultThreshold: Number(process.env.STEP_UP_THRESHOLD ?? 500),
  maxAgeSeconds: Number(process.env.STEP_UP_MAX_AGE_SECONDS ?? 300),
});

const ADMIN_GROUP = 'admins';
const MAX_NIGHTS = 30;

/** The HTTP API stringifies array claims, e.g. "[admins]"; handle both shapes. */
const groupsOf = (claims) => {
  const raw = claims['cognito:groups'];
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return String(raw)
    .replace(/^\[|\]$/g, '')
    .split(/[\s,]+/)
    .filter(Boolean);
};

/** Load the CONFIG partition: room catalog plus the stored threshold, if any. */
const loadConfig = async (ddb, tableName, defaultThreshold) => {
  const result = await ddb.query({
    TableName: tableName,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': 'CONFIG' },
  });
  const items = result.Items ?? [];
  const rooms = items
    .filter((item) => item.sk.startsWith('ROOM#'))
    .map(({ pk, sk, ...rest }) => rest)
    .sort((a, b) => a.pricePerNight - b.pricePerNight);
  const thresholdItem = items.find((item) => item.sk === 'THRESHOLD');
  const threshold = Number(thresholdItem?.value ?? defaultThreshold);
  return { rooms, threshold };
};

export const createHandler = ({ ddb, verifyStepUpToken, now = () => Date.now() }) =>
  async (event) => {
    const { tableName, defaultThreshold, maxAgeSeconds } = config();
    const claims = event.requestContext?.authorizer?.jwt?.claims;
    if (!claims?.sub) {
      return json(401, { error: 'unauthorized' });
    }
    const route = `${event.requestContext.http.method} ${event.requestContext.http.path}`;

    if (route === 'GET /config') {
      const { rooms, threshold } = await loadConfig(ddb, tableName, defaultThreshold);
      return json(200, { rooms, threshold });
    }

    if (route === 'PUT /admin/threshold') {
      if (!groupsOf(claims).includes(ADMIN_GROUP)) {
        return json(403, { error: 'forbidden', message: 'Requires the admins group' });
      }
      let body;
      try {
        body = JSON.parse(event.body ?? '{}');
      } catch {
        return json(400, { error: 'invalid_json' });
      }
      const threshold = body.threshold;
      if (typeof threshold !== 'number' || !Number.isFinite(threshold) || threshold <= 0) {
        return json(400, { error: 'validation_failed', details: ['threshold must be a positive number'] });
      }
      await ddb.put({
        TableName: tableName,
        Item: {
          pk: 'CONFIG',
          sk: 'THRESHOLD',
          value: threshold,
          updatedBy: claims.sub,
          updatedAt: new Date(now()).toISOString(),
        },
      });
      return json(200, { threshold });
    }

    if (route === 'GET /bookings') {
      const result = await ddb.query({
        TableName: tableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': `USER#${claims.sub}` },
        ScanIndexForward: false,
      });
      return json(200, { bookings: (result.Items ?? []).map(({ pk, sk, ...rest }) => rest) });
    }

    if (route === 'POST /bookings') {
      let body;
      try {
        body = JSON.parse(event.body ?? '{}');
      } catch {
        return json(400, { error: 'invalid_json' });
      }
      const errors = [];
      if (typeof body.roomId !== 'string' || !body.roomId) errors.push('roomId is required');
      if (!Number.isInteger(body.nights) || body.nights < 1 || body.nights > MAX_NIGHTS) {
        errors.push(`nights must be an integer between 1 and ${MAX_NIGHTS}`);
      }
      if (errors.length) {
        return json(400, { error: 'validation_failed', details: errors });
      }

      // Price server-side from the catalog: the client never supplies an
      // amount, so it cannot understate one to dodge the step-up policy.
      const { rooms, threshold } = await loadConfig(ddb, tableName, defaultThreshold);
      const room = rooms.find((r) => r.id === body.roomId);
      if (!room) {
        return json(400, { error: 'validation_failed', details: ['unknown roomId'] });
      }
      const amount = room.pricePerNight * body.nights;

      let stepUpVerified = false;
      if (amount > threshold) {
        const token = event.headers?.['x-step-up-token'];
        if (!token) {
          return json(403, {
            error: 'step_up_required',
            threshold,
            amount,
            message: `Bookings above ${threshold} require step-up verification`,
          });
        }
        let payload;
        try {
          payload = await verifyStepUpToken(token);
        } catch {
          return json(403, { error: 'step_up_invalid', message: 'Step-up token could not be verified' });
        }
        if (payload.sub !== claims.sub) {
          return json(403, { error: 'step_up_invalid', message: 'Step-up token belongs to a different user' });
        }
        const ageSeconds = Math.floor(now() / 1000) - Number(payload.auth_time);
        if (!Number.isFinite(ageSeconds) || ageSeconds > maxAgeSeconds) {
          return json(403, {
            error: 'step_up_expired',
            message: `Step-up must have completed within the last ${maxAgeSeconds} seconds`,
          });
        }
        stepUpVerified = true;
      }

      const booking = {
        id: randomUUID(),
        roomId: room.id,
        roomName: room.name,
        nights: body.nights,
        amount,
        currency: 'USD',
        stepUpVerified,
        createdAt: new Date(now()).toISOString(),
      };
      await ddb.put({
        TableName: tableName,
        Item: {
          pk: `USER#${claims.sub}`,
          sk: `BOOKING#${booking.createdAt}#${booking.id}`,
          ...booking,
        },
      });
      return json(201, { booking });
    }

    return json(404, { error: 'not_found' });
  };

// --- Default (production) wiring below; excluded from unit tests. ---

let defaultDeps;

const buildDefaultDeps = async () => {
  const [{ DynamoDBClient }, { DynamoDBDocumentClient, PutCommand, QueryCommand }, { CognitoJwtVerifier }] =
    await Promise.all([
      import('@aws-sdk/client-dynamodb'),
      import('@aws-sdk/lib-dynamodb'),
      import('aws-jwt-verify'),
    ]);
  const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const verifier = CognitoJwtVerifier.create({
    userPoolId: process.env.USER_POOL_ID,
    clientId: process.env.USER_POOL_CLIENT_ID,
    tokenUse: 'id',
  });
  return {
    ddb: {
      put: (params) => doc.send(new PutCommand(params)),
      query: (params) => doc.send(new QueryCommand(params)),
    },
    verifyStepUpToken: (token) => verifier.verify(token),
  };
};

export const handler = async (event) => {
  defaultDeps ??= await buildDefaultDeps();
  return createHandler(defaultDeps)(event);
};
