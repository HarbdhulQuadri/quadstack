import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface ResetPasswordEmailProps {
  name:       string;
  appName:    string;
  resetUrl:   string;
  expiresIn:  string;
}

export function ResetPasswordEmail({
  name,
  appName,
  resetUrl,
  expiresIn,
}: ResetPasswordEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Reset your {appName} password</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Reset your password</Heading>

          <Text style={text}>Hi {name},</Text>

          <Text style={text}>
            We received a request to reset the password for your {appName}{" "}
            account. Click the button below to set a new password.
          </Text>

          <Section style={btnSection}>
            <Button href={resetUrl} style={btn}>
              Reset password
            </Button>
          </Section>

          <Text style={warning}>
            This link expires in <strong>{expiresIn}</strong>. If you didn't
            request a password reset, you can safely ignore this email — your
            password won't change.
          </Text>

          <Hr style={hr} />

          <Text style={footer}>
            If the button doesn't work, paste this URL into your browser:
            <br />
            <span style={{ color: "#6b7280", wordBreak: "break-all" }}>
              {resetUrl}
            </span>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

ResetPasswordEmail.PreviewProps = {
  name:      "Ada",
  appName:   "QuadStack",
  resetUrl:  "http://localhost:3000/reset-password?token=abc123",
  expiresIn: "1 hour",
} satisfies ResetPasswordEmailProps;

export default ResetPasswordEmail;

const main       = { backgroundColor: "#f9fafb", fontFamily: "sans-serif" };
const container  = { backgroundColor: "#ffffff", margin: "40px auto", padding: "40px", borderRadius: "8px", maxWidth: "520px" };
const h1         = { fontSize: "24px", fontWeight: "700", color: "#111827", margin: "0 0 16px" };
const text       = { fontSize: "15px", lineHeight: "24px", color: "#374151" };
const warning    = { fontSize: "13px", lineHeight: "20px", color: "#6b7280" };
const btnSection = { margin: "24px 0" };
const btn        = { backgroundColor: "#111827", color: "#ffffff", padding: "12px 24px", borderRadius: "6px", fontSize: "14px", fontWeight: "600", textDecoration: "none" };
const hr         = { borderColor: "#e5e7eb", margin: "32px 0 16px" };
const footer     = { fontSize: "12px", color: "#9ca3af" };
