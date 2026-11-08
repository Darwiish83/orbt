// Child process for tests/integration/startup.test.ts: runs the real startup hook
// (src/instrumentation.ts) once with the environment the test gives it.
//   exit 0 + STARTUP_OK     the checks passed
//   exit 1                  the production fail-fast handler stopped the process
//   exit 3 + STARTUP_THREW  the hook threw back to its caller (development behaviour)
import { register } from "../../../src/instrumentation";

void (async () => {
  try {
    await register();
    console.log("STARTUP_OK");
    process.exit(0);
  } catch (err) {
    console.log(`STARTUP_THREW ${err instanceof Error ? err.name : "unknown"}`);
    process.exit(3);
  }
})();
