/**
 * VerifyAuthChallengeResponse trigger — checks the user's OTP answer
 * against the value CreateAuthChallenge stored in
 * privateChallengeParameters. Comparison is constant-time so response
 * timing leaks nothing about how many digits matched (NFR-4).
 */
import { timingSafeEqual } from 'node:crypto';

export const constantTimeEquals = (a, b) => {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    // Compare b against itself to keep the timing profile uniform.
    timingSafeEqual(bufB, bufB);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
};

export const handler = async (event) => {
  const expected = event.request.privateChallengeParameters?.answer;
  const answer = event.request.challengeAnswer;

  event.response.answerCorrect =
    typeof expected === 'string' &&
    typeof answer === 'string' &&
    expected.length > 0 &&
    constantTimeEquals(expected, answer);

  return event;
};
