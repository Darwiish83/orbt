"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { useT } from "@/i18n/I18nProvider";
import { DataTable, INVOICE_STATUS_LABEL, KV, SearchBox, Stat, StatusBadge, SHIPMENT_STATUS_LABEL, type DataColumn } from "@/ui/kit";
import { Badge, Button, Dialog, Icon, Input, Tabs } from "@/ui/primitives";
import { fdate, money, num } from "@/ui/format";
import { localPhoneDigits, PHONE_REQUIRED } from "@/modules/customers/phone";
import type { AdminCustomerRow, listAdminCustomers, getCustomerDetails } from "@/modules/customers/admin";
import { Drawer, FinBox, RowMenu, ToastHost, useToast } from "@/components/admin/ui";
import { createCustomerAction, customerDetailsAction, deleteCustomerAction, setCustomerStatusAction, updateCustomerAction, type CustomerFormValues } from "./actions";

type Data = Awaited<ReturnType<typeof listAdminCustomers>>;
type Details = Awaited<ReturnType<typeof getCustomerDetails>>;
type Props = { data: Data; year: number; filters: { tab: string; q: string }; perms: { write: boolean; manage: boolean } };

const LEVEL: Record<string, [string, string, string]> = {
  A: ["A PRO", "#FEF3C7", "#92400E"],
  B: ["B VIP", "#EDE9FE", "#5B21B6"],
  C: ["C STANDARD", "#DBEAFE", "#1E40AF"],
  D: ["D BASIC", "#F1F5F9", "#475569"],
};
const STATUS: Record<string, string> = { ACTIVE: "Active", INACTIVE: "Inactive", SUSPENDED: "Suspended" };

function Table<R>(p: { cols: DataColumn<R>[]; rows: R[]; empty?: string; dense?: boolean; onRow?: (r: R) => void; rowKey?: (r: R, i: number) => string }) {
  const A = DataTable as unknown as (q: typeof p) => ReactNode;
  return <A {...p} />;
}

function LevelPill({ level }: { level: string }) {
  const [label, bg, fg] = LEVEL[level] ?? LEVEL.D!;
  return <span style={{ alignSelf: "flex-start", padding: "2px 8px", borderRadius: 10, background: bg, color: fg, font: "700 11px var(--font-body)", whiteSpace: "nowrap" }}>{label}</span>;
}

export function CustomersView(props: Props) {
  return (
    <ToastHost>
      <Inner {...props} />
    </ToastHost>
  );
}

