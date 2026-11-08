// Module hooks for the startup child process: Next.js supplies "server-only" at
// build time; outside Next the child uses Next's own empty stub (as vitest does).
const STUB = new URL("../../../node_modules/next/dist/compiled/server-only/empty.js", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return { url: STUB, shortCircuit: true };
  return nextResolve(specifier, context);
}
