import Link from "next/link";
import { Button, Icon } from "@/ui/primitives";

/**
 * Brand landing page — replaces the old generic test page. Navy hero band with
 * the signature orange overline + split-colour headline from the design system.
 */
export default function HomePage() {
  return (
    <div>
      <section
        style={{
          background: "var(--navy-700)",
          color: "#fff",
          padding: "80px 32px",
        }}
      >
        <div style={{ maxWidth: "var(--container-max)", margin: "0 auto" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              font: "700 11px var(--font-body)",
              letterSpacing: ".14em",
              textTransform: "uppercase",
              color: "var(--orange-400)",
              marginBottom: 20,
            }}
          >
            <span style={{ width: 24, height: 2, background: "var(--orange-500)" }} />
            Air · Sea · Road
          </div>
          <h1
            style={{
              font: "850 48px/1.05 var(--font-display)",
              letterSpacing: "-0.01em",
              textTransform: "uppercase",
              margin: 0,
              maxWidth: 820,
            }}
          >
            Track your <span style={{ color: "var(--orange-500)" }}>shipment</span>
          </h1>
          <p
            style={{
              font: "400 17px/1.5 var(--font-body)",
              color: "var(--navy-100)",
              maxWidth: 560,
              margin: "16px 0 28px",
            }}
          >
            Freight forwarding and parcel logistics, door to door. Book shipments, get quotes and
            track cargo across air, sea and road.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/dashboard">
              <Button size="l" trailingIcon={<Icon name="ArrowRight" size={16} />}>
                Open admin panel
              </Button>
            </Link>
            <Link href="/track">
              <Button size="l" variant="inverse">
                Track a shipment
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
