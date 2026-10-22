/**
 * Country name → ISO 3166-1 alpha-2 lookup, ported from the design kit's
 * `ORBIT_RULES.ISO` (including its Somali/alias spellings). Unknown names fall
 * back to English region names from Intl.DisplayNames.
 */
const ISO: Record<string, string> = {
  china: "cn", uae: "ae", "united arab emirates": "ae", turkey: "tr", "türkiye": "tr", somalia: "so",
  kenya: "ke", ethiopia: "et", djibouti: "dj", india: "in", "saudi arabia": "sa", oman: "om", egypt: "eg",
  qatar: "qa", pakistan: "pk", malaysia: "my", indonesia: "id", thailand: "th", vietnam: "vn", japan: "jp",
  "south korea": "kr", usa: "us", "united states": "us", uk: "gb", "united kingdom": "gb", germany: "de",
  italy: "it", france: "fr", netherlands: "nl", belgium: "be", spain: "es", uganda: "ug", tanzania: "tz",
  yemen: "ye", sudan: "sd",
  // Aliases from the design kit (Somali spellings, cities, short names).
  chine: "cn", shiinaha: "cn", shiina: "cn", hindiya: "in", hindia: "in", turkiga: "tr", turki: "tr",
  imaaraadka: "ae", emirates: "ae", dubai: "ae", kiinya: "ke", itoobiya: "et", jabuuti: "dj", masar: "eg",
  soomaaliya: "so", suudaan: "sd", yaman: "ye", bangladesh: "bd", america: "us", england: "gb",
};

let regionIndex: Map<string, string> | null = null;

function regions(): Map<string, string> {
  if (regionIndex) return regionIndex;
  regionIndex = new Map();
  try {
    const dn = new Intl.DisplayNames(["en"], { type: "region" });
    const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for (const x of A)
      for (const y of A) {
        const code = x + y;
        let name: string | undefined;
        try {
          name = dn.of(code);
        } catch {
          continue;
        }
        if (name && name !== code && !/Unknown|Region/.test(name)) regionIndex.set(name.toLowerCase(), code.toLowerCase());
      }
  } catch {
    /* Intl.DisplayNames unavailable — alias map only */
  }
  return regionIndex;
}

/** ISO alpha-2 (lowercase) for a country name or 2-letter code, or "" if unknown. */
export function isoOf(country: string | null | undefined): string {
  const k = (country ?? "").trim().toLowerCase();
  if (!k) return "";
  if (ISO[k]) return ISO[k];
  if (/^[a-z]{2}$/.test(k)) return k;
  return regions().get(k) ?? "";
}
