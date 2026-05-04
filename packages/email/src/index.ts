import { render } from "@react-email/render";
import { Resend } from "resend";

import { InviteEmail } from "./templates/invite";
import { ReceiptEmail } from "./templates/receipt";
import { ResetPasswordEmail } from "./templates/reset-password";
import { WelcomeEmail } from "./templates/welcome";

export * from "./templates/invite";
export * from "./templates/receipt";
export * from "./templates/reset-password";
export * from "./templates/welcome";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM ?? "noreply@example.com";

// ─── Typed payloads ───────────────────────────────────────────────────────────

type WelcomePayload = {
  type: "welcome";
  to: string;
  props: React.ComponentProps<typeof WelcomeEmail>;
};

type ResetPasswordPayload = {
  type: "reset-password";
  to: string;
  props: React.ComponentProps<typeof ResetPasswordEmail>;
};

type InvitePayload = {
  type: "invite";
  to: string;
  props: React.ComponentProps<typeof InviteEmail>;
};

type ReceiptPayload = {
  type: "receipt";
  to: string;
  props: React.ComponentProps<typeof ReceiptEmail>;
};

type EmailPayload =
  | WelcomePayload
  | ResetPasswordPayload
  | InvitePayload
  | ReceiptPayload;

// ─── Send ─────────────────────────────────────────────────────────────────────

export async function sendEmail(payload: EmailPayload): Promise<void> {
  let subject: string;
  let component: React.ReactElement;

  switch (payload.type) {
    case "welcome": {
      subject = `Welcome to ${payload.props.appName}!`;
      component = <WelcomeEmail {...payload.props} />;
      break;
    }
    case "reset-password": {
      subject = `Reset your ${payload.props.appName} password`;
      component = <ResetPasswordEmail {...payload.props} />;
      break;
    }
    case "invite": {
      subject = `You've been invited to join ${payload.props.teamName} on ${payload.props.appName}`;
      component = <InviteEmail {...payload.props} />;
      break;
    }
    case "receipt": {
      subject = `Your ${payload.props.appName} receipt — order #${payload.props.orderId}`;
      component = <ReceiptEmail {...payload.props} />;
      break;
    }
  }

  const html = await render(component);
  const text = await render(component, { plainText: true });

  await resend.emails.send({ from: FROM, to: payload.to, subject, html, text });
}

// ─── Better Auth hooks ────────────────────────────────────────────────────────
// Wire these into packages/auth/src/index.ts under `emailAndPassword.sendResetPassword`

export async function sendPasswordResetEmail({
  email,
  url,
  appName = "QuadStack",
}: {
  email: string;
  url: string;
  appName?: string;
}): Promise<void> {
  await sendEmail({
    type: "reset-password",
    to: email,
    props: { email, resetUrl: url, appName },
  });
}

export async function sendWelcomeEmail({
  email,
  name,
  appName = "QuadStack",
  loginUrl,
}: {
  email: string;
  name: string;
  appName?: string;
  loginUrl: string;
}): Promise<void> {
  await sendEmail({
    type: "welcome",
    to: email,
    props: { name, appName, loginUrl },
  });
}
