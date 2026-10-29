import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const sleep = ms => new Promise(done => setTimeout(done, ms));
const app = process.argv[2] || "joystick-api";

export function expectedMachines(machines) {
  if (!Array.isArray(machines)) throw new Error("Fly did not return a Machine list");
  const byGroup = group => machines.filter(machine =>
    (machine.config?.metadata?.fly_process_group || machine.config?.metadata?.process_group) === group);
  const api = byGroup("api");
  const worker = byGroup("worker");
  if (api.length !== 1 || worker.length !== 1) {
    throw new Error(`Expected one API and one worker Machine; found api=${api.length}, worker=${worker.length}`);
  }
  if (!api[0].id || !worker[0].id) throw new Error("Expected Machines have no IDs");
  return { api: api[0], worker: worker[0] };
}

function listMachines() {
  const output = execFileSync("flyctl", ["machine", "list", "--app", app, "--json"],
    { encoding: "utf8", timeout: 15_000 });
  return expectedMachines(JSON.parse(output));
}

async function apiHealthy() {
  try {
    const response = await fetch(`https://${app}.fly.dev/health`, { signal: AbortSignal.timeout(5_000) });
    return response.ok;
  } catch { return false; }
}

async function verify() {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(app)) throw new Error("Invalid Fly app name");
  if (!process.env.FLY_API_TOKEN) throw new Error("FLY_API_TOKEN is required");
  const deadline = Date.now() + 60_000;
  const started = new Set();
  let last = "";
  while (Date.now() < deadline) {
    try {
      const machines = listMachines();
      for (const [group, machine] of Object.entries(machines)) {
        if (machine.state === "stopped" && !started.has(machine.id)) {
          console.log(`Starting existing ${group} Machine ${machine.id}`);
          execFileSync("flyctl", ["machine", "start", machine.id, "--app", app],
            { stdio: "inherit", timeout: 20_000 });
          started.add(machine.id);
        }
      }
      const states = `api=${machines.api.state}, worker=${machines.worker.state}`;
      const healthy = machines.api.state === "started" && machines.worker.state === "started" && await apiHealthy();
      if (healthy) {
        console.log(`Fly post-deploy healthy: ${states}, API /health passed`);
        return;
      }
      last = `${states}; waiting for both Machines and API /health`;
    } catch (error) {
      if (/Expected one API and one worker Machine|Fly did not return a Machine list|Expected Machines have no IDs/.test(error.message)) throw error;
      last = error.message;
    }
    await sleep(5_000);
  }
  throw new Error(`Fly post-deploy did not become healthy within 60 seconds: ${last}`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  verify().catch(error => { console.error(error.message); process.exitCode = 1; });
}
