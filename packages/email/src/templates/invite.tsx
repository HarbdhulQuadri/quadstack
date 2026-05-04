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

interface InviteEmailProps {
  invitedByName:  string;
  orgName:        string;
  appName:        string;
  acceptUrl:      string;
  expiresIn:      string;
}

export function InviteEmail({
  invitedByName,
  orgName,
  appName,
  acceptUrl,
  expiresIn,
}: InviteEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{invitedByName} invited you to join {orgName} on {appName}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>You've been invited</Heading>

          <Text style={text}>
            <strong>{invitedByName}</strong> has invited you to join{" "}
            <strong>{orgName}</strong> on {appName}.
          </Text>

          <Section style={btnSection}>
            <Button href={acceptUrl} style={btn}>
              Accept invitation
            </Button>
          </Section>

          <Text style={warning}>
            This invitation expires in <strong>{expiresIn}</strong>. If you
            weren't expecting this invite, you can ignore this email.
          </Text>

          <Hr style={hr} />

          <Text style={footer}>
            {appName} · You received this because {invitedByName} sent you an invite.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

InviteEmail.PreviewProps = {
  invitedByName: "Quadri",
  orgName:       "Acme Corp",
  appName:       "QuadStack",
  acceptUrl:     "http://localhost:3000/invite?token=abc123",
  expiresIn:     "48 hours",
} satisfies InviteEmailProps;

export default InviteEmail;

const main       = { backgroundColor: "#f9fafb", fontFamily: "sans-serif" };
const container  = { backgroundColor: "#ffffff", margin: "40px auto", padding: "40px", borderRadius: "8px", maxWidth: "520px" };
const h1         = { fontSize: "24px", fontWeight: "700", color: "#111827", margin: "0 0 16px" };
const text       = { fontSize: "15px", lineHeight: "24px", color: "#374151" };
const warning    = { fontSize: "13px", color: "#6b7280" };
const btnSection = { margin: "24px 0" };
const btn        = { backgroundColor: "#111827", color: "#ffffff", padding: "12px 24px", borderRadius: "6px", fontSize: "14px", fontWeight: "600", textDecoration: "none" };
const hr         = { borderColor: "#e5e7eb", margin: "32px 0 16px" };
const footer     = { fontSize: "12px", color: "#9ca3af" };
