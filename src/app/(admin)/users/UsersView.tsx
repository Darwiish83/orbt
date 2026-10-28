"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { useT } from "@/i18n/I18nProvider";
import { DataTable, DateField, Flag, KV, SearchBox, Seg, Stat, StatusBadge, type DataColumn } from "@/ui/kit";
import { Badge, Button, Checkbox, Dialog, Icon, Input, Switch, Tabs, Tag } from "@/ui/primitives";
import { fdate } from "@/ui/format";
import type { EmployeeDetail, EmployeeRow, listActivity, listEmployees, roleMatrix } from "@/modules/users/admin";
import { Drawer, FinBox, RowMenu, ToastHost, useToast } from "@/components/admin/ui";
import { loadEmployeeAction, resetPinAction, saveEmployeeAction, setEmployeeActiveAction, setRoleModuleAction, type EmployeeFormValues } from "./actions";

type Team = Awaited<ReturnType<typeof listEmployees>>;
type Matrix = Awaited<ReturnType<typeof roleMatrix>>;
type Activity = Awaited<ReturnType<typeof listActivity>>;
type Level = "NONE" | "VIEW" | "EDIT";
interface Props {
  tab: "team" | "roles" | "activity";
  filters: { q: string; dept: string; aq: string; entity: string; day: string };
  team: Team;
  matrix: Matrix;
  modules: { key: string; label: string }[];
  roles: { key: string; name: string }[];
  countries: string[];
  /** Suggested Employee ID for Add Employee (the admin may type another). */
  nextCode: string;
  activity: Activity | null;
  me: string;
  perms: { manage: boolean; superAdmin: boolean; audit: boolean };
}

const DEPTS: [string, string][] = [
  ["MANAGEMENT", "Management"],
  ["OPERATIONS", "Operations"],
  ["FINANCE", "Finance"],
  ["CUSTOMER_SERVICE", "Customer Service"],
  ["DOCUMENTS", "Documents"],
  ["REPORTS", "Reports"],
];
const deptLabel = (d: string) => DEPTS.find((x) => x[0] === d)?.[1] ?? d;
const STATUS: Record<string, string> = { ACTIVE: "Active", INVITED: "Pending", SUSPENDED: "Inactive" };
const LEVELS: [Level, string, "EyeOff" | "Eye" | "Pencil", string][] = [
  ["NONE", "No access", "EyeOff", "#B91C1C"],
  ["VIEW", "View only", "Eye", "#B45309"],
  ["EDIT", "Full", "Pencil", "#15803D"],
];

function Table<R>(p: { cols: DataColumn<R>[]; rows: R[]; empty?: string; dense?: boolean; onRow?: (r: R) => void; rowKey?: (r: R, i: number) => string }) {
  const A = DataTable as unknown as (q: typeof p) => ReactNode;
  return <A {...p} />;
}

export function UsersView(props: Props) {
  return (
    <ToastHost>
      <Inner {...props} />
    </ToastHost>
  );
}

