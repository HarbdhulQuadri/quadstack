import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";

interface ReceiptItem {
  name:      string;
  quantity:  number;
  price:     string;
}

interface ReceiptEmailProps {
  customerName:  string;
  appName:       string;
  orderId:       string;
  items:         ReceiptItem[];
  total:         string;
  currency:      string;
  orderUrl:      string;
}

export function ReceiptEmail({
  customerName,
  appName,
  orderId,
  items,
  total,
  currency,
  orderUrl,
}: ReceiptEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your {appName} receipt — order #{orderId}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Receipt</Heading>

          <Text style={text}>Hi {customerName}, thanks for your order!</Text>

          <Section style={orderBox}>
            <Text style={orderLabel}>Order #{orderId}</Text>

            {items.map((item, i) => (
              <Row key={i} style={itemRow}>
                <Column style={itemName}>
                  {item.name}
                  {item.quantity > 1 && (
                    <span style={qty}> × {item.quantity}</span>
                  )}
                </Column>
                <Column style={itemPrice}>
                  {currency} {item.price}
                </Column>
              </Row>
            ))}

            <Hr style={divider} />

            <Row style={totalRow}>
              <Column style={totalLabel}>Total</Column>
              <Column style={totalAmount}>
                {currency} {total}
              </Column>
            </Row>
          </Section>

          <Text style={link}>
            View your order at{" "}
            <a href={orderUrl} style={anchor}>
              {orderUrl}
            </a>
          </Text>

          <Hr style={hr} />

          <Text style={footer}>
            {appName} · Questions? Reply to this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

ReceiptEmail.PreviewProps = {
  customerName: "Ada",
  appName:      "QuadStack",
  orderId:      "ORD-0042",
  currency:     "USD",
  total:        "79.00",
  orderUrl:     "http://localhost:3000/orders/ORD-0042",
  items: [
    { name: "Pro Plan",         quantity: 1, price: "49.00" },
    { name: "Extra Workspace",  quantity: 2, price: "15.00" },
  ],
} satisfies ReceiptEmailProps;

export default ReceiptEmail;

const main       = { backgroundColor: "#f9fafb", fontFamily: "sans-serif" };
const container  = { backgroundColor: "#ffffff", margin: "40px auto", padding: "40px", borderRadius: "8px", maxWidth: "520px" };
const h1         = { fontSize: "24px", fontWeight: "700", color: "#111827", margin: "0 0 8px" };
const text       = { fontSize: "15px", lineHeight: "24px", color: "#374151" };
const orderBox   = { backgroundColor: "#f9fafb", borderRadius: "6px", padding: "16px 20px", margin: "24px 0" };
const orderLabel = { fontSize: "12px", color: "#6b7280", margin: "0 0 12px", textTransform: "uppercase" as const, letterSpacing: "0.05em" };
const itemRow    = { margin: "6px 0" };
const itemName   = { fontSize: "14px", color: "#111827" };
const qty        = { color: "#6b7280" };
const itemPrice  = { fontSize: "14px", color: "#111827", textAlign: "right" as const };
const divider    = { borderColor: "#e5e7eb", margin: "12px 0" };
const totalRow   = { margin: "6px 0" };
const totalLabel = { fontSize: "14px", fontWeight: "700", color: "#111827" };
const totalAmount= { fontSize: "14px", fontWeight: "700", color: "#111827", textAlign: "right" as const };
const link       = { fontSize: "13px", color: "#6b7280" };
const anchor     = { color: "#111827" };
const hr         = { borderColor: "#e5e7eb", margin: "32px 0 16px" };
const footer     = { fontSize: "12px", color: "#9ca3af" };
