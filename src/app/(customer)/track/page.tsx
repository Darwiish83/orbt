import { Badge, Button, Icon, Input } from "@/ui/primitives";
import { prisma } from "@/db/client";
import { trackByNumber, type PublicTracking } from "@/modules/shipments/publicTracking";

export const metadata = { title: "Track" };

/**
 * Public shipment tracking (no auth). Reads the tracking number from the query
 * string and shows only the approved public subset. Never exposes financial,
 * document, PII or internal-note data.
 */
export default async function TrackPage({
  searchParams,
}: {
  searchParams: Promise<{ n?: string }>;
}) {
  const { n } = await searchParams;
  const number = (n ?? "").trim();
  let result: PublicTracking | null = null;
  let notFound = false;
  if (number) {
    result = await trackByNumber(prisma, number);
    notFound = result === null;
  }

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ font: "700 30px/1.2 var(--font-display)", color: "var(--text-strong)", margin: "0 0 8px" }}>
        Track your shipment
      </h1>
      <p style={{ font: "400 15px/1.5 var(--font-body)", color: "var(--text-muted)", margin: "0 0 24px" }}>
        Enter your tracking number to see where your cargo is.
      </p>

      <form method="get" action="/track" style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
        <Input
          name="n"
          defaultValue={number}
          style={{ flex: 1 }}
          label="Tracking number"
          placeholder="ORB-2026-7K3QZ9"
          leadingIcon={<Icon name="Search" size={16} />}
          inputStyle={{ fontFamily: "var(--font-mono)" }}
        />
        <Button type="submit" size="l" trailingIcon={<Icon name="ArrowRight" size={16} />}>
          Track
        </Button>
      </form>

      {notFound && (
        <div
          role="status"
          style={{
            marginTop: 24,
            background: "var(--status-warning-bg)",
            color: "var(--status-warning)",
            borderRadius: "var(--radius-s)",
            padding: "12px 14px",
            fontSize: 14,
          }}
        >
          No shipment found for <b style={{ fontFamily: "var(--font-mono)" }}>{number}</b>. Tracking
          numbers start with <b>ORB-</b>.
        </div>
      )}

      {result && (
        <div
          style={{
            marginTop: 24,
            background: "var(--surface-card)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-l)",
            boxShadow: "var(--shadow-1)",
            padding: 24,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-strong)" }}>
              {result.trackingNumber}
            </div>
            <Badge tone="info" dot>
              {result.status}
            </Badge>
          </div>
          <div style={{ marginTop: 10, fontSize: 14, color: "var(--text-muted)" }}>
            {result.mode} · {result.origin || "—"} → {result.destination || "—"}
          </div>

          <ol style={{ listStyle: "none", padding: 0, margin: "20px 0 0" }}>
            {result.milestones.length === 0 && (
              <li style={{ fontSize: 14, color: "var(--text-muted)" }}>No scans yet.</li>
            )}
            {result.milestones.map((m, i) => (
              <li
                key={i}
                style={{ display: "flex", gap: 12, alignItems: "baseline", padding: "6px 0" }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    background: "var(--orange-500)",
                    flex: "none",
                    transform: "translateY(2px)",
                  }}
                />
                <span style={{ fontWeight: 600, color: "var(--text-strong)" }}>{m.status}</span>
                <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--text-muted)" }}>
                  {new Date(m.occurredAt).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
