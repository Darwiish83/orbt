# Orbit Design System
Orbit Cargo & Logistics — freight forwarding and parcel logistics across **air, sea and road**. Customers book shipments, get quotes and track cargo door to door.

## Sources
- `uploads/orbit logo.png` — full-colour logo (navy + orange) → `assets/orbit-logo.png`
- `uploads/orbit logo..png` — reversed logo (white + orange, for dark grounds) → `assets/orbit-logo-reversed.png`

Nothing else was provided: no codebase, Figma, website, product screens or fonts. Colours were sampled from the logo; everything else (type pairing, components, UI kit) is **derived from the logo's character** and should be validated against real Orbit materials.

## Products
No product source was given. One illustrative surface is included: **Customer Portal** (track, shipments dashboard, quote & book) in `ui_kits/portal/`, and a **Mobile App** in `ui_kits/mobile/` — both invented compositions, not recreations.

## CONTENT FUNDAMENTALS
- **Voice:** dependable, direct, operational. Say what is happening to the cargo and what the customer should do next. No hype.
- **Person:** address the customer as **you**; Orbit speaks as **we** ("We'll text you when the driver is on the way").
- **Casing:** Sentence case for headings, buttons and labels ("Get a quote", "Book shipment"). UPPERCASE only for display headlines, overlines and status badges — mirroring the logo's "CARGO & LOGISTICS" line.
- **Verbs first on actions:** Track, Ship now, Schedule pickup, Cancel shipment.
- **Specifics over adjectives:** "Delivered in 1–3 business days", "By 18:00 local time", "Covers up to $5,000".
- **Data formats:** tracking IDs `ORB-2048-7731` in mono; IATA codes (LOS, LHR); weights `12.40 kg`; dates "Thu 9 Oct"; arrows for lanes "Lagos → London".
- **Status vocabulary:** Booked · Picked up · In transit · Delayed · Exception · Out for delivery · Delivered.
- **Errors:** say how to fix it ("Tracking numbers start with ORB-", "Enter a positive weight").
- **Emoji:** never. Unicode used sparingly: → for lanes, × for close, · as separator.
- Taglines in brand voice: "Door to door, on time." / "Freight that keeps moving." / "Air · Sea · Road".

## VISUAL FOUNDATIONS
- **Colour:** Navy `#012E6C` (primary, from the wordmark) and Orange `#FF5B04` (accent, from the orbit swoosh/arrow). Navy owns large surfaces — headers, hero bands, quote panels. Orange is the energy: the one primary CTA per view, active indicators, the current timeline step, overline rules. Never set long body text in orange; use `--orange-600/700` for orange text on white. Neutrals are cool, slightly navy-tinted grays. Semantic green/amber/red/blue are reserved for shipment status.
- **Type:** Archivo (Google Fonts, variable width). Display = Archivo expanded (`wdth 118`), weight 850, UPPERCASE, tight 1.05 leading — echoes the heavy extended wordmark. Headings Archivo 700 sentence case. Body Archivo 400 15/1.5. JetBrains Mono for tracking numbers, AWBs, HS codes.
- **Motif:** the logo's **orange rule + uppercase overline** ("— CARGO & LOGISTICS —") is the signature device: a 24px × 2px orange bar before small tracked caps. Two-word display headlines split navy/orange ("Track your **shipment**"). Motion arrows (→) and the plane icon riding a progress line on route visuals.
- **Backgrounds:** flat colour only — solid navy bands and light gray page (`--gray-50`). No gradients, no textures, no patterns. Hero bands are navy with content cards overlapping their bottom edge (-48px). Imagery (if supplied later): real cargo/fleet photography, cool daylight tones, no heavy filters.
- **Spacing:** 4px base scale; 32px page gutters; 24px gaps between cards; 1200px max container.
- **Corners:** tight and industrial — 4px on controls/buttons, 2px on badges, 10px on cards/dialogs. The only pills are filter Tags and Switch tracks.
- **Cards:** white, 1px `--gray-200` border, 10px radius, `--shadow-1`. Interactive cards lift to `--shadow-2` and navy-300 border on hover. Dark variant: solid navy panel (quote summary).
- **Shadows:** navy-tinted (`rgba(1,27,64,…)`), soft and low; `--shadow-3` only for dialogs/toasts.
- **Borders:** 1px hairlines for structure; 1.5px for outline buttons and checkboxes; 3px orange underline for active tabs/nav; 4px orange top rule on dialogs; 3px orange inset bar on selected rows.
- **Hover:** darken one step (orange 500→600, navy 700→800); ghost/outline gain a navy-50 or gray-100 fill. Links turn orange.
- **Press:** darken a further step (→700/900). No scale/shrink.
- **Focus:** orange border + 3px orange 35% ring (`--focus-ring`).
- **Animation:** quick and mechanical — 120–200ms, `cubic-bezier(.2,.7,.2,1)` ease-out; colour/shadow transitions and switch slides only. No bounce, no parallax.
- **Transparency/blur:** only the navy 55% scrim behind dialogs. No glassmorphism.
- **Layout:** sticky elements limited to the quote summary; header is a 68px navy bar with reversed logo and orange-underlined active nav.