function Inner({ tab, filters, team, matrix, modules, roles, countries, nextCode, activity, me, perms }: Props) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [nav, startNav] = useTransition();
  const [busy, start] = useTransition();
  const [q, setQ] = useState(filters.q);
  const [form, setForm] = useState<EmployeeDetail | "new" | null>(null);
  const [view, setView] = useState<EmployeeDetail | null>(null);
  const go = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "" || v === "ALL") p.delete(k);
      else p.set(k, v);
    }
    startNav(() => router.push(`${pathname}?${p.toString()}`, { scroll: false }));
  };
  const load = (r: EmployeeRow, then: (d: EmployeeDetail) => void) =>
    start(async () => {
      const res = await loadEmployeeAction(r.userId);
      if (!res.ok) toast({ tone: "danger", title: res.error });
      else then(res.data!);
    });
  const act = (p: Promise<{ ok: boolean; error?: string }>, ok: string, msg?: string) =>
    start(async () => {
      const r = await p;
      if (!r.ok) toast({ tone: "danger", title: r.error ?? "Error" });
      else toast({ tone: "success", title: ok, message: msg });
      router.refresh();
    });

  const cols: DataColumn<EmployeeRow>[] = [
    { key: "c", label: "Employee ID", mono: true, strong: true, render: (r) => r.code },
    { key: "n", label: "Name", strong: true, render: (r) => r.name },
    { key: "p", label: "Phone", render: (r) => r.phone ?? "—" },
    { key: "e", label: "Email", render: (r) => r.email },
    { key: "d", label: "Department", render: (r) => t(deptLabel(r.department)) },
    {
      key: "r",
      label: "Roles",
      render: (r) => (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {r.roles.map((x) => (
            <Badge key={x.key} tone="brand">
              {t(x.name)}
            </Badge>
          ))}
          {r.pricing && (
            <span data-testid="pricing-badge">
              <Badge tone="success">{t("Shipment pricing")}</Badge>
            </span>
          )}
          {r.accountingAccess && <Badge tone="info">{t("Accounting")}</Badge>}
          {r.transferRole !== "NONE" && (
            <Badge tone="warning">
              {t("Transfer")} · {t(r.transferRole === "SEND" ? "Sender" : "Receiver")}
            </Badge>
          )}
        </div>
      ),
    },
    { key: "l", label: "Last Login", render: (r) => (r.lastLoginAt ? `${fdate(r.lastLoginAt)} ${r.lastLoginAt.slice(11, 16)}` : "—") },
    { key: "s", label: "Status", render: (r) => <StatusBadge status={STATUS[r.status] ?? r.status} /> },
    {
      key: "x",
      label: "",
      align: "right",
      render: (r) =>
        perms.manage && r.userId !== me ? (
          <RowMenu
            items={
              [
                ["Employee details", () => load(r, setView)],
                ["Edit Employee", () => load(r, setForm)],
                r.status === "SUSPENDED"
                  ? ["Set Active", () => act(setEmployeeActiveAction(r.userId, true), "Employee saved", r.name)]
                  : ["Set Inactive", () => act(setEmployeeActiveAction(r.userId, false), "Employee saved", r.name)],
                perms.superAdmin && r.accountingAccess && ["Reset Accounting PIN", () => act(resetPinAction(r.userId), "PIN reset", r.name)],
              ].filter(Boolean) as [string, () => void][]
            }
          />
        ) : null,
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, opacity: nav || busy ? 0.7 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, font: "700 26px/1.2 var(--font-display)", color: "var(--text-strong)" }}>{t("Users & Team")}</h1>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>{t("Management")}</div>
        </div>
        {perms.manage && (
          <Button leadingIcon={<Icon name="UserPlus" size={16} />} onClick={() => setForm("new")} data-testid="add-employee">
            {t("Add Employee")}
          </Button>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
        <Stat icon="UsersRound" label="Employees" value={String(team.stats.total)} />
        <Stat icon="UserCheck" tone="green" label="Active" value={String(team.stats.active)} />
        <Stat icon="UserX" tone="red" label="Inactive" value={String(team.stats.inactive)} />
        <Stat icon="Shield" tone="orange" label="Roles" value={String(matrix.length)} />
      </div>
      <Tabs
        value={tab}
        onChange={(v) => go({ tab: v === "team" ? null : v })}
        tabs={[
          { value: "team", label: t("Employees"), count: team.stats.total },
          { value: "roles", label: t("Roles & Permissions") },
          ...(perms.audit ? [{ value: "activity", label: t("Activity Log") }] : []),
        ]}
      />
      {tab === "team" && (
        <FinBox pad={0}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: 14 }}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                go({ q });
              }}
            >
              <SearchBox value={q} onChange={setQ} placeholder="Search employees" style={{ width: 320, maxWidth: "100%" }} />
            </form>
            <select aria-label={t("Department")} value={filters.dept} onChange={(e) => go({ dept: e.target.value })} style={{ height: 40, padding: "0 10px", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-s)", background: "#fff" }}>
              <option value="ALL">{t("All departments")}</option>
              {DEPTS.map(([k, l]) => (
                <option key={k} value={k}>
                  {t(l)}
                </option>
              ))}
            </select>
          </div>
          <Table rows={team.rows} cols={cols} rowKey={(r) => r.userId} onRow={(r) => load(r, setView)} empty="No records found" />
        </FinBox>
      )}
      {tab === "roles" && <RolesMatrix matrix={matrix} modules={modules} canEdit={perms.superAdmin} />}
      {tab === "activity" && activity && <ActivityLog activity={activity} filters={filters} go={go} />}

      {form && (
        <EmployeeForm
          emp={form === "new" ? null : form}
          roles={roles}
          modules={modules}
          countries={countries}
          nextCode={nextCode}
          onClose={() => setForm(null)}
          onSaved={(name) => {
            setForm(null);
            toast({ tone: "success", title: "Employee saved", message: name });
            router.refresh();
          }}
        />
      )}
      <Drawer open={!!view} onClose={() => setView(null)} title="Employee details">
        {view && (
          <>
            <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 18 }}>
              <span style={{ width: 52, height: 52, borderRadius: 26, background: "var(--navy-700)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", font: "800 18px var(--font-display)" }}>
                {view.name
                  .split(" ")
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <div>
                <div style={{ font: "700 17px var(--font-display)", color: "var(--text-strong)" }}>{view.name}</div>
                <StatusBadge status={STATUS[view.status] ?? view.status} />
              </div>
            </div>
            <KV label="Employee ID" value={view.code} mono />
            <KV label="Phone" value={view.phone ?? "—"} />
            <KV label="Email" value={view.email} />
            <KV label="Department" value={t(deptLabel(view.department))} />
            <KV label="Roles" value={view.roles.map((r) => t(r.name)).join(", ") || "—"} />
            <KV label="Shipment work" value={t(view.pricing ? "Pricing (Rate)" : "Data entry")} />
            <KV label="Responsible countries" value={view.countries.length ? view.countries.map((c) => t(c)).join(", ") : t("All countries")} />
            <KV label="Last Login" value={view.lastLoginAt ? fdate(view.lastLoginAt) : "—"} />
            <KV label="Access period" value={view.accessFrom || view.accessUntil ? `${fdate(view.accessFrom)} → ${fdate(view.accessUntil)}` : t("Always")} />
            <div style={{ font: "600 13px var(--font-body)", margin: "18px 0 8px", color: "var(--text-strong)" }}>{t("Access Control")}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {modules.map((m) => {
                const o = view.access[m.key];
                return <Tag key={m.key}>{`${t(m.label)}: ${o ? t(LEVELS.find((l) => l[0] === o)![1]) : t("Role default")}`}</Tag>;
              })}
              {view.accountingAccess && <Tag>{t("Accounting")}</Tag>}
              {view.transferRole !== "NONE" && <Tag>{`${t("Money Transfer")}: ${t(view.transferRole === "SEND" ? "Sender" : "Receiver")} · ${view.transferCountries.map((c) => t(c)).join(", ")}`}</Tag>}
            </div>
            {perms.manage && view.userId !== me && (
              <div style={{ display: "flex", gap: 8, marginTop: 22 }}>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setForm(view);
                    setView(null);
                  }}
                >
                  {t("Edit Employee")}
                </Button>
              </div>
            )}
          </>
        )}
      </Drawer>
    </div>
  );
}

