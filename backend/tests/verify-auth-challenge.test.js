import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handler, constantTimeEquals } from '../src/verify-auth-challenge.js';

const makeEvent = (expected, answer) => ({
  request: {
    privateChallengeParameters: expected === undefined ? undefined : { answer: expected },
    challengeAnswer: answer,
  },
  response: {},
});

test('correct answer is accepted', async () => {
  const event = await handler(makeEvent('123456', '123456'));
  assert.equal(event.response.answerCorrect, true);
});

test('wrong answer is rejected', async () => {
  const event = await handler(makeEvent('123456', '654321'));
  assert.equal(event.response.answerCorrect, false);
});

test('answer with different length is rejected', async () => {
  const event = await handler(makeEvent('123456', '12345'));
  assert.equal(event.response.answerCorrect, false);
});

test('missing private parameters rejects instead of throwing', async () => {
  const event = await handler(makeEvent(undefined, '123456'));
  assert.equal(event.response.answerCorrect, false);
});

test('missing answer is rejected', async () => {
  const event = await handler(makeEvent('123456', undefined));
  assert.equal(event.response.answerCorrect, false);
});

test('empty expected value never matches', async () => {
  const event = await handler(makeEvent('', ''));
  assert.equal(event.response.answerCorrect, false);
});

test('constantTimeEquals compares values, not references', () => {
  assert.equal(constantTimeEquals('abc', 'abc'), true);
  assert.equal(constantTimeEquals('abc', 'abd'), false);
  assert.equal(constantTimeEquals('abc', 'ab'), false);
});
