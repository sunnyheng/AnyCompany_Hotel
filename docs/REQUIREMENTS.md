# Requirements Specification — Step-Up Auth Reference Implementation

## 1. Engagement context

AnyCompany Hotels (7,000 properties, multi-region) is rebuilding its hosted sign-in
on Amazon Cognito. Three custom auth flows are stalled: loyalty-tier enrichment,
step-up auth for high-value bookings, and a concierge desk override path. The team
is cycling on a 30-page design doc with three competing architectures.

**Engagement scope (agreed with Marcus Chen, Engineering Manager):**

- Build **one** flow — **step-up authentication on high-value bookings** — as a
  working reference implementation.
- Deliver it as a clean artifact in **our** environment (not the customer repo):
  code, documentation, and a porting guide, so the AnyCompany team owns the
  integration on their terms.
- Production rollout, and the other two flows, are explicitly **out of scope**;
  the pattern documentation must be strong enough that the team can apply it to
  loyalty-tier and concierge without further AWS involvement.

**Success criterion:** AnyCompany Hotels engineers can independently port the
pattern into their codebase using the reference code + documentation, achieving a
working step-up auth flow with happy-path and error-path scenarios, without
further AWS involvement.

## 2. Functional requirements

| ID | Requirement |
| --- | --- |
| FR-1 | A user can sign in with email + password against a Cognito user pool and receive standard JWT tokens. |
| FR-2 | A signed-in user can create a hotel booking through an authenticated API. |
| FR-3 | Bookings **at or below** a configurable amount threshold (default USD 500) complete with the primary session alone. |
| FR-4 | Bookings **above** the threshold are rejected with a machine-readable `step_up_required` response until the user completes a second factor. |
| FR-5 | The second factor is a 6-digit one-time password (OTP) issued through Cognito's custom auth challenge flow (`DefineAuthChallenge` → `CreateAuthChallenge` → `VerifyAuthChallengeResponse`). |
| FR-6 | A wrong OTP can be retried; after 3 failed attempts the custom auth session fails and the user must restart the step-up flow. |
| FR-7 | After a successful step-up, retrying the booking with proof of the step-up succeeds; the stored booking records that it was step-up verified. |
| FR-8 | Step-up proof expires: a step-up token older than 5 minutes is not accepted for new high-value bookings. |
| FR-9 | A user can list their own bookings (and only their own). |
| FR-10 | The demo UI walks through the entire flow visually, including an event log of every auth interaction, suitable for a customer demo. |
| FR-11 | The demo UI runs against the deployed stack and is published to a public CloudFront URL by the deploy script, so the flow can be demonstrated from any browser. |
| FR-12 | A visitor can register an account with their own email address, confirmed by an emailed verification code, and then sign in without operator involvement. |
| FR-13 | The room catalog and step-up threshold are stored in DynamoDB; booking amounts are computed server-side from the catalog, never taken from the client. |
| FR-14 | A member of the `admins` group can update the step-up threshold from an admin panel in the demo UI, taking effect immediately without redeployment. |

## 3. Non-functional requirements

| ID | Requirement |
| --- | --- |
| NFR-1 | All infrastructure is expressed as IaC (AWS CDK, TypeScript) and deploys into any bootstrapped AWS account/region with a single `cdk deploy`. |
| NFR-2 | Serverless-only architecture: no public network exposure beyond API Gateway and Cognito's managed endpoints; no EC2, no open security-group ports. |
| NFR-3 | IAM permissions follow least privilege; wildcard resources only where the AWS service requires it, and every such case is documented in `docs/SECURITY_COMPLIANCE.md`. |
| NFR-4 | OTP comparison is constant-time; OTPs are never returned to the client by the backend and never logged in full in live mode. |
| NFR-5 | Every Lambda handler has unit tests runnable with `node --test` and no test-framework dependencies. |
| NFR-6 | All repository content (code, comments, docs) is in English. |
| NFR-7 | The pattern is documented so it can be re-applied to the other two flows (loyalty-tier, concierge override) by changing only the challenge logic. |

## 4. Explicitly out of scope

- Production rollout to AnyCompany's existing prod user pool.
- The loyalty-tier and concierge override flows (covered conceptually in the
  porting guide only).
- Real email/SMS delivery at production quality. The reference "delivers" the OTP
  via Amazon SES when configured, and via CloudWatch Logs otherwise; hardening the
  delivery channel is listed in `docs/NEXT_STEPS.md`.
- User sign-up / account management UX (a demo user is seeded by script).

## 5. Task breakdown

Each task maps to one or more commits, in this order:

1. **T1 — Scaffold**: repo layout, license, gitignore, top-level README.
2. **T2 — Requirements**: this document.
3. **T3 — Architecture decisions**: `DECISIONS.md` capturing the chosen pattern
   and the alternatives that were rejected.
4. **T4 — DefineAuthChallenge Lambda**: challenge state machine + tests.
5. **T5 — CreateAuthChallenge Lambda**: OTP generation and delivery + tests.
6. **T6 — VerifyAuthChallengeResponse Lambda**: constant-time verification + tests.
7. **T7 — Booking API Lambda**: threshold policy, step-up token verification,
   DynamoDB persistence + tests.
8. **T8 — CDK stack**: Cognito user pool + triggers, DynamoDB table, HTTP API with
   JWT authorizer, stack outputs; demo-user seed script.
9. **T9 — Demo UI scaffold**: Vite + React app shell, routing, service interfaces.
10. **T10 — Sign-in flow** in the demo UI.
11. **T11 — Booking + step-up OTP flow** in the demo UI, including the auth
    event log.
12. **T12 — Hosted demo UI**: published to CloudFront (private S3 origin) by
    the deploy script.
13. **T13 — Security & compliance notes**: scan-response document.
14. **T14 — Handoff docs**: porting guide, next steps, progress log, final README.
