# Architecture Decision Log

Each entry records a decision, the alternatives considered, and why we chose what
we chose. Newest entries last.

---

## ADR-001: Build one flow (step-up auth) as a reference, not all three

**Context.** The customer has three stalled custom auth flows and a design doc
cycling through internal review.

**Decision.** Build only the step-up auth flow, end to end, as a reference
implementation with a porting guide. The loyalty-tier and concierge flows reuse
the same Cognito custom-auth trigger skeleton; only the challenge logic differs.

**Alternatives rejected.**
- *Build all three flows*: triples the scope without teaching the team anything
  new after the first flow; contradicts the engagement's enablement goal.
- *Advisory review of the 30-page design doc*: the team is stuck in analysis
  paralysis; a working artifact resolves the cycling faster than a fourth opinion.

---

## ADR-002: Cognito custom auth challenge triggers for the second factor

**Context.** Step-up needs a second factor after an already-authenticated session.

**Decision.** Use Cognito's native custom auth flow (`CUSTOM_AUTH`) with the three
triggers — `DefineAuthChallenge`, `CreateAuthChallenge`,
`VerifyAuthChallengeResponse` — to issue and verify a 6-digit OTP.

**Alternatives rejected.**
- *Cognito built-in MFA (TOTP/SMS)*: MFA is evaluated at every sign-in, not
  on-demand per transaction; toggling MFA settings per request is racy and
  changes pool-wide posture.
- *A bespoke OTP microservice outside Cognito*: duplicates token issuance,
  session state and lockout logic that Cognito already provides; the resulting
  step-up proof would not be a first-class Cognito token.

---

## ADR-003: Step-up proof = fresh Cognito token, enforced by the resource server

**Context.** After the OTP succeeds, the booking API must be able to tell that
*this specific user* recently completed step-up.

**Decision.** A successful `CUSTOM_AUTH` round issues a fresh set of tokens. The
client retries the booking with the new ID token in an `X-StepUp-Token` header.
The booking Lambda verifies it with `aws-jwt-verify` and enforces:
1. valid signature and audience (same user pool + client);
2. same `sub` as the primary access token that passed the API Gateway authorizer;
3. `auth_time` within the last 5 minutes.

**Alternatives rejected.**
- *Pre Token Generation trigger adding a `step_up` claim*: works, but couples
  the pattern to token customization (an extra trigger + pool feature) and makes
  local reasoning harder; freshness via `auth_time` needs no extra moving parts.
- *Server-side session table of "stepped-up" users*: introduces shared mutable
  state and TTL bookkeeping that Cognito's token issuance already gives us.

**Consequence.** The step-up window (5 min) is a policy constant in the booking
Lambda, configurable via environment variable.

---

## ADR-004: AWS CDK (TypeScript) for IaC

**Context.** The deliverable must deploy into any AWS account.

**Decision.** A single CDK app/stack. CDK gives typed constructs for Cognito
trigger wiring (the most error-prone part of this pattern) and one-command
deploy/destroy.

**Alternatives rejected.**
- *CloudFormation YAML*: trigger wiring and Lambda bundling get verbose; the
  customer team already uses TypeScript.
- *Terraform*: fine choice, but the customer's platform team standardizes on
  CloudFormation-based tooling, and CDK synthesizes to CloudFormation.

---

## ADR-005: Serverless-only footprint

**Decision.** Cognito + API Gateway (HTTP API, JWT authorizer) + Lambda +
DynamoDB. No VPC, no EC2, no S3 buckets.

**Rationale.** Nothing in the flow needs a network to secure: every component is
a managed endpoint with IAM/JWT auth. This removes entire classes of findings
(open security groups, public buckets) and keeps `cdk deploy` friction near zero
for the customer's sandbox accounts.

---

## ADR-006: OTP delivery is pluggable, defaulting to CloudWatch Logs in demo

**Context.** Real email delivery needs SES identity verification, which cannot be
assumed in a reviewer's or customer's sandbox account.

**Decision.** `CreateAuthChallenge` delivers the OTP via SES only when
`SES_FROM_ADDRESS` is configured; otherwise it logs a redacted marker plus the
OTP to CloudWatch Logs (demo convenience, documented as a known risk in
`docs/SECURITY_COMPLIANCE.md`).

**Alternatives rejected.**
- *Require SES setup*: blocks one-command deploy in fresh accounts.
- *SNS SMS*: sandbox SMS requires origination identities in most regions; worse
  demo ergonomics than email.

---

## ADR-007: Demo UI ships a mock mode *(withdrawn 2026-08-20)*

**Context.** The customer demo must be runnable in a conference room with no AWS
access, and reviewers must be able to see the flow without deploying.

**Decision.** The web app defines narrow `AuthService`/`BookingService`
interfaces with two implementations: `mock` (in-browser simulation of the exact
same state machine, including 3-attempt lockout and OTP expiry) and `live`
(Cognito `InitiateAuth`/`RespondToAuthChallenge` + the deployed API). Selection
is by configuration only.

**Consequence.** The mock must be kept behaviorally faithful to the Lambdas; the
porting guide calls this out as a maintenance point.

**Status.** Withdrawn: the mock implementation was removed once the demo UI
became publicly hosted on CloudFront — the hosted live flow covers every demo
scenario, and dropping the mock removes the drift risk. The narrow
`AuthService`/`BookingService` seams remain, so a mock can be reintroduced
without touching the UI.

---

## ADR-008: Pricing and the step-up threshold live in DynamoDB, priced server-side

**Context.** The room catalog was hardcoded in the SPA and the booking amount
was computed in the browser and trusted by the API — a client bypassing the UI
could understate the amount and dodge the step-up policy. The threshold was a
deploy-time constant, so changing it required a redeploy.

**Decision.** The bookings table gains a `CONFIG` partition holding the room
catalog (`ROOM#<id>`) and the step-up threshold (`THRESHOLD`). `POST /bookings`
accepts only `{ roomId, nights }` and prices the booking server-side from the
catalog; `GET /config` serves the catalog and current threshold to the UI; and
`PUT /admin/threshold` lets members of the Cognito `admins` group change the
threshold at runtime (enforced in the Lambda from the JWT's `cognito:groups`
claim). The `STEP_UP_THRESHOLD` environment value remains only as the fallback
default until an admin sets one.

**Alternatives rejected.**
- *Keep client-side amounts, validate ranges*: still trusts the client for the
  security-relevant number.
- *Separate config table / AppConfig*: more moving parts than a demo needs;
  the single-table CONFIG partition keeps IAM grants unchanged.
- *IAM-authorized admin API route*: a second auth scheme on one API; Cognito
  groups keep the whole demo on one identity model.