function Inner({ data, year, filters, perms }: Props) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [nav, startNav] = useTransition();
  const [busy, start] = useTransition();
  const [q, setQ] = useState(filters.q);
  const [form, setForm] = useState<AdminCustomerRow | "new" | null>(null);
  const [del, setDel] = useState<AdminCustomerRow | null>(null);
  const [view, setView] = useState<Details | null>(null);
  const go = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") p.delete(k);
      else p.set(k, v);
    }
    startNav(() => router.push(`${pathname}?${p.toString()}`, { scroll: false }));
  };
  const open = (r: AdminCustomerRow) =>
    start(async () => {
      const res = await customerDetailsAction(r.id);
      if (!res.ok) toast({ tone: "danger", title: res.error });
      else setView(res.data!);
    });
  const act = (p: Promise<{ ok: boolean; error?: string }>, ok: string, msg?: string) =>
    start(async () => {
      const r = await p;
      if (!r.ok) toast({ tone: "danger", title: r.error ?? "Error" });
      else toast({ tone: "success", title: ok, message: msg });
      router.refresh();
    });

  const cols: DataColumn<AdminCustomerRow>[] = [
    { key: "ref", label: "Customer Reference", mono: true, strong: true, render: (r) => r.ref },
    {
      key: "n",
      label: "Name",
      strong: true,
      render: (r) => (
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          {r.name}
          {Date.now() - new Date(r.createdAt).getTime() < 7 * 86_400_000 && <Badge tone="accent">{t("New")}</Badge>}
        </span>
      ),
    },
    { key: "p", label: "Phone", render: (r) => r.phone ?? "—" },
    { key: "c", label: "Company", render: (r) => r.company ?? "—" },
    { key: "e", label: "Email", render: (r) => r.email ?? "—" },
    { key: "l", label: "Location", render: (r) => r.location ?? "—" },
    { key: "b", label: "What do you buy?", render: (r) => r.cargoCategory ?? "—" },
    {
      key: "lv",
      label: "Level",
      render: (r) => (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <LevelPill level={r.level} />
          <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
            {[Number(r.airKg) ? `${num(r.airKg, 1)} kg` : "", Number(r.seaCbm) ? `${num(r.seaCbm, 2)} m³` : ""].filter(Boolean).join(" · ") || "—"}
          </span>
        </div>
      ),
    },
    { key: "sv", label: "Service", render: (r) => t(r.service) },
    { key: "st", label: "Status", render: (r) => <StatusBadge status={STATUS[r.status] ?? r.status} /> },
    {
      key: "x",
      label: "",
      align: "right",
      render: (r) =>
        perms.write ? (
          <RowMenu
            items={
              [
                ["Customer details", () => open(r)],
                ["Edit Customer", () => setForm(r)],
                r.status === "ACTIVE"
                  ? ["Set Inactive", () => act(setCustomerStatusAction(r.id, "INACTIVE"), "Customer saved", r.name)]
                  : ["Set Active", () => act(setCustomerStatusAction(r.id, "ACTIVE"), "Customer saved", r.name)],
                perms.manage && ["Delete Customer", () => setDel(r)],
              ].filter(Boolean) as [string, () => void][]
            }
          />
        ) : null,
    },
  ];
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, opacity: nav ? 0.7 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, font: "700 26px/1.2 var(--font-display)", color: "var(--text-strong)" }}>{t("Customers")}</h1>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
            {t("Customer summary")} · {t("Level")} {year}
          </div>
        </div>
        {perms.write && (
          <Button leadingIcon={<Icon name="UserPlus" size={16} />} onClick={() => setForm("new")} data-testid="add-customer">
            {t("Add Customer")}
          </Button>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
        <Stat icon="ContactRound" label="Total Customers" value={String(data.stats.total)} />
        <Stat icon="UserCheck" tone="green" label="Active Customers" value={String(data.stats.active)} />
        <Stat icon="UserX" tone="red" label="Inactive Customers" value={String(data.stats.inactive)} />
        <Stat icon="Crown" tone="orange" label="A PRO / B VIP" value={String(data.stats.top)} />
      </div>
      <FinBox pad={0}>
        <div style={{ padding: "0 16px" }}>
          <Tabs
            value={filters.tab}
            onChange={(v) => go({ tab: v === "all" ? null : v, page: null })}
            tabs={[
              { value: "all", label: t("All"), count: data.stats.total },
              { value: "active", label: t("Active Customers"), count: data.stats.active },
              { value: "inactive", label: t("Inactive Customers"), count: data.stats.inactive },
            ]}
          />
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            go({ q, page: null });
          }}
          style={{ padding: "0 16px" }}
        >
          <SearchBox value={q} onChange={setQ} placeholder="Search customers" style={{ width: 320, maxWidth: "100%" }} />
        </form>
        <Table rows={data.rows} cols={cols} onRow={open} rowKey={(r) => r.id} empty="No records found" />
        {pages > 1 && (
          <div style={{ display: "flex", gap: 8, justifyContent: "center", padding: "0 0 14px" }}>
            <Button size="s" variant="outline" disabled={data.page <= 1} onClick={() => go({ page: String(data.page - 1) })}>
              {t("Prev")}
            </Button>
            <span style={{ alignSelf: "center", fontSize: 13 }}>
              {data.page} / {pages}
            </span>
            <Button size="s" variant="outline" disabled={data.page >= pages} onClick={() => go({ page: String(data.page + 1) })}>
              {t("Next")}
            </Button>
          </div>
        )}
      </FinBox>

      {form && (
        <CustomerForm
          c={form === "new" ? null : form}
          onClose={() => setForm(null)}
          onSaved={(ref) => {
            setForm(null);
            toast({ tone: "success", title: "Customer saved", message: ref });
            router.refresh();
          }}
        />
      )}
      {del && (
        <Dialog
          open
          title={t("Delete Customer")}
          onClose={() => setDel(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDel(null)}>
                {t("Cancel")}
              </Button>
              <Button
                disabled={busy}
                style={{ background: "var(--red-600)", borderColor: "var(--red-600)" }}
                onClick={() => {
                  act(deleteCustomerAction(del.id), "Customer deleted", del.name);
                  setDel(null);
                }}
              >
                {t("Delete")}
              </Button>
            </>
          }
        >
          <div style={{ fontSize: 14 }}>
            {t("Are you sure you want to delete")} <b>{del.ref}</b> — {del.name}?
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>{t("A customer with shipments, invoices or payments cannot be deleted; set them to Inactive instead.")}</div>
          </div>
        </Dialog>
      )}
      <Drawer open={!!view} onClose={() => setView(null)} title="Customer details">
        {view && <CustomerDetails d={view} onEdit={perms.write ? () => { setForm(data.rows.find((r) => r.id === view.customer.id) ?? null); setView(null); } : undefined} />}
      </Drawer>
    </div>
  );
}