## ICONOGRAPHY
- No icon set was provided. **Substitution: [Lucide](https://lucide.dev)** (2px stroke, rounded joins) loaded from CDN (`lucide-static@0.452.0`) via the `Icon` component, which fetches and inlines the SVG so it takes `currentColor`. Its geometric outline style sits well beside Archivo; replace if Orbit has its own set.
- Core glyphs: `truck`, `plane`, `ship`, `package`, `package-check`, `warehouse`, `map-pin`, `flag`, `search`, `clock`, `bell`, `download`, `plus`, `arrow-right`, `info`.
- Sizes 14/16 inline with text, 18–20 standalone. Icons are navy/gray; orange only when marking the active/moving state.
- No emoji. No PNG icons. Unicode → and × are used as lightweight glyphs.
- **Logo:** use `orbit-logo.png` on white/light; `orbit-logo-reversed.png` on navy. Don't recolour, redraw, or place on orange. Keep clear space ≥ the height of the "O" swoosh arrow.

## Index
- `styles.css` — entry point (imports only) → `tokens/fonts.css`, `colors.css`, `typography.css`, `spacing.css`, `effects.css`, `base.css`
- `assets/` — `orbit-logo.png`, `orbit-logo-reversed.png`
- `guidelines/` — foundation specimen cards (Colors, Type, Spacing, Brand)
- `components/` — React primitives (each with `.d.ts` + `.prompt.md` + a directory card)
- `ui_kits/portal/` — Customer Portal click-through
- `ui_kits/customer-app/` — Customer App (iPhone, Samsung, Desktop): Login, Home, Shipments, Finance, Invoice, Notifications, Records, Profile
- `ui_kits/admin/` — Admin Panel: Login (3-step), Dashboard, Users & Team, Customers, Shipments, Operations, Finance, Documents, Reports, Notifications + Schedule Announcement, Settings (year system)
- `ui_kits/shared/` — mock data, EN/SO translations (`so.js`), i18n + kit helpers
- `ui_kits/mobile/` — Mobile app (3 phones, bottom tab nav)
- `thumbnail.html`, `SKILL.md`

## Components
- **core/**: Button, IconButton, Badge, Tag, Card, Icon
- **forms/**: Input, Select, Checkbox, Radio, Switch
- **navigation/**: Tabs
- **feedback/**: Dialog, Toast, Tooltip
- **logistics/**: TrackingTimeline, ShipmentRow

No source defined a component inventory, so a standard set was authored.

### Intentional additions
- **Icon** — wrapper so Lucide glyphs inherit colour.
- **TrackingTimeline** — shipment scan history is the core logistics pattern.
- **ShipmentRow** — dense shipment list row with status badge.

## Language (EN / SO / AR)
Both apps ship English, Somali and Arabic (Arabic switches the page to right-to-left). Arabic strings: `ui_kits/shared/ar.js`. Toggle via the SO/EN switch (top bar, login, Profile → Language, Admin Settings → General). Choice persists in localStorage `orbit-lang`. Add/edit Somali strings in `ui_kits/shared/so.js` (key = English text). Add another language by adding a dictionary and an option in `i18n.jsx`.
