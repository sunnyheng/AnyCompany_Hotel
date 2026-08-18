/**
 * CreateAuthChallenge trigger — issues the step-up OTP.
 *
 * On the first round of a session a fresh 6-digit OTP is generated and
 * delivered to the user's email. On retry rounds (wrong answer) the same
 * OTP is reused via challengeMetadata so the user is not spammed with a
 * new email per attempt.
 *
 * Delivery is pluggable (see DECISIONS.md, ADR-006): Amazon SES when
 * SES_FROM_ADDRESS is configured, CloudWatch Logs otherwise (demo only).
 */
import { randomInt } from 'node:crypto';

const OTP_LENGTH = 6;
const METADATA_PREFIX = 'OTP-';

export const generateOtp = () =>
  randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, '0');

export const maskEmail = (email) => {
  const [local, domain] = String(email).split('@');
  if (!domain) return '***';
  const visible = local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(local.length - 2, 1))}@${domain}`;
};

const previousOtp = (session) => {
  for (let i = session.length - 1; i >= 0; i -= 1) {
    const meta = session[i]?.challengeMetadata;
    if (meta && meta.startsWith(METADATA_PREFIX)) {
      return meta.slice(METADATA_PREFIX.length);
    }
  }
  return null;
};

const defaultDeliverOtp = async (email, otp) => {
  const fromAddress = process.env.SES_FROM_ADDRESS;
  if (!fromAddress) {
    // Demo fallback: no email identity configured. Known, documented risk —
    // see docs/SECURITY_COMPLIANCE.md (R-1). Never use in production.
    console.log(`[demo-delivery] step-up OTP for ${maskEmail(email)}: ${otp}`);
    return;
  }
  const { SESClient, SendEmailCommand } = await import('@aws-sdk/client-ses');
  const ses = new SESClient({});
  await ses.send(
    new SendEmailCommand({
      Source: fromAddress,
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: 'Your AnyCompany Hotels verification code' },
        Body: {
          Text: {
            Data:
              `Your verification code for the high-value booking is: ${otp}\n\n` +
              'This code expires with your sign-in session. If you did not request it, ignore this email.',
          },
        },
      },
    }),
  );
};

export const createHandler = ({ deliverOtp = defaultDeliverOtp } = {}) =>
  async (event) => {
    const session = event.request.session ?? [];
    const email = event.request.userAttributes?.email;

    let otp = previousOtp(session);
    if (!otp) {
      otp = generateOtp();
      await deliverOtp(email, otp);
    }

    event.response.privateChallengeParameters = { answer: otp };
    event.response.challengeMetadata = `${METADATA_PREFIX}${otp}`;
    event.response.publicChallengeParameters = {
      deliveryMedium: 'EMAIL',
      destination: maskEmail(email),
    };
    return event;
  };

export const handler = createHandler();