function LevelPicker({ value, onChange, allowDefault, disabled }: { value: Level | null; onChange: (v: Level | null) => void; allowDefault?: boolean; disabled?: boolean }) {
  const t = useT();
  return (
    <span style={{ display: "inline-flex", border: "1px solid var(--border-default)", borderRadius: 6, overflow: "hidden", flexWrap: "wrap" }}>
      {allowDefault && (
        <button type="button" disabled={disabled} onClick={() => onChange(null)} style={{ height: 28, padding: "0 9px", border: 0, borderInlineEnd: "1px solid var(--border-default)", cursor: "pointer", background: value === null ? "var(--navy-700)" : "#fff", color: value === null ? "#fff" : "var(--text-muted)", font: "600 11px var(--font-body)" }}>
          {t("Role default")}
        </button>
      )}
      {LEVELS.map(([x, xl, ic, c]) => {
        const on = value === x;
        return (
          <button
            key={x}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            onClick={() => onChange(x)}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 28, padding: "0 9px", border: 0, borderInlineEnd: "1px solid var(--border-default)", cursor: disabled ? "not-allowed" : "pointer", background: on ? c : "#fff", color: on ? "#fff" : "var(--text-muted)", font: "600 11px var(--font-body)" }}
          >
            <Icon name={ic} size={12} />
            {t(xl)}
          </button>
        );
      })}
    </span>
  );
}

