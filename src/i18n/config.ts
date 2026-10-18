/** Supported languages. English is the key language (identity dictionary). */
export const LANGS = ["en", "so", "ar"] as const;
export type Lang = (typeof LANGS)[number];

export const DEFAULT_LANG: Lang = "en";

/** Languages that render right-to-left. */
export const RTL_LANGS: ReadonlySet<Lang> = new Set<Lang>(["ar"]);

export const LANG_LABELS: Record<Lang, string> = {
  en: "EN",
  so: "SO",
  ar: "ع",
};

export function isLang(value: string): value is Lang {
  return (LANGS as readonly string[]).includes(value);
}

export function dir(lang: Lang): "rtl" | "ltr" {
  return RTL_LANGS.has(lang) ? "rtl" : "ltr";
}

/** localStorage key — mirrors the design system (`orbit-lang`). */
export const LANG_STORAGE_KEY = "orbit-lang";
