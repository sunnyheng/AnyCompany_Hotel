# Porting Guide — Adopting the Step-Up Pattern in Your Own Stack

Audience: AnyCompany Hotels engineers. Goal: take this reference, run it in your
own AWS account, port it into your codebase, and then reapply the same skeleton to
the loyalty-tier and concierge-override flows — without further AWS involvement.

## 1. Run the reference as-is

### 1.1 Deploy

```bash
cd infra
npm install
npx cdk bootstrap        # once per account/region
npx cdk deploy \
  -c stepUpThreshold=500 \
  -c webOrigin=http://localhost:5173 \
  -c sesFromAddress=no-reply@yourdomain.example   # optional; omit to log OTPs
```

Note the four stack outputs: `UserPoolId`, `UserPoolClientId`, `ApiUrl`,
`StepUpThreshold`.

### 1.2 Seed a user (self sign-up is disabled)

```bash
./scripts/create-demo-user.sh <UserPoolId> you@yourdomain.example 'YourPass#2026x'
```

### 1.3 Running the demo UI against a deployed stack

```bash
cd web
cp .env.example .env.local    # fill in the stack outputs
npm install
npm run dev
```

Sign in, book the Presidential Suite, and watch the auth event log: the 403 from
the API, the CUSTOM_AUTH round, and the retried booking with the step-up token.
Without SES configured, read the OTP from the CreateAuthChallenge function's
CloudWatch log group.

## 2. What to port, piece by piece

| Reference piece | Where it goes in your stack | Notes |
| --- | --- | --- |
| `backend/src/define-auth-challenge.js` | Lambda trigger on **your** user pool | Generic; no changes needed. |
| `backend/src/create-auth-challenge.js` | Lambda trigger | Swap the delivery block for your notification service. Keep the challengeMetadata OTP reuse. |
| `backend/src/verify-auth-challenge.js` | Lambda trigger | Generic; keep the constant-time compare. |
| Threshold + freshness check in `backend/src/booking-api.js` | Your booking/payments service | The pattern's heart: reject with `step_up_required`, verify the second token's signature + subject + `auth_time`. |
| `web/src/services/live.ts` | Your web/mobile client | Two calls: `InitiateAuth(CUSTOM_AUTH)` and `RespondToAuthChallenge`. Retry the original request with the fresh token. |

Pool prerequisites: your app client needs `ALLOW_CUSTOM_AUTH` enabled, and the
three triggers attached (see `infra/lib/step-up-auth-stack.ts` for the exact CDK
wiring; the console equivalent is User pool → Extensions → Lambda triggers).

Your hosted sign-in (managed login) stays untouched: step-up is a *separate*
CUSTOM_AUTH round the client starts only when the resource server demands it.

## 3. Reapplying the skeleton to the other two flows

The trigger skeleton (state machine → challenge issuance → verification) is
flow-agnostic. What changes per flow:

### Loyalty-tier enrichment (Silver/Gold/Platinum post-sign-in)

- No user-facing challenge at all: use a **Pre Token Generation** trigger instead
  of the custom-auth triad, reading the tier from your loyalty store and adding
  it as a claim. Custom auth is not required — that is itself a finding from this
  reference: don't force interactive challenges on non-interactive enrichment.

### Concierge desk override

- Same three triggers; `CreateAuthChallenge` delivers the approval code to the
  *manager on duty* channel instead of the guest, and
  `VerifyAuthChallengeResponse` checks the override code.
- The booking API check generalizes: instead of `amount > threshold`, the policy
  is `actor is concierge AND action is override`. Keep the same 403 →
  challenge → retry-with-proof loop.

## 4. Verification checklist before you call it done

- [ ] Happy path: below-threshold booking succeeds with primary token only.
- [ ] Step-up path: above-threshold booking → 403 → OTP → retry succeeds and the
      record is marked step-up verified.
- [ ] Wrong OTP shows attempts remaining; 3 wrong answers kills the session.
- [ ] Replay: a step-up token older than 5 minutes is rejected (`step_up_expired`).
- [ ] Cross-user: a step-up token from another user is rejected (`step_up_invalid`).
- [ ] All unit tests pass: `cd backend && npm test`.