function CustomerDetails({ d, onEdit }: { d: Details; onEdit?: () => void }) {
  const t = useT();
  const c = d.customer;
  const [label] = LEVEL[d.level] ?? LEVEL.D!;
  const H = ({ children }: { children: ReactNode }) => <div style={{ font: "700 14px var(--font-display)", color: "var(--text-strong)", margin: "18px 0 8px" }}>{children}</div>;
  const row = (k: ReactNode, v: ReactNode, key: string) => (
    <div key={key} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border-default)", fontSize: 13 }}>
      <span>{k}</span>
      <span style={{ textAlign: "end" }}>{v}</span>
    </div>
  );
  return (
    <>
      <div style={{ background: "var(--navy-700)", color: "#fff", borderRadius: "var(--radius-l)", padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ font: "600 15px var(--font-mono)" }}>{c.ref}</span>
          <span style={{ background: "var(--orange-500)", padding: "3px 8px", borderRadius: 2, font: "800 11px var(--font-body)", letterSpacing: ".06em" }}>{label}</span>
        </div>
        <div style={{ font: "700 18px var(--font-display)", marginTop: 8 }}>{c.name}</div>
        <div style={{ fontSize: 13, color: "var(--navy-300)" }}>{c.company}</div>
      </div>
      <KV label="Phone" value={c.phone ?? "—"} />
      <KV label="Email" value={c.email ?? "—"} />
      <KV label="Location" value={c.location ?? "—"} />
      <KV label="What do you buy?" value={c.cargoCategory ?? "—"} />
      <KV label="Member since" value={fdate(c.createdAt)} />
      <KV label="Status" value={<StatusBadge status={STATUS[c.status] ?? c.status} />} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginTop: 16 }}>
        <Stat compact label="Shipments" value={String(d.shipments.length)} />
        <Stat compact label="Invoiced" value={money(d.totals.invoiced, 0)} />
        <Stat compact tone="red" label="Balance" value={money(d.totals.balance, 0)} />
      </div>
      <H>{t("Shipments")}</H>
      {d.shipments.length ? d.shipments.map((s) => row(<Link href={`/shipments/${s.id}`} style={{ fontFamily: "var(--font-mono)", color: "var(--navy-700)" }}>{s.code} · {t(s.country)} · {s.year}</Link>, <StatusBadge status={SHIPMENT_STATUS_LABEL[s.status as keyof typeof SHIPMENT_STATUS_LABEL]} />, s.id)) : <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{t("No records found")}</div>}
      <H>{t("Invoices")}</H>
      {d.invoices.length ? d.invoices.map((i) => row(<span style={{ fontFamily: "var(--font-mono)" }}>{i.number} · {i.shipmentCode}</span>, <span>{money(i.total)} · <StatusBadge status={INVOICE_STATUS_LABEL[i.status]} /></span>, i.id)) : <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{t("No records found")}</div>}
      <H>{t("Payments")} / {t("Receipts")}</H>
      {d.payments.length ? d.payments.map((p) => row(<span>{fdate(p.date)} · {p.bank ? t(p.bank) : "-"}</span>, <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>{money(p.amount)} <a href={`/print/receipt/${p.id}`} target="_blank" rel="noopener" style={{ fontFamily: "var(--font-mono)", color: "var(--navy-700)" }}>{p.receiptNo}</a></span>, p.id)) : <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{t("No records found")}</div>}
      {onEdit && (
        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <Button variant="secondary" onClick={onEdit}>
            {t("Edit Customer")}
          </Button>
        </div>
      )}
    </>
  );
}

