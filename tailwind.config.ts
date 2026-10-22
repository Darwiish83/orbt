import type { Config } from "tailwindcss";

/**
 * Tailwind is bridged onto the OrbitCargo design-system token CSS variables
 * (ADR-003). The variables themselves live in src/ui/tokens/*.css and remain
 * the single source of truth; this config only re-exposes them as utilities so
 * ported components and new layout render identically.
 */
const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/ui/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/i18n/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          50: "var(--navy-50)",
          100: "var(--navy-100)",
          300: "var(--navy-300)",
          500: "var(--navy-500)",
          600: "var(--navy-600)",
          700: "var(--navy-700)",
          800: "var(--navy-800)",
          900: "var(--navy-900)",
        },
        orange: {
          50: "var(--orange-50)",
          200: "var(--orange-200)",
          400: "var(--orange-400)",
          500: "var(--orange-500)",
          600: "var(--orange-600)",
          700: "var(--orange-700)",
        },
        gray: {
          50: "var(--gray-50)",
          100: "var(--gray-100)",
          200: "var(--gray-200)",
          300: "var(--gray-300)",
          400: "var(--gray-400)",
          500: "var(--gray-500)",
          600: "var(--gray-600)",
          700: "var(--gray-700)",
          800: "var(--gray-800)",
          900: "var(--gray-900)",
        },
        green: { 50: "var(--green-50)", 600: "var(--green-600)" },
        amber: { 50: "var(--amber-50)", 600: "var(--amber-600)" },
        red: { 50: "var(--red-50)", 600: "var(--red-600)" },
        blue: { 50: "var(--blue-50)", 600: "var(--blue-600)" },
        // Semantic aliases
        brand: {
          primary: "var(--brand-primary)",
          accent: "var(--brand-accent)",
        },
        surface: {
          page: "var(--surface-page)",
          card: "var(--surface-card)",
          sunken: "var(--surface-sunken)",
          inverse: "var(--surface-inverse)",
          "inverse-deep": "var(--surface-inverse-deep)",
        },
        border: {
          DEFAULT: "var(--border-default)",
          strong: "var(--border-strong)",
          focus: "var(--border-focus)",
        },
      },
      fontFamily: {
        display: "var(--font-display)",
        body: "var(--font-body)",
        mono: "var(--font-mono)",
      },
      fontSize: {
        "display-xl": "var(--text-display-xl)",
        "display-l": "var(--text-display-l)",
        "display-m": "var(--text-display-m)",
        h1: "var(--text-h1)",
        h2: "var(--text-h2)",
        h3: "var(--text-h3)",
        "body-l": "var(--text-body-l)",
        body: "var(--text-body)",
        "body-s": "var(--text-body-s)",
        caption: "var(--text-caption)",
        overline: "var(--text-overline)",
      },
      spacing: {
        1: "var(--space-1)",
        2: "var(--space-2)",
        3: "var(--space-3)",
        4: "var(--space-4)",
        5: "var(--space-5)",
        6: "var(--space-6)",
        8: "var(--space-8)",
        10: "var(--space-10)",
        12: "var(--space-12)",
        16: "var(--space-16)",
        20: "var(--space-20)",
      },
      maxWidth: { container: "var(--container-max)" },
      borderRadius: {
        xs: "var(--radius-xs)",
        s: "var(--radius-s)",
        m: "var(--radius-m)",
        l: "var(--radius-l)",
        pill: "var(--radius-pill)",
      },
      boxShadow: {
        1: "var(--shadow-1)",
        2: "var(--shadow-2)",
        3: "var(--shadow-3)",
        focus: "var(--focus-ring)",
      },
      transitionTimingFunction: {
        out: "var(--ease-out)",
        "in-out": "var(--ease-in-out)",
      },
    },
  },
  // Preflight is OFF: it forces `box-sizing: border-box` and resets margins on
  // every element, but the design system is authored against browser defaults
  // (content-box) plus its own base.css (folded into globals.css). With
  // preflight on, every bordered control renders smaller than the design
  // (caught by tests/e2e/design-parity.spec.ts).
  corePlugins: { preflight: false },
  plugins: [],
};

export default config;
