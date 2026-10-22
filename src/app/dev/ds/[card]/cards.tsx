"use client";

/**
 * Mirrors of the design system's component specimen cards
 * (design-reference/orbit-cargo-design-system/components/**\/*.card.html),
 * rebuilt with the ported TSX components. The design-parity Playwright suite
 * screenshots each design card and the matching mirror at the same viewport
 * and diffs them. Keep the markup identical to the card's `Demo()`.
 */
import { useState, type ReactNode } from "react";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Dialog,
  Icon,
  IconButton,
  Input,
  Radio,
  Select,
  ShipmentRow,
  Switch,
  Tabs,
  Tag,
  Toast,
  Tooltip,
  TrackingTimeline,
  type IconName,
  type ShipmentRowStatus,
} from "@/ui/primitives";

const r = { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" } as const;
const c = { display: "flex", flexDirection: "column", gap: 16 } as const;

function CoreCard() {
  const [m, setM] = useState("air");
  const modes: [string, string, IconName][] = [
    ["air", "Air", "Plane"],
    ["sea", "Sea", "Ship"],
    ["road", "Road", "Truck"],
  ];
  return (
    <div style={c}>
      <div style={r}>
        <Button>Get a quote</Button>
        <Button variant="secondary">Track</Button>
        <Button variant="outline">Details</Button>
        <Button variant="ghost">Cancel</Button>
        <Button disabled>Disabled</Button>
      </div>
      <div style={r}>
        <Button size="s">Small</Button>
        <Button size="m" leadingIcon={<Icon name="Package" size={16} />}>
          Medium
        </Button>
        <Button size="l" trailingIcon={<Icon name="ArrowRight" size={16} />}>
          Large
        </Button>
        <IconButton label="Search" icon={<Icon name="Search" />} variant="outline" />
        <IconButton label="Notifications" icon={<Icon name="Bell" />} />
        <IconButton label="Add" icon={<Icon name="Plus" />} variant="primary" />
      </div>
      <div style={r}>
        <Badge tone="info" dot>
          In transit
        </Badge>
        <Badge tone="success" dot>
          Delivered
        </Badge>
        <Badge tone="warning" dot>
          Delayed
        </Badge>
        <Badge tone="danger" dot>
          Exception
        </Badge>
        <Badge tone="brand">Express</Badge>
        <Badge tone="accent">New</Badge>
      </div>
      <div style={r}>
        {modes.map(([v, l, i]) => (
          <Tag key={v} selected={m === v} onClick={() => setM(v)} icon={<Icon name={i} size={14} />}>
            {l}
          </Tag>
        ))}
        <Tag onRemove={() => {}}>Lagos, NG</Tag>
      </div>
    </div>
  );
}

function CardCard() {
  return (
    <div style={{ ...r, alignItems: "stretch" }}>
      <Card
        eyebrow="Shipment"
        title="ORB-2048-7731"
        actions={
          <Badge tone="info" dot>
            In transit
          </Badge>
        }
        style={{ flex: 1 }}
      >
        <div style={{ fontSize: 14, color: "var(--text-muted)" }}>Lagos → London Heathrow · ETA Oct 9</div>
      </Card>
      <Card interactive title="Request pickup" style={{ flex: 1 }}>
        <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 12 }}>Schedule a driver to your door.</div>
        <Button size="s" variant="secondary">
          Schedule
        </Button>
      </Card>
    </div>
  );
}

function FeedbackCard() {
  return (
    <div style={{ display: "flex", gap: 20 }}>
      <div style={{ ...c, width: 300 }}>
        <Toast tone="success" title="Pickup scheduled" message="Driver arrives tomorrow 09:00–12:00" onClose={() => {}} />
        <Toast tone="warning" title="Customs hold" message="Commercial invoice required" />
        <div style={{ paddingTop: 40 }}>
          <Tooltip content="Chargeable weight: 14.2 kg">
            <span style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 14, color: "var(--text-muted)" }}>
              Hover me <Icon name="Info" size={14} />
            </span>
          </Tooltip>
        </div>
      </div>
      <div
        style={{
          flex: 1,
          position: "relative",
          height: 290,
          borderRadius: 8,
          overflow: "hidden",
          transform: "translateZ(0)",
        }}
      >
        <Dialog
          open
          width={340}
          title="Cancel shipment?"
          onClose={() => {}}
          footer={
            <>
              <Button variant="ghost" size="s">
                Keep
              </Button>
              <Button size="s">Cancel shipment</Button>
            </>
          }
        >
          <div style={{ fontSize: 14 }}>ORB-2048-7731 hasn&apos;t been picked up yet. You won&apos;t be charged.</div>
        </Dialog>
      </div>
    </div>
  );
}

