/* eslint-disable @next/next/no-img-element -- static brand images */

/**
 * The company's ink stamp (owner 2026-10-25), placed where a paper is signed.
 * A transparent PNG of the ink (made from the owner's photo).
 */
export function Stamp({ size = 96 }: { size?: number }) {
  return (
    <img
      src="/brand/orbit-stamp.png"
      alt="Orbit Cargo and Logistics stamp"
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: "contain", transform: "rotate(-8deg)", opacity: 0.92, flex: "none" }}
    />
  );
}

/** The cashier's signature (transparent PNG); on every receipt, like the stamp. */
export function Signature({ width = 120 }: { width?: number }) {
  return <img src="/brand/orbit-signature.png" alt="Signature" width={width} height={Math.round(width * 0.63)} style={{ width, height: "auto", flex: "none" }} />;
}

/** Where a paper is signed: the stamp, and beside it the signature over the line. */
export function StampAndSign({ label, stamp = 92 }: { label: string; stamp?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "flex-end", gap: 10 }}>
      <Stamp size={stamp} />
      <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", minWidth: 130 }}>
        <span style={{ height: Math.round(stamp * 0.62), display: "flex", alignItems: "flex-end" }}>
          <Signature width={Math.round(stamp * 1.25)} />
        </span>
        <span style={{ alignSelf: "stretch", borderTop: "1px solid var(--text-muted)", marginTop: 2, paddingTop: 3, fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>{label}</span>
      </span>
    </span>
  );
}
