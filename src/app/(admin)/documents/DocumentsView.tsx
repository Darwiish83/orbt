"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useT } from "@/i18n/I18nProvider";
import { DataTable, SearchBox, Seg, Stat, type DataColumn } from "@/ui/kit";
import { Button, Dialog, Icon, Input } from "@/ui/primitives";
import { fdate, num } from "@/ui/format";
import type { listAdminDocuments } from "@/modules/documents/admin";
import { FinBox, RowMenu, ToastHost, useToast } from "@/components/admin/ui";
import { deleteDocumentAction, findCustomersAction, uploadDocumentAction } from "./actions";

type Data = Awaited<ReturnType<typeof listAdminDocuments>>;
type Row = Data["items"][number];
type Props = {
  data: Data;
  shipments: { id: string; code: string; mode: string }[];
  scope: { year: number; country: string };
  filters: { from: string; to: string; mode: string; ship: string; q: string };
  perms: { write: boolean; manage: boolean };
};
/** The papers a shipment has (owner 2026-10-25): air = origin + transit AWB; container = one. */
const PARTS: Record<string, [string, string][]> = {
  AIR: [
    ["ORIGIN_AWB", "Origin AWB"],
    ["TRANSIT_AWB", "Transit AWB"],
  ],
  SEA: [["CONTAINER", "Container document"]],
};
const PART_LABEL: Record<string, string> = {
  ORIGIN_AWB: "Origin AWB",
  TRANSIT_AWB: "Transit AWB",
  CONTAINER: "Container document",
};
const KINDS: [string, string][] = [
  ["CARGO_DOC", "Packing list / cargo document"],
  ["INVOICE", "Invoice"],
  ["IDENTITY", "Identity"],
  ["OTHER", "Other"],
];

function Table<R>(p: {
  cols: DataColumn<R>[];
  rows: R[];
  empty?: string;
  rowKey?: (r: R, i: number) => string;
}) {
  const A = DataTable as unknown as (q: typeof p) => ReactNode;
  return <A {...p} />;
}

export function DocumentsView(props: Props) {
  return (
    <ToastHost>
      <Inner {...props} />
    </ToastHost>
  );
}

