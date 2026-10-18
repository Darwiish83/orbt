import type { Lang } from "../config";
import en from "./en.json";
import so from "./so.json";
import ar from "./ar.json";

export type Dictionary = Record<string, string>;

/**
 * Dictionaries use the English string as the key (ported from the design
 * system). A missing key falls back to the key itself, so English needs no
 * entries and any untranslated string still renders in English.
 */
export const DICTIONARIES: Record<Lang, Dictionary> = {
  en: en as Dictionary,
  so: so as Dictionary,
  ar: ar as Dictionary,
};
