"use server";

import { z } from "zod";
import { prisma } from "@/db/client";
import { requireUser } from "@/modules/authz/session";
import { addCountry, changeOwnPassword, createYear, removeCountry, saveSettings, setCurrentYear } from "@/modules/settings/service";
import { runAction } from "../runAction";

const paths = ["/settings", "/", "/dashboard"];

export async function saveSettingsAction(section: string, values: Record<string, unknown>) {
  return runAction(
    "settings",
    async () => {
      const user = await requireUser();
      await saveSettings(prisma, user, z.enum(["company", "general", "notifications"]).parse(section), z.record(z.string(), z.unknown()).parse(values));
    },
    paths,
  );
}

export async function createYearAction(year: number) {
  return runAction(
    "settings",
    async () => {
      const user = await requireUser();
      await createYear(prisma, user, z.number().int().parse(year));
    },
    paths,
  );
}

export async function setCurrentYearAction(year: number) {
  return runAction(
    "settings",
    async () => {
      const user = await requireUser();
      await setCurrentYear(prisma, user, z.number().int().parse(year));
    },
    paths,
  );
}

export async function addCountryAction(name: string) {
  return runAction(
    "settings",
    async () => {
      const user = await requireUser();
      const c = await addCountry(prisma, user, z.string().trim().min(2).max(60).parse(name));
      return { name: c.name };
    },
    paths,
  );
}

export async function removeCountryAction(id: string) {
  return runAction(
    "settings",
    async () => {
      const user = await requireUser();
      await removeCountry(prisma, user, z.string().min(1).max(64).parse(id));
    },
    paths,
  );
}

export async function changePasswordAction(current: string, next: string, confirm: string) {
  return runAction("settings", async () => {
    const user = await requireUser();
    await changeOwnPassword(prisma, user, z.string().max(200).parse(current), z.string().max(200).parse(next), z.string().max(200).parse(confirm));
  });
}
