import assert from "node:assert/strict";
import { test } from "node:test";
import { expectedMachines } from "../scripts/fly-postdeploy.mjs";

const machine = (id, group, state = "started") =>
  ({ id, state, config: { metadata: { fly_process_group: group } } });

test("Fly post-deploy check selects exactly one Machine in each process group", () => {
  const found = expectedMachines([machine("api-1", "api"), machine("worker-1", "worker", "stopped")]);
  assert.equal(found.api.id, "api-1");
  assert.equal(found.worker.state, "stopped");
  assert.throws(() => expectedMachines([machine("api-1", "api")]), /api=1, worker=0/);
  assert.throws(() => expectedMachines([
    machine("api-1", "api"), machine("api-2", "api"), machine("worker-1", "worker"),
  ]), /api=2, worker=1/);
});
