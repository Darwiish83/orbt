import { DeveloperCredit } from "@/components/DeveloperCredit";
import { HeroCopy } from "./HeroCopy";

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
          <HeroCopy />
        </div>
      </section>
      <footer style={{ padding: "20px 32px 24px", borderTop: "1px solid var(--border-default)" }}>
        <DeveloperCredit />
      </footer>
    </div>
  );
}
