# AnyCompany Hotels — Step-Up Authentication Reference Implementation

A working reference implementation of a **step-up authentication flow** built on
**Amazon Cognito custom auth challenges**, delivered as part of an AWS engagement
with AnyCompany Hotels' Loyalty Identity Platform team.

When a booking exceeds a configurable amount threshold, the user must complete a
second factor (a one-time password) before the booking is accepted. The pattern is
designed so the AnyCompany team can independently port it to their own user pool and
then apply the same structure to their other two stalled flows (loyalty-tier
enrichment and concierge desk override).

> Detailed documentation lives in [`docs/`](docs/). Start with
> [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) for scope and
> [`docs/PORTING_GUIDE.md`](docs/PORTING_GUIDE.md) for how to adopt the pattern.

## Repository structure

| Path | Purpose |
| --- | --- |
| `backend/` | Lambda handlers: three Cognito custom auth triggers + the booking API |
| `backend/tests/` | Unit tests for every Lambda handler (`node --test`, no extra deps) |
| `infra/` | AWS CDK (TypeScript) app that deploys the whole stack to any account |
| `web/` | React demo UI (Vite), built against the deployed stack and published to CloudFront |
| `scripts/` | Operational helpers (e.g. seeding a demo user) |
| `docs/REQUIREMENTS.md` | Requirements specification and task breakdown |
| `docs/SECURITY_COMPLIANCE.md` | Security posture, accepted risks, and why |
| `docs/PORTING_GUIDE.md` | Step-by-step guide for the customer team to adopt the pattern |
| `docs/NEXT_STEPS.md` | Follow-up work, optimization ideas, handoff plan |
| `DECISIONS.md` | Architecture decision log |
| `PROGRESS.md` | Build progress log |

## Quick start

```bash
./scripts/deploy.sh
```

One command deploys the whole stack into the current AWS account/region and
prints a public **CloudFront URL** for the demo UI plus the seeded demo user's
credentials. Open the URL, sign in, book a room — any booking over the
threshold triggers the step-up OTP dialog. Visitors can also **register their
own account** from the sign-in page (Cognito emails a verification code, no
SES setup needed).

### Suggested demo script (≈3 minutes)

1. Sign in — the event log shows `USER_PASSWORD_AUTH` and the primary tokens.
2. Book the **Standard King, 1 night ($180)** — created instantly, badge "standard".
3. Book the **Presidential Suite ($1500)** — the API answers `403 step_up_required`
   and the verification dialog opens.
4. Enter a wrong code once — "2 attempts left" (the 3-attempt lockout is real).
5. Read the 6-digit code from the OTP email (with `SES_FROM_ADDRESS` set) or from
   the CreateAuthChallenge Lambda's CloudWatch log group, enter it — fresh tokens
   are issued, the booking retries automatically and lands with a
   **step-up verified** badge.

## Running the tests

```bash
cd backend && npm install && npm test   # 29 unit tests, node --test
```

## Deployment details

```bash
./scripts/deploy.sh you@example.com 'YourPass#2026x'   # custom demo user
```

The script bootstraps CDK if needed, deploys the stack, seeds the demo user,
builds the web UI and publishes it to **CloudFront** (private S3 origin, Block
Public Access on, OAC-only reads) — it prints the `https://…cloudfront.net`
demo URL at the end, ready to share with an audience. It also writes
`web/.env.local`, so `npm run dev` in `web/` runs the same UI locally against
the deployed stack. Optional knobs via env: `STEP_UP_THRESHOLD`,
`SES_FROM_ADDRESS` (real OTP emails), `WEB_ORIGIN` (extra CORS origin for
local dev). Tear down with `./scripts/destroy.sh`.

Manual step-by-step equivalents are in
[`docs/PORTING_GUIDE.md`](docs/PORTING_GUIDE.md#1-run-the-reference-as-is).

## Architecture at a glance

```
Browser (React SPA, served by CloudFront ◄── private S3 bucket, OAC)
  │ 1. USER_PASSWORD_AUTH sign-in            ┌─────────────────────────────┐
  ├──────────────────────────────────────────►  Amazon Cognito User Pool    │
  │ 4. CUSTOM_AUTH step-up (OTP)             │  ├─ DefineAuthChallenge λ    │
  ├──────────────────────────────────────────►  ├─ CreateAuthChallenge λ    │
  │                                          │  └─ VerifyAuthChallenge λ    │
  │ 2. POST /bookings (JWT)                  └─────────────────────────────┘
  ├──────────────────────────────────────────► API Gateway (JWT authorizer)
  │ 3. 403 step_up_required if > threshold        │
  │ 5. retry with X-StepUp-Token                  ▼
  │                                          Booking Lambda ──► DynamoDB
```

## License

MIT — see [LICENSE](LICENSE).
