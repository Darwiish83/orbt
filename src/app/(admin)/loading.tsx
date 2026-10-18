export default function Loading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }} aria-busy="true" aria-label="Loading">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            height: 64,
            background: "var(--surface-card)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-l)",
            boxShadow: "var(--shadow-1)",
            opacity: 0.6,
          }}
        />
      ))}
    </div>
  );
}
