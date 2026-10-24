import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/db/client";
import { AuthorizationError } from "@/lib/errors";
import { can } from "@/modules/authz/core";
import { requireUser } from "@/modules/authz/session";
import { getSettings, listCountries, listYears, SETTING_OPTIONS } from "@/modules/settings/service";
import { getAdminScope } from "../scope";
import { SettingsView } from "./SettingsView";

export const metadata = { title: "Settings" };

function appVersion(): string {
  try {
    return (JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as { version?: string }).version ?? "—";
  } catch {
    return "—";
  }
}

/** Settings (spec B15 / §16): shared by every country. */
export default async function SettingsPage() {
  const user = await requireUser();
  if (!can(user, "settings:read")) throw new AuthorizationError("Missing permission: settings:read");
  const [settings, years, countries, scope, me] = await Promise.all([
    getSettings(prisma),
    listYears(prisma),
    listCountries(prisma),
    getAdminScope(user).catch(() => null),
    prisma.user.findUnique({ where: { id: user.id }, select: { mfaEnabled: true } }),
  ]);
  return (
    <SettingsView
      settings={settings}
      years={years}
      countries={countries}
      options={SETTING_OPTIONS}
      selectedYear={scope?.year ?? null}
      mfaEnabled={!!me?.mfaEnabled}
      canWrite={can(user, "settings:write")}
      system={{ version: appVersion(), environment: process.env.NODE_ENV ?? "development", roles: await prisma.role.count(), permissions: await prisma.permission.count() }}
    />
  );
}
