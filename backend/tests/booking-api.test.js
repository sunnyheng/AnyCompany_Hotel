import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/booking-api.js';

const SUB = 'user-sub-123';
const NOW = Date.parse('2026-08-18T12:00:00Z');

const makeEvent = ({ method = 'POST', path = '/bookings', body, headers = {}, sub = SUB } = {}) => ({
  requestContext: {
    authorizer: { jwt: { claims: sub ? { sub } : {} } },
    http: { method, path },
  },
  headers,
  body: body === undefined ? undefined : JSON.stringify(body),
});

const cheapBooking = { roomId: 'std', roomName: 'Standard Room', nights: 1, amount: 180 };
const expensiveBooking = { roomId: 'suite', roomName: 'Executive Suite', nights: 2, amount: 1560 };

let puts;
let queries;
let deps;

beforeEach(() => {
  process.env.TABLE_NAME = 'test-table';
  process.env.STEP_UP_THRESHOLD = '500';
  process.env.STEP_UP_MAX_AGE_SECONDS = '300';
  puts = [];
  queries = [];
  deps = {
    ddb: {
      put: async (params) => puts.push(params),
      query: async (params) => {
        queries.push(params);
        return { Items: [{ pk: 'x', sk: 'y', id: 'b1', amount: 180 }] };
      },
    },
    verifyStepUpToken: async () => ({ sub: SUB, auth_time: Math.floor(NOW / 1000) - 60 }),
    now: () => NOW,
  };
});

test('booking at or below the threshold succeeds without step-up', async () => {
  const res = await createHandler(deps)(makeEvent({ body: cheapBooking }));
  assert.equal(res.statusCode, 201);
  const { booking } = JSON.parse(res.body);
  assert.equal(booking.stepUpVerified, false);
  assert.equal(puts.length, 1);
  assert.equal(puts[0].Item.pk, `USER#${SUB}`);
});

test('booking above the threshold without a step-up token returns step_up_required', async () => {
  const res = await createHandler(deps)(makeEvent({ body: expensiveBooking }));
  assert.equal(res.statusCode, 403);
  const body = JSON.parse(res.body);
  assert.equal(body.error, 'step_up_required');
  assert.equal(body.threshold, 500);
  assert.equal(puts.length, 0);
});

test('booking above the threshold with a fresh step-up token succeeds', async () => {
  const res = await createHandler(deps)(
    makeEvent({ body: expensiveBooking, headers: { 'x-step-up-token': 'jwt' } }),
  );
  assert.equal(res.statusCode, 201);
  assert.equal(JSON.parse(res.body).booking.stepUpVerified, true);
});

test('a step-up token for a different user is rejected', async () => {
  deps.verifyStepUpToken = async () => ({ sub: 'someone-else', auth_time: Math.floor(NOW / 1000) });
  const res = await createHandler(deps)(
    makeEvent({ body: expensiveBooking, headers: { 'x-step-up-token': 'jwt' } }),
  );
  assert.equal(res.statusCode, 403);
  assert.equal(JSON.parse(res.body).error, 'step_up_invalid');
});

test('an expired step-up token is rejected', async () => {
  deps.verifyStepUpToken = async () => ({ sub: SUB, auth_time: Math.floor(NOW / 1000) - 301 });
  const res = await createHandler(deps)(
    makeEvent({ body: expensiveBooking, headers: { 'x-step-up-token': 'jwt' } }),
  );
  assert.equal(res.statusCode, 403);
  assert.equal(JSON.parse(res.body).error, 'step_up_expired');
});

test('an unverifiable step-up token is rejected', async () => {
  deps.verifyStepUpToken = async () => {
    throw new Error('bad signature');
  };
  const res = await createHandler(deps)(
    makeEvent({ body: expensiveBooking, headers: { 'x-step-up-token': 'garbage' } }),
  );
  assert.equal(res.statusCode, 403);
  assert.equal(JSON.parse(res.body).error, 'step_up_invalid');
});

test('validation errors return 400 with details', async () => {
  const res = await createHandler(deps)(
    makeEvent({ body: { roomId: '', roomName: 'X', nights: 0, amount: -5 } }),
  );
  assert.equal(res.statusCode, 400);
  const body = JSON.parse(res.body);
  assert.equal(body.error, 'validation_failed');
  assert.equal(body.details.length, 3);
});

test('malformed JSON returns 400', async () => {
  const event = makeEvent({});
  event.body = '{not json';
  const res = await createHandler(deps)(event);
  assert.equal(res.statusCode, 400);
});

test('GET /bookings queries only the caller partition and strips keys', async () => {
  const res = await createHandler(deps)(makeEvent({ method: 'GET' }));
  assert.equal(res.statusCode, 200);
  assert.equal(queries[0].ExpressionAttributeValues[':pk'], `USER#${SUB}`);
  const { bookings } = JSON.parse(res.body);
  assert.deepEqual(bookings, [{ id: 'b1', amount: 180 }]);
});

test('requests without JWT claims are rejected', async () => {
  const res = await createHandler(deps)(makeEvent({ sub: null, body: cheapBooking }));
  assert.equal(res.statusCode, 401);
});

test('unknown routes return 404', async () => {
  const res = await createHandler(deps)(makeEvent({ method: 'DELETE', path: '/other' }));
  assert.equal(res.statusCode, 404);
});
