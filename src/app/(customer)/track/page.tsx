import { Button, Icon, Input } from "@/ui/primitives";

export const metadata = { title: "Track" };

/**
 * Phase 1 placeholder for the customer tracking screen. The real search → result
 * + timeline flow (and public-tracking privacy rules) are built in Phase 4.
 */
export default function TrackPage() {
  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ font: "700 30px/1.2 var(--font-display)", color: "var(--text-strong)", margin: "0 0 8px" }}>
        Track your shipment
      </h1>
      <p style={{ font: "400 15px/1.5 var(--font-body)", color: "var(--text-muted)", margin: "0 0 24px" }}>
        Enter your tracking number to see where your cargo is.
      </p>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
        <Input
          style={{ flex: 1 }}
          label="Tracking number"
          placeholder="ORB-2048-7731"
          leadingIcon={<Icon name="Search" size={16} />}
          inputStyle={{ fontFamily: "var(--font-mono)" }}
        />
        <Button size="l" trailingIcon={<Icon name="ArrowRight" size={16} />}>
          Track
        </Button>
      </div>
    </div>
  );
}