function CustomerForm({ c, onClose, onSaved }: { c: AdminCustomerRow | null; onClose: () => void; onSaved: (ref: string) => void }) {
  const t = useT();
  const [v, setV] = useState<Required<CustomerFormValues>>({
    name: c?.name ?? "",
    company: c?.company ?? "",
    // Local part only; "+252" is shown as the field's fixed prefix.
    phone: c?.phone ? c.phone.replace(/^\+?252\s*/, "") : "",
    email: c?.email ?? "",
    location: c?.location ?? "Mogadishu",
    cargoCategory: c?.cargoCategory ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof CustomerFormValues) => (e: React.ChangeEvent<HTMLInputElement>) => setV((o) => ({ ...o, [k]: e.target.value }));
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const save = () => {
    // Mandatory 9-digit number: stop here and say so (the server re-checks).
    if (!localPhoneDigits(v.phone)) return setPhoneError(t(PHONE_REQUIRED));
    setPhoneError(null);
    start(async () => {
      setError(null);
      const r = c ? await updateCustomerAction(c.id, v) : await createCustomerAction(v);
      if (!r.ok) return setError(r.error);
      onSaved(c?.ref ?? (r.data as { ref: string }).ref);
    });
  };
  return (
    <Dialog
      open
      width={640}
      onClose={onClose}
      title={t(c ? "Edit Customer" : "Add Customer")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t("Cancel")}
          </Button>
          <Button onClick={save} disabled={pending || !v.name.trim() || !v.company.trim()} data-testid="save-customer">
            {t("Save")}
          </Button>
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
        <Input label={t("Customer Reference")} value={c?.ref ?? t("Automatic (OR-…)")} readOnly inputStyle={{ fontFamily: "var(--font-mono)", background: "var(--surface-sunken)" }} />
        <Input label={t("Name")} value={v.name} onChange={set("name")} required />
        <Input
          label={`${t("Phone")} *`}
          value={v.phone}
          onChange={(e) => {
            setPhoneError(null);
            setV((o) => ({ ...o, phone: ((v: string) => v.replace(/[^\d ]/g, "").slice(0, 13))(e.target.value) }));
          }}
          inputMode="tel"
          placeholder="61 555 0100"
          leadingIcon={<span style={{ font: "600 14px var(--font-body)", color: "var(--text-strong)" }}>+252</span>}
          hint={t("9 digits after +252")}
          error={phoneError ?? undefined}
          required
        />
        <Input label={t("Company")} value={v.company} onChange={set("company")} required />
        <Input label={t("Email")} type="email" value={v.email} onChange={set("email")} />
        <Input label={t("Location")} value={v.location} onChange={set("location")} />
        <Input label={t("What do you buy?")} value={v.cargoCategory} onChange={set("cargoCategory")} />
      </div>
      {error && (
        <div role="alert" style={{ marginTop: 12, color: "var(--status-danger)", fontSize: 13 }}>
          {t(error)}
        </div>
      )}
    </Dialog>
  );
}
