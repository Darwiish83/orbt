"use client";

import { useActionState } from "react";
import { Tag } from "@/ui/primitives";
import { assignRoleAction, removeRoleAction, setStatusAction, type ActionState } from "./actions";

const initial: ActionState = { error: null };

export function RoleControls({
  userId,
  roleKeys,
  allRoles,
  status,
}: {
  userId: string;
  roleKeys: string[];
  allRoles: { key: string; name: string }[];
  status: string;
}) {
  const [state, action] = useActionState(assignRoleAction, initial);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        {roleKeys.length === 0 && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>No roles</span>}
        {roleKeys.map((rk) => (
          <form key={rk} action={removeRoleAction} style={{ display: "inline" }}>
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="roleKey" value={rk} />
            <Tag onRemove={() => {}}>
              <button type="submit" style={{ all: "unset", cursor: "pointer" }}>
                {rk}
              </button>
            </Tag>
          </form>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <form action={action} style={{ display: "flex", gap: 6 }}>
          <input type="hidden" name="userId" value={userId} />
          <select name="roleKey" defaultValue="" style={{ height: 32, border: "1px solid var(--border-strong)", borderRadius: "var(--radius-s)", fontSize: 13, padding: "0 8px" }}>
            <option value="" disabled>
              Add role…
            </option>
            {allRoles.map((r) => (
              <option key={r.key} value={r.key}>
                {r.name}
              </option>
            ))}
          </select>
          <button type="submit" style={{ height: 32, padding: "0 10px", border: "1.5px solid var(--navy-700)", background: "transparent", color: "var(--navy-700)", borderRadius: "var(--radius-s)", font: "700 12px var(--font-body)", cursor: "pointer" }}>
            Add
          </button>
        </form>
        <form action={setStatusAction}>
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="status" value={status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED"} />
          <button
            type="submit"
            style={{ height: 32, padding: "0 10px", border: "1px solid var(--border-strong)", background: "transparent", color: status === "SUSPENDED" ? "var(--status-success)" : "var(--status-danger)", borderRadius: "var(--radius-s)", font: "700 12px var(--font-body)", cursor: "pointer" }}
          >
            {status === "SUSPENDED" ? "Reactivate" : "Suspend"}
          </button>
        </form>
      </div>
      {state.error && <span style={{ fontSize: 12, color: "var(--status-danger)" }}>{state.error}</span>}
    </div>
  );
}
