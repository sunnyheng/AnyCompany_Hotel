import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/booking-api.js';

const SUB = 'user-sub-123';
const NOW = Date.parse('2026-08-18T12:00:00Z');

const CATALOG = [
  { pk: 'CONFIG', sk: 'ROOM#standard', id: 'standard', name: 'Standard King', pricePerNight: 180 },
  { pk: 'CONFIG', sk: 'ROOM#suite', id: 'suite', name: 'Executive Suite', pricePerNight: 780 },
];

const makeEvent = ({ method = 'POST', path = '/bookings', body, headers = {}, sub = SUB, groups } = {}) => ({
  requestContext: {
    authorizer: {
      jwt: { claims: sub ? { sub, ...(groups ? { 'cognito:groups': groups } : {}) } : {} },
    },
    http: { method, path },
  },
  headers,
  body: body === undefined ? undefined : JSON.stringify(body),
});

let puts;
let queries;
let configItems;
let deps;

beforeEach(() => {
  process.env.TABLE_NAME = 'test-table';
  process.env.STEP_UP_THRESHOLD = '500';
  process.env.STEP_UP_MAX_AGE_SECONDS = '300';
  puts = [];
  queries = [];
  configItems = [...CATALOG];
  deps = {
    ddb: {
      put: async (params) => puts.push(params),
      query: async (params) => {
        queries.push(params);
        if (params.ExpressionAttributeValues[':pk'] === 'CONFIG') {
          return { Items: configItems };
        }
        return { Items: [{ pk: 'x', sk: 'y', id: 'b1', amount: 180 }] };
      },
    },
    verifyStepUpToken: async () => ({ sub: SUB, auth_time: Math.floor(NOW / 1000) - 60 }),
    now: () => NOW,
  };
});

test('GET /config returns the catalog sorted by price and the env-default threshold', async () => {
  const res = await createHandler(deps)(makeEvent({ method: 'GET', path: '/config' }));
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.deepEqual(body.rooms.map((r) => r.id), ['standard', 'suite']);
  assert.equal(body.rooms[0].pk, undefined);
  assert.equal(body.threshold, 500);
});

test('a stored THRESHOLD item overrides the environment default', async () => {
  configItems.push({ pk: 'CONFIG', sk: 'THRESHOLD', value: 1000 });
  const res = await createHandler(deps)(makeEvent({ method: 'GET', path: '/config' }));
  assert.equal(JSON.parse(res.body).threshold, 1000);
});

test('booking at or below the threshold succeeds and is priced server-side', async () => {
  const res = await createHandler(deps)(makeEvent({ body: { roomId: 'standard', nights: 2 } }));
  assert.equal(res.statusCode, 201);
  const { booking } = JSON.parse(res.body);
  assert.equal(booking.amount, 360);
  assert.equal(booking.roomName, 'Standard King');
  assert.equal(booking.stepUpVerified, false);
  assert.equal(puts[0].Item.pk, `USER#${SUB}`);
});

test('a client-supplied amount is ignored — pricing comes from the catalog', async () => {
  const res = await createHandler(deps)(
    makeEvent({ body: { roomId: 'suite', nights: 2, amount: 1 } }),
  );
  // 780 × 2 = 1560 > 500: the lowball amount must not dodge the step-up.
  assert.equal(res.statusCode, 403);
  assert.equal(JSON.parse(res.body).error, 'step_up_required');
});

test('booking above the threshold without a step-up token returns step_up_required', async () => {
  const res = await createHandler(deps)(makeEvent({ body: { roomId: 'suite', nights: 1 } }));
  assert.equal(res.statusCode, 403);
  const body = JSON.parse(res.body);
  assert.equal(body.error, 'step_up_required');
  assert.equal(body.threshold, 500);
  assert.equal(body.amount, 780);
  assert.equal(puts.length, 0);
});

test('booking above the threshold with a fresh step-up token succeeds', async () => {
  const res = await createHandler(deps)(
    makeEvent({ body: { roomId: 'suite', nights: 1 }, headers: { 'x-step-up-token': 'jwt' } }),
  );
  assert.equal(res.statusCode, 201);
  const { booking } = JSON.parse(res.body);
  assert.equal(booking.stepUpVerified, true);
  assert.equal(booking.amount, 780);
});

test('an admin-raised threshold changes what requires step-up', async () => {
  configItems.push({ pk: 'CONFIG', sk: 'THRESHOLD', value: 2000 });
  const res = await createHandler(deps)(makeEvent({ body: { roomId: 'suite', nights: 2 } }));
  assert.equal(res.statusCode, 201);
  assert.equal(JSON.parse(res.body).booking.stepUpVerified, false);
});