function Inner({ data, shipments, scope, filters, perms }: Props) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [nav, startNav] = useTransition();
  const [busy, start] = useTransition();
  const [q, setQ] = useState(filters.q);
  const [upload, setUpload] = useState<"customer" | "shipment" | null>(null);
  const go = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "" || v === "ALL") p.delete(k);
      else p.set(k, v);
    }
    startNav(() => router.push(`${pathname}?${p.toString()}`, { scroll: false }));
  };
  const cols: DataColumn<Row>[] = [
    { key: "d", label: "Date", render: (r) => fdate(r.createdAt) },
    {
      key: "r",
      label: "Document reference",
      mono: true,
      strong: true,
      render: (r) => r.reference ?? "—",
    },
    { key: "f", label: "File name", render: (r) => r.filename },
    {
      key: "k",
      label: "Type",
      render: (r) =>
        t(r.part ? PART_LABEL[r.part]! : (KINDS.find((k) => k[0] === r.kind)?.[1] ?? r.kind)),
    },
    { key: "c", label: "Customer", render: (r) => r.customer ?? "—" },
    { key: "s", label: "Shipment", mono: true, render: (r) => r.shipment ?? "—" },
    { key: "z", label: "Size", align: "right", render: (r) => `${num(r.size / 1024, 0)} KB` },
    {
      key: "x",
      label: "",
      align: "right",
      render: (r) => (
        <RowMenu
          items={
            [
              [
                "Download",
                () => window.open(`/api/documents/${r.id}/download`, "_blank", "noopener"),
              ],
              perms.manage && [
                "Delete",
                () =>
                  start(async () => {
                    const res = await deleteDocumentAction(r.id);
                    toast(
                      res.ok
                        ? { tone: "success", title: "Document deleted", message: r.filename }
                        : { tone: "danger", title: res.error },
                    );
                    router.refresh();
                  }),
              ],
            ].filter(Boolean) as [string, () => void][]
          }
        />
      ),
    },
  ];
  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 16, opacity: nav || busy ? 0.7 : 1 }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              font: "700 26px/1.2 var(--font-display)",
              color: "var(--text-strong)",
            }}
          >
            {t("Documents")}
          </h1>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
            {t(scope.country)} · {t("Business year")} {scope.year}
          </div>
        </div>
        {perms.write && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button
              leadingIcon={<Icon name="UserRound" size={16} />}
              onClick={() => setUpload("customer")}
              data-testid="upload-customer"
            >
              {t("Upload Customer")}
            </Button>
            <Button
              variant="secondary"
              leadingIcon={<Icon name="Package" size={16} />}
              onClick={() => setUpload("shipment")}
            >
              {t("Upload Shipment")}
            </Button>
          </div>
        )}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))",
          gap: 12,
        }}
      >
        <Stat icon="FolderOpen" label="Documents" value={String(data.stats.total)} />
        <Stat
          icon="UserRound"
          tone="green"
          label="Customer documents"
          value={String(data.stats.customers)}
        />
        <Stat
          icon="Package"
          tone="orange"
          label="Shipment documents"
          value={String(data.stats.shipments)}
        />
      </div>
      <FinBox pad={0}>
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "flex-end",
            padding: 14,
          }}
        >
          <Seg
            options={[
              ["ALL", "Air & Sea"],
              ["AIR", "Air", "Plane"],
              ["SEA", "Sea", "Ship"],
            ]}
            value={filters.mode}
            onChange={(m) => go({ mode: m, page: null })}
          />
          <select
            aria-label={t("Shipment")}
            value={filters.ship}
            onChange={(e) => go({ ship: e.target.value, page: null })}
            style={{
              height: 40,
              padding: "0 10px",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-s)",
              background: "#fff",
            }}
          >
            <option value="">{t("All shipments")}</option>
            {shipments.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code}
              </option>
            ))}
          </select>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              go({ q, page: null });
            }}
          >
            <SearchBox
              value={q}
              onChange={setQ}
              placeholder="Search documents, customers..."
              style={{ width: 260, maxWidth: "100%" }}
            />
          </form>
        </div>
        <Table rows={data.items} cols={cols} rowKey={(r) => r.id} empty="No records found" />
      </FinBox>
      {upload && (
        <UploadDialog
          target={upload}
          shipments={shipments}
          onClose={() => setUpload(null)}
          onDone={() => {
            setUpload(null);
            toast({ tone: "success", title: "Document uploaded" });
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function UploadDialog({
  target,
  shipments,
  onClose,
  onDone,
}: {
  target: "customer" | "shipment";
  shipments: Props["shipments"];
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [reference, setReference] = useState("");
  const [filename, setFilename] = useState("");
  const [shipmentId, setShipmentId] = useState("");
  const [part, setPart] = useState("");
  const mode = shipments.find((s) => s.id === shipmentId)?.mode;
  const [cq, setCq] = useState("");
  const [customer, setCustomer] = useState<{ id: string; ref: string; name: string } | null>(null);
  const [list, setList] = useState<{ id: string; ref: string; name: string }[]>([]);
  useEffect(() => {
    if (target !== "customer" || customer) return;
    const id = setTimeout(async () => {
      const r = await findCustomersAction(cq);
      if (r.ok) setList(r.data ?? []);
    }, 200);
    return () => clearTimeout(id);
  }, [cq, target, customer]);
  const save = () =>
    start(async () => {
      setError(null);
      if (!file) return setError("Choose a file to upload");
      const fd = new FormData();
      fd.set("target", target);
      if (customer) fd.set("customerId", customer.id);
      if (shipmentId) fd.set("shipmentId", shipmentId);
      fd.set("reference", reference);
      fd.set("filename", filename);
      if (target === "shipment") fd.set("part", part);
      fd.set("file", file);
      const r = await uploadDocumentAction(fd);
      if (!r.ok) return setError(r.error);
      onDone();
    });
  const sel = {
    height: 40,
    padding: "0 10px",
    border: "1px solid var(--border-strong)",
    borderRadius: "var(--radius-s)",
    background: "#fff",
  } as const;
  return (
    <Dialog
      open
      width={560}
      onClose={onClose}
      title={t(target === "customer" ? "Upload Customer" : "Upload Shipment")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t("Cancel")}
          </Button>
          <Button onClick={save} disabled={pending} data-testid="save-document">
            {t("Upload")}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {target === "customer" &&
          (customer ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <b style={{ fontFamily: "var(--font-mono)" }}>{customer.ref}</b> {customer.name}
              <Button size="s" variant="ghost" onClick={() => setCustomer(null)}>
                {t("Change")}
              </Button>
            </div>
          ) : (
            <div>
              <Input
                label={t("Customer")}
                value={cq}
                onChange={(e) => setCq(e.target.value)}
                placeholder={t("Type name or Customer Reference")}
                leadingIcon={<Icon name="Search" size={15} />}
              />
              <div
                style={{
                  maxHeight: 180,
                  overflowY: "auto",
                  border: "1px solid var(--border-default)",
                  borderRadius: 6,
                  marginTop: 4,
                }}
              >
                {list.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCustomer(c)}
                    style={{
                      display: "flex",
                      gap: 10,
                      width: "100%",
                      padding: "8px 10px",
                      border: 0,
                      borderBottom: "1px solid var(--border-default)",
                      background: "#fff",
                      cursor: "pointer",
                      textAlign: "start",
                    }}
                  >
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--navy-700)" }}>
                      {c.ref}
                    </span>
                    {c.name}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                {t("The customer will see this document in their app.")}
              </div>
            </div>
          ))}
        <label
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            font: "600 13px var(--font-body)",
          }}
        >
          {t("Shipment")}
          {target === "customer" ? ` (${t("optional")})` : ""}
          <select
            value={shipmentId}
            onChange={(e) => {
              const id = e.target.value;
              setShipmentId(id);
              // A container has one document: chosen for you.
              setPart(shipments.find((s) => s.id === id)?.mode === "SEA" ? "CONTAINER" : "");
            }}
            style={sel}
            data-testid="upload-shipment-select"
          >
            <option value="">{t("Choose…")}</option>
            {shipments.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {s.mode === "AIR" ? t("Air") : t("Sea")}
              </option>
            ))}
          </select>
        </label>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
            gap: 12,
          }}
        >
          <Input
            label={t("Document reference")}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="PL-W1-001"
          />
          <Input
            label={t("File name")}
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            placeholder={file?.name ?? ""}
          />
        </div>
        {target === "shipment" && mode && (
          <div>
            <div style={{ font: "600 13px var(--font-body)", marginBottom: 6 }}>
              {t("Document")} *
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {PARTS[mode === "AIR" ? "AIR" : "SEA"]!.map(([k, l]) => {
                const on = part === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setPart(k)}
                    data-testid={`part-${k}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      height: 40,
                      padding: "0 16px",
                      borderRadius: 8,
                      cursor: "pointer",
                      border: "1.5px solid " + (on ? "var(--navy-700)" : "var(--border-default)"),
                      background: on ? "var(--navy-700)" : "#fff",
                      color: on ? "#fff" : "var(--text-strong)",
                      font: "600 13px var(--font-body)",
                    }}
                  >
                    <Icon
                      name={
                        k === "CONTAINER"
                          ? "Container"
                          : k === "ORIGIN_AWB"
                            ? "PlaneTakeoff"
                            : "Route"
                      }
                      size={15}
                    />
                    {t(l)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <input
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {t("PDF, PNG, JPEG or WebP, up to 10 MB.")}
        </div>
        {error && (
          <div role="alert" style={{ color: "var(--status-danger)", fontSize: 13 }}>
            {t(error)}
          </div>
        )}
      </div>
    </Dialog>
  );
}
