# Next Steps — Optimization, Hardening, Handoff

What comes after the reference is delivered. Grouped by owner.

## For the AnyCompany team (post-handoff)

1. **Port the pattern** following `docs/PORTING_GUIDE.md`; run the verification
   checklist there against your own user pool.
2. **Production OTP delivery**: replace the demo delivery with your notification
   platform (verified SES domain identity, or your existing transactional email
   provider). Delete the CloudWatch fallback branch (risk R-1).
3. **Threat protection**: enable Cognito's Plus feature plan on the production
   pool for adaptive auth and compromised-credential checks (risk R-6).
4. **Edge protection**: AWS WAF + per-route throttling on the booking API before
   portfolio rollout (risk R-4).
5. **Lifecycle hardening**: `RemovalPolicy.RETAIN`, deletion protection and PITR
   on production tables and pools (risk R-5).
6. **Observability**: add CloudWatch alarms on custom-auth failure rates (a spike
   in `failAuthentication` events is an attack signal) and structured metrics
   from the booking API's 403 responses.
7. **Apply the skeleton to the other two flows** (loyalty-tier via Pre Token
   Generation, concierge override via the same challenge triad) — see the
   porting guide, section 3.

## Possible follow-up engagements (out of current scope)

- Hands-on pairing for the concierge override flow if the team wants it after
  porting step-up.
- Design review of the multi-region user pool strategy (the 7,000-property
  rollout raises regional failover questions this reference does not address).

## Technical debt / known limitations in the reference

| Item | Impact | Suggested fix |
| --- | --- | --- |
| OTP email is plain text, English only | Cosmetic for demo | Use templated, localized SES emails in production |
| No refresh-token rotation handling in the SPA | Long demos may hit token expiry (1 h) | Sign in again, or add refresh flow when porting |
| `web` has no automated tests | UI regressions surface manually | Add Playwright coverage of the two demo paths if the SPA is kept beyond demo use |

## Handoff package checklist

- [x] Source repository with per-feature commit history
- [x] IaC deployable to any account (`infra/`, CDK)
- [x] Unit tests for all Lambda handlers (`backend/tests`)
- [x] Requirements, decisions, security notes, porting guide (`docs/`, `DECISIONS.md`)
- [ ] Walkthrough session with the AnyCompany team (scheduled after delivery;
      recording to be attached)
- [ ] Scan results (ProtoShield/ASH, Holmes) attached with responses in
      `docs/SECURITY_COMPLIANCE.md`
