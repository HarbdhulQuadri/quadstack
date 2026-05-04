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

interface WelcomeEmailProps {
  name:      string;
  appName:   string;
  loginUrl:  string;
}

export function WelcomeEmail({ name, appName, loginUrl }: WelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Welcome to {appName} — you're in.</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Welcome, {name}</Heading>

          <Text style={text}>
            Your account on <strong>{appName}</strong> is ready. Everything you
            need is one click away.
          </Text>

          <Section style={btnSection}>
            <Button href={loginUrl} style={btn}>
              Go to dashboard
            </Button>
          </Section>

          <Hr style={hr} />

          <Text style={footer}>
            You're receiving this because you signed up for {appName}. If you
            didn't, you can safely ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

WelcomeEmail.PreviewProps = {
  name:     "Ada",
  appName:  "QuadStack",
  loginUrl: "http://localhost:3000/dashboard",
} satisfies WelcomeEmailProps;

export default WelcomeEmail;

// ─── Styles ──────────────────────────────────────────────────────────────────
const main       = { backgroundColor: "#f9fafb", fontFamily: "sans-serif" };
const container  = { backgroundColor: "#ffffff", margin: "40px auto", padding: "40px", borderRadius: "8px", maxWidth: "520px" };
const h1         = { fontSize: "24px", fontWeight: "700", color: "#111827", margin: "0 0 16px" };
const text       = { fontSize: "15px", lineHeight: "24px", color: "#374151" };
const btnSection = { margin: "24px 0" };
const btn        = { backgroundColor: "#111827", color: "#ffffff", padding: "12px 24px", borderRadius: "6px", fontSize: "14px", fontWeight: "600", textDecoration: "none" };
const hr         = { borderColor: "#e5e7eb", margin: "32px 0 16px" };
const footer     = { fontSize: "12px", color: "#9ca3af" };