function FormsCard() {
  const [ch, setCh] = useState(true);
  const [rd, setRd] = useState("express");
  const [s, setS] = useState(true);
  return (
    <div style={c}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <Input
          label="Tracking number"
          placeholder="ORB-0000-0000"
          leadingIcon={<Icon name="Search" size={16} />}
          hint="Found on your receipt"
        />
        <Select label="Service" options={["Express Air", "Standard Sea", "Road Freight"]} />
        <Input label="Weight (kg)" defaultValue="-2" error="Enter a positive weight" />
      </div>
      <div style={{ ...r, gap: 28, alignItems: "flex-start" }}>
        <Checkbox checked={ch} onChange={setCh} label="Cargo insurance" description="Covers up to $5,000" />
        <Checkbox label="Signature required" />
        <Radio name="sp" value="express" checked={rd === "express"} onChange={setRd} label="Express" description="1–2 days" />
        <Radio name="sp" value="standard" checked={rd === "standard"} onChange={setRd} label="Standard" description="4–6 days" />
        <Switch checked={s} onChange={setS} label="SMS updates" />
      </div>
    </div>
  );
}

function LogisticsCard() {
  const [sel, setSel] = useState(0);
  const rows: [string, string, string, string, string, ShipmentRowStatus][] = [
    ["ORB-2048-7731", "Lagos", "London LHR", "Air", "Oct 9", "transit"],
    ["ORB-2048-6102", "Accra", "Rotterdam", "Sea", "Oct 21", "delayed"],
    ["ORB-2047-9915", "Abuja", "Kano", "Road", "Oct 3", "delivered"],
  ];
  return (
    <div style={c}>
      <div style={{ border: "1px solid var(--border-default)", borderRadius: 10, overflow: "hidden" }}>
        {rows.map((x, i) => (
          <ShipmentRow
            key={i}
            id={x[0]}
            origin={x[1]}
            destination={x[2]}
            mode={x[3]}
            eta={x[4]}
            status={x[5]}
            selected={sel === i}
            onClick={() => setSel(i)}
          />
        ))}
      </div>
      <TrackingTimeline
        events={[
          { title: "Picked up", location: "Lagos, NG", time: "Mon 09:12", state: "done" },
          { title: "Departed hub", location: "Lagos LOS", time: "Mon 22:40", state: "done" },
          { title: "In transit to London", location: "Flight OB 312", time: "Tue 06:05", state: "current" },
          { title: "Out for delivery", state: "upcoming" },
        ]}
      />
    </div>
  );
}

function TabsCard() {
  const [t, setT] = useState("active");
  return (
    <Tabs
      value={t}
      onChange={setT}
      tabs={[
        { value: "active", label: "Active", count: 12 },
        { value: "booked", label: "Booked", count: 3 },
        { value: "delivered", label: "Delivered" },
        { value: "exceptions", label: "Exceptions", count: 1 },
      ]}
    />
  );
}

/** Card id → [design card path relative to design-reference root, viewport, mirror]. */
export const CARDS: Record<string, { design: string; viewport: [number, number]; render: () => ReactNode }> = {
  core: { design: "components/core/core.card.html", viewport: [700, 300], render: () => <CoreCard /> },
  card: { design: "components/core/card.card.html", viewport: [700, 220], render: () => <CardCard /> },
  feedback: { design: "components/feedback/feedback.card.html", viewport: [700, 330], render: () => <FeedbackCard /> },
  forms: { design: "components/forms/forms.card.html", viewport: [700, 320], render: () => <FormsCard /> },
  logistics: { design: "components/logistics/logistics.card.html", viewport: [700, 380], render: () => <LogisticsCard /> },
  tabs: { design: "components/navigation/tabs.card.html", viewport: [700, 110], render: () => <TabsCard /> },
};

export function CardMirror({ id }: { id: string }) {
  const card = CARDS[id];
  return (
    <div data-ds-mirror={id} style={{ background: "#fff", padding: 20, minHeight: "100vh", boxSizing: "border-box" }}>
      {card ? card.render() : null}
    </div>
  );
}
