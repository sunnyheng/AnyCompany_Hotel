# Progress Log

Tracks the build against the task breakdown in `docs/REQUIREMENTS.md` §5.

| Task | Description | Status | Notes |
| --- | --- | --- | --- |
| T1 | Repository scaffold | ✅ Done (2026-08-18) | README, LICENSE, gitignore |
| T2 | Requirements specification | ✅ Done (2026-08-18) | Scope agreed: step-up flow only |
| T3 | Architecture decision log | ✅ Done (2026-08-18) | ADR-001 … ADR-007 |
| T4 | DefineAuthChallenge Lambda | ✅ Done (2026-08-18) | 6 unit tests |
| T5 | CreateAuthChallenge Lambda | ✅ Done (2026-08-18) | OTP reuse across retries; SES/log delivery |
| T6 | VerifyAuthChallengeResponse Lambda | ✅ Done (2026-08-18) | Constant-time compare; 7 unit tests |
| T7 | Booking API Lambda | ✅ Done (2026-08-18) | 11 unit tests incl. expired/foreign token |
| T8 | CDK stack + seed script | ✅ Done (2026-08-18) | `cdk synth` + `tsc` clean |
| T9 | Demo UI scaffold | ✅ Done (2026-08-18) | Vite + React + TS |
| T10 | Service layer | ✅ Done (2026-08-18) | Narrow AuthService/BookingService seams |
| T11 | Sign-in / booking / step-up UI | ✅ Done (2026-08-18) | Event log narrates the flow |
| T12 | Hosted demo UI on CloudFront | ✅ Done (2026-08-20) | Private S3 origin, published by deploy.sh |
| T13 | Security & compliance notes | ✅ Done (2026-08-18) | 7 accepted risks documented |
| T14 | Handoff docs + final README | ✅ Done (2026-08-18) | Porting guide, next steps |

## Still open (post-build)

- [ ] Run ProtoShield/ASH and Holmes scans; record responses in
      `docs/SECURITY_COMPLIANCE.md` §Scan response
- [ ] Record the demo/walkthrough video
- [ ] Attach deliverables to the engagement ticket

## Verification status

- `backend`: `npm test` → 29/29 passing
- `infra`: `npx cdk synth` and `npx tsc --noEmit` → clean
- `web`: `npm run build` (includes type-check) → clean; hosted demo exercised manually against the deployed stack