function RolesMatrix({ matrix, modules, canEdit }: { matrix: Matrix; modules: { key: string; label: string }[]; canEdit: boolean }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [busy, start] = useTransition();
  const th = { padding: "10px 8px", background: "var(--surface-sunken)", font: "700 11px var(--font-body)", color: "var(--text-muted)", textTransform: "uppercase" as const, letterSpacing: ".04em", whiteSpace: "nowrap" as const };
  return (
    <FinBox title="Access Control" pad={0}>
      <div style={{ padding: "0 14px", fontSize: 12, color: "var(--text-muted)" }}>
        {t("Each role's default access per page. An employee's own Page access overrides it.")} {!canEdit && t("Only a super admin can change role defaults.")}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "start", padding: "10px 16px" }}>{t("Roles")}</th>
              {modules.map((m) => (
                <th key={m.key} style={th}>
                  {t(m.label)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((r) => (
              <tr key={r.key} style={{ borderTop: "1px solid var(--border-default)" }}>
                <td style={{ padding: "12px 16px", fontWeight: 600, color: "var(--text-strong)", whiteSpace: "nowrap" }}>{t(r.name)}</td>
                {modules.map((m) => {
                  const lv = r.levels[m.key] as Level;
                  const [, label, , color] = LEVELS.find((l) => l[0] === lv)!;
                  return (
                    <td key={m.key} style={{ textAlign: "center", padding: 6 }}>
                      {canEdit && m.key !== "dashboard" ? (
                        <select
                          aria-label={`${t(r.name)} · ${t(m.label)}`}
                          value={lv}
                          disabled={busy}
                          onChange={(e) =>
                            start(async () => {
                              const res = await setRoleModuleAction(r.key, m.key, e.target.value);
                              if (!res.ok) toast({ tone: "danger", title: res.error });
                              else toast({ tone: "success", title: "Permissions saved", message: `${t(r.name)} · ${t(m.label)}` });
                              router.refresh();
                            })
                          }
                          style={{ height: 30, border: "1px solid var(--border-default)", borderRadius: 6, color, font: "600 12px var(--font-body)", background: "#fff" }}
                        >
                          {LEVELS.map(([x, xl]) => (
                            <option key={x} value={x}>
                              {t(xl)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span style={{ color, font: "600 12px var(--font-body)" }}>{t(label)}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </FinBox>
  );
}

function ActivityLog({ activity, filters, go }: { activity: Activity; filters: Props["filters"]; go: (p: Record<string, string | null>) => void }) {
  const t = useT();
  const [aq, setAq] = useState(filters.aq);
  const TONE: Record<string, "success" | "info" | "warning" | "danger" | "neutral"> = { Created: "success", Updated: "info", "Status changed": "warning", Deleted: "danger", Login: "neutral" };
  const cols: DataColumn<Activity["rows"][number]>[] = [
    {
      key: "d",
      label: "Date",
      render: (r) => (
        <span style={{ whiteSpace: "nowrap" }}>
          {fdate(r.at)}
          <span style={{ display: "block", fontSize: 11, color: "var(--text-muted)" }}>{r.at.slice(11, 16)}</span>
        </span>
      ),
    },
    {
      key: "b",
      label: "Employee",
      render: (r) => (
        <span>
          <b style={{ color: "var(--text-strong)" }}>{r.byName}</b>
          <span style={{ display: "block", fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{r.by}</span>
        </span>
      ),
    },
    { key: "k", label: "Action", render: (r) => <Badge tone={TONE[r.kind] ?? "neutral"}>{t(r.kind)}</Badge> },
    {
      key: "i",
      label: "Item",
      render: (r) => (
        <span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{t(r.entity)}</span>
          <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-strong)", fontWeight: 600 }}>{r.action}</span>
        </span>
      ),
    },
    { key: "x", label: "Details", render: (r) => <span style={{ fontSize: 11, color: "var(--text-muted)", wordBreak: "break-all" }}>{r.detail || "—"}</span> },
  ];
  const pages = Math.max(1, Math.ceil(activity.total / 50));
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
        <Stat icon="Activity" label="Total actions" value={String(activity.total)} />
        <Stat icon="Calendar" tone="orange" label="Today" value={String(activity.today)} />
      </div>
      <FinBox pad={0}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: 14, alignItems: "flex-end" }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              go({ aq, page: null });
            }}
          >
            <SearchBox value={aq} onChange={setAq} placeholder="Search item, employee..." style={{ width: 260, maxWidth: "100%" }} />
          </form>
          <select aria-label={t("Item")} value={filters.entity} onChange={(e) => go({ entity: e.target.value, page: null })} style={{ height: 40, padding: "0 10px", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-s)", background: "#fff" }}>
            <option value="">{t("All items")}</option>
            {["Invoice", "Payment", "Shipment", "Customer", "Employee", "User", "Notification", "Document", "Role"].map((x) => (
              <option key={x} value={x}>
                {t(x)}
              </option>
            ))}
          </select>
          <DateField label="Date" value={filters.day} onChange={(d) => go({ day: d, page: null })} />
        </div>
        <Table rows={activity.rows} cols={cols} rowKey={(r) => r.id} empty="No activity" />
        {pages > 1 && (
          <div style={{ display: "flex", gap: 8, justifyContent: "center", padding: "0 0 14px" }}>
            <Button size="s" variant="outline" disabled={activity.page <= 1} onClick={() => go({ page: String(activity.page - 1) })}>
              {t("Prev")}
            </Button>
            <span style={{ alignSelf: "center", fontSize: 13 }}>
              {activity.page} / {pages}
            </span>
            <Button size="s" variant="outline" disabled={activity.page >= pages} onClick={() => go({ page: String(activity.page + 1) })}>
              {t("Next")}
            </Button>
          </div>
        )}
      </FinBox>
    </>
  );
}

function EmployeeForm({
  emp,
  roles,
  modules,
  countries,
  nextCode,
  onClose,
  onSaved,
}: {
  emp: EmployeeDetail | null;
  roles: { key: string; name: string }[];
  modules: { key: string; label: string }[];
  countries: string[];
  nextCode: string;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const t = useT();
  const [v, setV] = useState<Required<EmployeeFormValues>>({
    code: emp ? "" : nextCode,
    name: emp?.name ?? "",
    email: emp?.email ?? "",
    phone: emp?.phone ?? "+252 61 ",
    department: emp?.department ?? "OPERATIONS",
    roleKeys: emp?.roles.map((r) => r.key) ?? ["operation_staff"],
    countries: emp?.countries ?? [],
    access: emp?.access ?? {},
    accountingAccess: emp?.accountingAccess ?? false,
    transferRole: emp?.transferRole ?? "NONE",
    transferCountries: emp?.transferCountries.length ? emp.transferCountries : ["Turkey"],
    accessFrom: emp?.accessFrom ?? "",
    accessUntil: emp?.accessUntil ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof EmployeeFormValues>(k: K, x: Required<EmployeeFormValues>[K]) => setV((o) => ({ ...o, [k]: x }));
  const toggle = (list: string[], x: string) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);
  const lab = { font: "600 13px var(--font-body)", color: "var(--text-strong)", margin: "18px 0 8px" } as const;
  const chip = (on: boolean) =>
    ({ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px", borderRadius: 16, cursor: "pointer", border: "1.5px solid " + (on ? "var(--navy-700)" : "var(--border-default)"), background: on ? "var(--surface-brand-tint)" : "#fff", font: "600 12px var(--font-body)", color: "var(--text-strong)" }) as const;

  const save = () =>
    start(async () => {
      setError(null);
      const r = await saveEmployeeAction(emp?.userId ?? null, v);
      if (!r.ok) return setError(r.error);
      onSaved(v.name);
    });

  return (
    <Dialog
      open
      width={680}
      onClose={onClose}
      title={t(emp ? "Edit Employee" : "Add Employee")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t("Cancel")}
          </Button>
          <Button onClick={save} disabled={pending || !v.name.trim() || !v.email.trim()} data-testid="save-employee">
            {t("Save")}
          </Button>
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
        {emp ? (
          <Input label={t("Employee ID")} value={emp.code} readOnly inputStyle={{ fontFamily: "var(--font-mono)", background: "var(--surface-sunken)" }} />
        ) : (
          <Input
            label={t("Employee ID")}
            value={v.code}
            onChange={(e) => set("code", e.target.value.toUpperCase())}
            placeholder={nextCode}
            maxLength={20}
            inputStyle={{ fontFamily: "var(--font-mono)" }}
            data-testid="employee-code"
          />
        )}
        <Input label={t("Name")} value={v.name} onChange={(e) => set("name", e.target.value)} />
        <Input label={t("Phone")} value={v.phone} onChange={(e) => set("phone", e.target.value)} />
        <Input label={t("Gmail")} type="email" value={v.email} onChange={(e) => set("email", e.target.value)} />
        <label style={{ display: "flex", flexDirection: "column", gap: 6, font: "600 13px var(--font-body)" }}>
          {t("Department")}
          <select value={v.department} onChange={(e) => set("department", e.target.value as typeof v.department)} style={{ height: 40, padding: "0 10px", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-s)", background: "#fff" }}>
            {DEPTS.map(([k, l]) => (
              <option key={k} value={k}>
                {t(l)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div style={lab}>{t("Responsible countries")}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={() => set("countries", [])} style={chip(v.countries.length === 0)}>
          <Icon name="Globe" size={14} />
          {t("All countries")}
        </button>
        {countries.map((c) => (
          <button key={c} type="button" onClick={() => set("countries", toggle(v.countries, c))} style={chip(v.countries.includes(c))}>
            <Flag country={c} size={12} />
            {t(c)}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{t("This employee works on shipments from these countries.")}</div>
      <div style={lab}>{t("Roles")}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
        {roles.map((r) => (
          <Checkbox key={r.key} label={t(r.name)} checked={v.roleKeys.includes(r.key)} onChange={() => set("roleKeys", toggle(v.roleKeys, r.key))} />
        ))}
      </div>
      {/* Shipment work (ADR-036): the data team enters cargo; pricing staff set the rates and may change everything. */}
      <div style={lab}>{t("Shipment work")}</div>
      <div role="radiogroup" aria-label={t("Shipment work")} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
        {(
          [
            ["NONE", "Data entry", "ClipboardList", "Enters customers, boxes, KG and MIX. Sees the rates but can't change them."],
            ["EDIT", "Pricing (Rate)", "BadgeDollarSign", "Sets Rate, Quality Rate and Brand Rate, and can change everything on a shipment."],
          ] as const
        ).map(([lvl, title, icon, desc]) => {
          // A Super Admin always has Shipment pricing.
          const superA = v.roleKeys.includes("super_admin");
          const on = superA ? lvl === "EDIT" : (v.access.pricing === "EDIT") === (lvl === "EDIT");
          return (
            <button
              key={lvl}
              type="button"
              role="radio"
              aria-checked={on}
              data-testid={`shipment-work-${lvl === "EDIT" ? "pricing" : "data"}`}
              disabled={superA}
              onClick={() => set("access", { ...v.access, pricing: lvl })}
              style={{ display: "flex", gap: 10, alignItems: "flex-start", textAlign: "start", padding: 12, borderRadius: 8, cursor: superA ? "default" : "pointer", border: `1.5px solid ${on ? (lvl === "EDIT" ? "#15803D" : "var(--navy-700)") : "var(--border-default)"}`, background: on ? (lvl === "EDIT" ? "#F0FDF4" : "var(--surface-brand-tint)") : "#fff" }}
            >
              <Icon name={icon} size={18} color={lvl === "EDIT" ? "#15803D" : "var(--navy-700)"} />
              <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <b style={{ font: "700 13px var(--font-body)", color: "var(--text-strong)" }}>{t(title)}</b>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t(desc)}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div style={lab}>{t("Page access")}</div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>{t("Choose for each page: role default, no access, view only, or full.")}</div>
      <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--border-default)", borderRadius: 8, overflow: "hidden" }}>
        {modules
          // Shipment pricing is chosen above, under Shipment work.
          .filter((m) => m.key !== "dashboard" && m.key !== "pricing")
          .map((m) => (
            <div key={m.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderBottom: "1px solid var(--border-default)", flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: 120, fontSize: 13, color: "var(--text-strong)" }}>{t(m.label)}</span>
              <LevelPicker allowDefault value={(v.access[m.key] as Level | null | undefined) ?? null} onChange={(x) => set("access", { ...v.access, [m.key]: x })} />
            </div>
          ))}
      </div>
      <div style={lab}>{t("Special access")}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 12, borderRadius: 8, background: "var(--surface-sunken)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="Calculator" size={16} color="var(--navy-700)" />
          <span style={{ flex: 1, fontSize: 13 }}>{t("Accounting")}</span>
          <Switch checked={v.accountingAccess} onChange={(x) => set("accountingAccess", x)} label={t(v.accountingAccess ? "On" : "Off")} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Icon name="ArrowLeftRight" size={16} color="var(--navy-700)" />
          <span style={{ flex: 1, fontSize: 13 }}>{t("Money Transfer")}</span>
          <Seg
            options={[
              ["NONE", "No access"],
              ["RECEIVE", "Receiver"],
              ["SEND", "Sender"],
            ]}
            value={v.transferRole}
            onChange={(x) => set("transferRole", x as typeof v.transferRole)}
          />
        </div>
        {v.transferRole !== "NONE" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", paddingInlineStart: 26, fontSize: 12, color: "var(--text-muted)" }}>
            {t("Countries")}:
            {countries.map((c) => (
              <button key={c} type="button" onClick={() => set("transferCountries", toggle(v.transferCountries, c))} style={chip(v.transferCountries.includes(c))}>
                <Flag country={c} size={11} />
                {t(c)}
              </button>
            ))}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
          <DateField label="Access from" value={v.accessFrom} onChange={(x) => set("accessFrom", x)} />
          <DateField label="Access until" value={v.accessUntil} onChange={(x) => set("accessUntil", x)} />
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{t("Leave the dates empty for no time limit. Outside the period the account has no access.")}</div>
      </div>
      {!emp && <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-muted)" }}>{t("The employee signs in at Admin Login → Create Password with their Employee ID and Gmail.")}</div>}
      {error && (
        <div role="alert" style={{ marginTop: 12, color: "var(--status-danger)", fontSize: 13 }}>
          {t(error)}
        </div>
      )}
    </Dialog>
  );
}
