import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handler } from '../src/define-auth-challenge.js';

const makeEvent = (session) => ({
  request: { session },
  response: {},
});

test('empty session issues a CUSTOM_CHALLENGE', async () => {
  const event = await handler(makeEvent([]));
  assert.equal(event.response.challengeName, 'CUSTOM_CHALLENGE');
  assert.equal(event.response.issueTokens, false);
  assert.equal(event.response.failAuthentication, false);
});

test('missing session behaves like an empty one', async () => {
  const event = await handler({ request: {}, response: {} });
  assert.equal(event.response.challengeName, 'CUSTOM_CHALLENGE');
});

test('correct answer issues tokens', async () => {
  const event = await handler(
    makeEvent([{ challengeName: 'CUSTOM_CHALLENGE', challengeResult: true }]),
  );
  assert.equal(event.response.issueTokens, true);
  assert.equal(event.response.failAuthentication, false);
});

test('wrong answer below the limit re-issues the challenge', async () => {
  const event = await handler(
    makeEvent([
      { challengeName: 'CUSTOM_CHALLENGE', challengeResult: false },
      { challengeName: 'CUSTOM_CHALLENGE', challengeResult: false },
    ]),
  );
  assert.equal(event.response.challengeName, 'CUSTOM_CHALLENGE');
  assert.equal(event.response.issueTokens, false);
  assert.equal(event.response.failAuthentication, false);
});

test('third wrong answer fails authentication', async () => {
  const event = await handler(
    makeEvent([
      { challengeName: 'CUSTOM_CHALLENGE', challengeResult: false },
      { challengeName: 'CUSTOM_CHALLENGE', challengeResult: false },
      { challengeName: 'CUSTOM_CHALLENGE', challengeResult: false },
    ]),
  );
  assert.equal(event.response.failAuthentication, true);
  assert.equal(event.response.issueTokens, false);
});

test('a correct answer after failed attempts still issues tokens', async () => {
  const event = await handler(
    makeEvent([
      { challengeName: 'CUSTOM_CHALLENGE', challengeResult: false },
      { challengeName: 'CUSTOM_CHALLENGE', challengeResult: true },
    ]),
  );
  assert.equal(event.response.issueTokens, true);
});
