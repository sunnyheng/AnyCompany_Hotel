/**
 * Booking API — the resource server that enforces the step-up policy.
 *
 * Routes (API Gateway HTTP API, payload v2, behind a Cognito JWT authorizer):
 *   GET  /bookings   — list the caller's bookings
 *   POST /bookings   — create a booking; amounts above STEP_UP_THRESHOLD
 *                      additionally require a fresh step-up token
 *                      (X-StepUp-Token header, see DECISIONS.md ADR-003).
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
  threshold: Number(process.env.STEP_UP_THRESHOLD ?? 500),
  maxAgeSeconds: Number(process.env.STEP_UP_MAX_AGE_SECONDS ?? 300),
});

const validateBookingInput = (body) => {
  const errors = [];
  if (typeof body.roomId !== 'string' || !body.roomId) errors.push('roomId is required');
  if (typeof body.roomName !== 'string' || !body.roomName) errors.push('roomName is required');
  if (!Number.isInteger(body.nights) || body.nights < 1) errors.push('nights must be a positive integer');
  if (typeof body.amount !== 'number' || !Number.isFinite(body.amount) || body.amount <= 0) {
    errors.push('amount must be a positive number');
  }
  return errors;
};

export const createHandler = ({ ddb, verifyStepUpToken, now = () => Date.now() }) =>
  async (event) => {
    const { tableName, threshold, maxAgeSeconds } = config();
    const claims = event.requestContext?.authorizer?.jwt?.claims;
    if (!claims?.sub) {
      return json(401, { error: 'unauthorized' });
    }
    const route = `${event.requestContext.http.method} ${event.requestContext.http.path}`;

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
      const errors = validateBookingInput(body);
      if (errors.length) {
        return json(400, { error: 'validation_failed', details: errors });
      }

      let stepUpVerified = false;
      if (body.amount > threshold) {
        const token = event.headers?.['x-step-up-token'];
        if (!token) {
          return json(403, {
            error: 'step_up_required',
            threshold,
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
        roomId: body.roomId,
        roomName: body.roomName,
        nights: body.nights,
        amount: body.amount,
        currency: typeof body.currency === 'string' ? body.currency : 'USD',
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
