import { notFound } from "next/navigation";
import { CardMirror } from "./cards";

/**
 * Design-parity mirror pages (development/test only). Never served in
 * production builds: they exist so tests/e2e/design-parity.spec.ts can diff the
 * ported components against the design system's own specimen cards.
 */
export const metadata = { title: "Design parity", robots: { index: false } };

const IDS = ["core", "card", "feedback", "forms", "logistics", "tabs"];

export default async function DesignParityPage({ params }: { params: Promise<{ card: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { card } = await params;
  if (!IDS.includes(card)) notFound();
  return <CardMirror id={card} />;
}
