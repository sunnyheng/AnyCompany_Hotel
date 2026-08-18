import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, generateOtp, maskEmail } from '../src/create-auth-challenge.js';

const makeEvent = (session = []) => ({
  request: {
    session,
    userAttributes: { email: 'guest@anycompany.example' },
  },
  response: {},
});

test('generateOtp returns a 6-digit numeric string', () => {
  for (let i = 0; i < 50; i += 1) {
    const otp = generateOtp();
    assert.match(otp, /^\d{6}$/);
  }
});

test('maskEmail hides most of the local part', () => {
  assert.equal(maskEmail('guest@anycompany.example'), 'gu***@anycompany.example');
  assert.equal(maskEmail('not-an-email'), '***');
});

test('first round generates and delivers a fresh OTP', async () => {
  const delivered = [];
  const handler = createHandler({
    deliverOtp: async (email, otp) => delivered.push({ email, otp }),
  });
  const event = await handler(makeEvent());

  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].email, 'guest@anycompany.example');
  assert.equal(event.response.privateChallengeParameters.answer, delivered[0].otp);
  assert.equal(event.response.challengeMetadata, `OTP-${delivered[0].otp}`);
  assert.equal(event.response.publicChallengeParameters.deliveryMedium, 'EMAIL');
  assert.equal(
    event.response.publicChallengeParameters.destination,
    'gu***@anycompany.example',
  );
});

test('retry rounds reuse the OTP from challengeMetadata without re-delivering', async () => {
  const delivered = [];
  const handler = createHandler({
    deliverOtp: async (email, otp) => delivered.push(otp),
  });
  const event = await handler(
    makeEvent([
      {
        challengeName: 'CUSTOM_CHALLENGE',
        challengeResult: false,
        challengeMetadata: 'OTP-123456',
      },
    ]),
  );

  assert.equal(delivered.length, 0);
  assert.equal(event.response.privateChallengeParameters.answer, '123456');
  assert.equal(event.response.challengeMetadata, 'OTP-123456');
});

test('the most recent metadata wins across multiple rounds', async () => {
  const handler = createHandler({ deliverOtp: async () => {} });
  const event = await handler(
    makeEvent([
      { challengeName: 'CUSTOM_CHALLENGE', challengeResult: false, challengeMetadata: 'OTP-111111' },
      { challengeName: 'CUSTOM_CHALLENGE', challengeResult: false, challengeMetadata: 'OTP-222222' },
    ]),
  );
  assert.equal(event.response.privateChallengeParameters.answer, '222222');
});
