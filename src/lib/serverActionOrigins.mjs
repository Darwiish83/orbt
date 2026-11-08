/**
 * Origins, besides the app's own, that may call Server Actions (security finding M2).
 *
 * Production: none. Next.js then accepts a Server Action only when the request's
 * Origin matches its Host, so a page on any other site cannot submit our forms.
 * Development keeps the second dev server and Cloudflare quick tunnels used to
 * share a local build; neither belongs in a production build.
 *
 * Plain JavaScript so next.config.mjs can import it.
 */
export function serverActionAllowedOrigins(nodeEnv = process.env.NODE_ENV) {
  return nodeEnv === "production" ? [] : ["localhost:3100", "*.trycloudflare.com"];
}
