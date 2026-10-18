import { Badge, Button, Card, Icon, Input, Tag } from "@/ui/primitives";

export const metadata = { title: "Dashboard" };

/**
 * Phase 1 dashboard: a brand-correct specimen of the migrated primitives.
 * Real operational widgets arrive in later phases; this verifies the design
 * system renders faithfully inside the app shell.
 */
export default function DashboardPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          font: "700 11px var(--font-body)",
          letterSpacing: ".14em",
          textTransform: "uppercase",
          color: "var(--orange-600)",
        }}
      >
        <span style={{ width: 18, height: 2, background: "var(--orange-500)" }} />
        Cargo &amp; Logistics
      </div>

      <Card eyebrow="Component check" title="Design system primitives">
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <Button variant="primary" leadingIcon={<Icon name="Plus" size={16} />}>
              Book shipment
            </Button>
            <Button variant="secondary">Schedule pickup</Button>
            <Button variant="outline">Track</Button>
            <Button variant="ghost">Cancel</Button>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <Badge tone="brand" dot>
              Booked
            </Badge>
            <Badge tone="info" dot>
              In transit
            </Badge>
            <Badge tone="warning" dot>
              Delayed
            </Badge>
            <Badge tone="success" dot>
              Delivered
            </Badge>
            <Badge tone="danger" dot>
              Exception
            </Badge>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Tag selected>Air</Tag>
            <Tag>Sea</Tag>
            <Tag>Road</Tag>
          </div>

          <div style={{ maxWidth: 320 }}>
            <Input
              label="Tracking number"
              placeholder="ORB-2048-7731"
              hint="Tracking numbers start with ORB-"
              leadingIcon={<Icon name="Search" size={16} />}
              inputStyle={{ fontFamily: "var(--font-mono)" }}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