test('a step-up token for a different user is rejected', async () => {
  deps.verifyStepUpToken = async () => ({ sub: 'someone-else', auth_time: Math.floor(NOW / 1000) });
  const res = await createHandler(deps)(
    makeEvent({ body: { roomId: 'suite', nights: 1 }, headers: { 'x-step-up-token': 'jwt' } }),
  );
  assert.equal(res.statusCode, 403);
  assert.equal(JSON.parse(res.body).error, 'step_up_invalid');
});

test('an expired step-up token is rejected', async () => {
  deps.verifyStepUpToken = async () => ({ sub: SUB, auth_time: Math.floor(NOW / 1000) - 301 });
  const res = await createHandler(deps)(
    makeEvent({ body: { roomId: 'suite', nights: 1 }, headers: { 'x-step-up-token': 'jwt' } }),
  );
  assert.equal(res.statusCode, 403);
  assert.equal(JSON.parse(res.body).error, 'step_up_expired');
});

test('an unverifiable step-up token is rejected', async () => {
  deps.verifyStepUpToken = async () => {
    throw new Error('bad signature');
  };
  const res = await createHandler(deps)(
    makeEvent({ body: { roomId: 'suite', nights: 1 }, headers: { 'x-step-up-token': 'garbage' } }),
  );
  assert.equal(res.statusCode, 403);
  assert.equal(JSON.parse(res.body).error, 'step_up_invalid');
});

test('an unknown roomId is rejected', async () => {
  const res = await createHandler(deps)(makeEvent({ body: { roomId: 'penthouse', nights: 1 } }));
  assert.equal(res.statusCode, 400);
  assert.deepEqual(JSON.parse(res.body).details, ['unknown roomId']);
});

test('validation errors return 400 with details', async () => {
  const res = await createHandler(deps)(makeEvent({ body: { roomId: '', nights: 0 } }));
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.parse(res.body).details.length, 2);
});

test('malformed JSON returns 400', async () => {
  const event = makeEvent({});
  event.body = '{not json';
  const res = await createHandler(deps)(event);
  assert.equal(res.statusCode, 400);
});

test('PUT /admin/threshold requires the admins group', async () => {
  const res = await createHandler(deps)(
    makeEvent({ method: 'PUT', path: '/admin/threshold', body: { threshold: 900 } }),
  );
  assert.equal(res.statusCode, 403);
  assert.equal(JSON.parse(res.body).error, 'forbidden');
  assert.equal(puts.length, 0);
});

test('an admin can update the threshold (array-shaped groups claim)', async () => {
  const res = await createHandler(deps)(
    makeEvent({ method: 'PUT', path: '/admin/threshold', body: { threshold: 900 }, groups: ['admins'] }),
  );
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).threshold, 900);
  assert.equal(puts[0].Item.sk, 'THRESHOLD');
  assert.equal(puts[0].Item.value, 900);
  assert.equal(puts[0].Item.updatedBy, SUB);
});

test('an admin can update the threshold (stringified groups claim)', async () => {
  const res = await createHandler(deps)(
    makeEvent({ method: 'PUT', path: '/admin/threshold', body: { threshold: 750 }, groups: '[admins]' }),
  );
  assert.equal(res.statusCode, 200);
  assert.equal(puts[0].Item.value, 750);
});

test('a non-positive threshold is rejected', async () => {
  const res = await createHandler(deps)(
    makeEvent({ method: 'PUT', path: '/admin/threshold', body: { threshold: -5 }, groups: ['admins'] }),
  );
  assert.equal(res.statusCode, 400);
  assert.equal(puts.length, 0);
});

test('GET /bookings queries only the caller partition and strips keys', async () => {
  const res = await createHandler(deps)(makeEvent({ method: 'GET', path: '/bookings' }));
  assert.equal(res.statusCode, 200);
  const userQuery = queries.find((q) => q.ExpressionAttributeValues[':pk'] === `USER#${SUB}`);
  assert.ok(userQuery);
  assert.equal(userQuery.ScanIndexForward, false);
  const { bookings } = JSON.parse(res.body);
  assert.deepEqual(bookings, [{ id: 'b1', amount: 180 }]);
});

test('requests without JWT claims are rejected', async () => {
  const res = await createHandler(deps)(makeEvent({ sub: null, body: { roomId: 'standard', nights: 1 } }));
  assert.equal(res.statusCode, 401);
});

test('unknown routes return 404', async () => {
  const res = await createHandler(deps)(makeEvent({ method: 'DELETE', path: '/other' }));
  assert.equal(res.statusCode, 404);
});
