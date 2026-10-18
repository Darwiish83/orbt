import { describe, expect, it } from "vitest";
import { DICTIONARIES } from "@/i18n/dictionaries";
import { dir, isLang } from "@/i18n/config";

describe("i18n dictionaries", () => {
  it("translates a known key into Somali", () => {
    expect(DICTIONARIES.so["Home"]).toBe("Hoyga");
  });

  it("translates a known key into Arabic", () => {
    expect(DICTIONARIES.ar["Shipments"]).toBe("الشحنات");
  });

  it("English dictionary is identity (empty → falls back to key)", () => {
    expect(DICTIONARIES.en["Home"]).toBeUndefined();
  });
});

describe("i18n config", () => {
  it("marks Arabic as RTL and English as LTR", () => {
    expect(dir("ar")).toBe("rtl");
    expect(dir("en")).toBe("ltr");
  });

  it("validates language codes", () => {
    expect(isLang("so")).toBe(true);
    expect(isLang("fr")).toBe(false);
  });
});
