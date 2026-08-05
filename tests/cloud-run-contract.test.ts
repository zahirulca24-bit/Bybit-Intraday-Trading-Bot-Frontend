import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const renderServer = readFileSync(new URL("../cloud-run-server.ts", import.meta.url), "utf8");
const devServer = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
const dockerfile = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");

for (const [name, source] of [["production", renderServer], ["development", devServer]] as const) {
  test(`${name} BFF uses canonical status and lifecycle truth routes`, () => {
    assert.match(source, /import statusTruthHandler from "\.\/api\/status-truth"/);
    assert.match(source, /import lifecycleTruthHandler from "\.\/api\/lifecycle-truth"/);
    assert.match(source, /app\.get\("\/api\/status"/);
    assert.match(source, /app\.get\("\/api\/orders\/lifecycle"/);
  });
}

test("Cloud Run container is non-root and listens on the platform port", () => {
  assert.match(dockerfile, /ENV PORT=8080/);
  assert.match(dockerfile, /USER node/);
  assert.match(dockerfile, /CMD \["npm", "start"\]/);
});

test("production BFF exposes health and graceful termination", () => {
  assert.match(renderServer, /app\.get\("\/healthz"/);
  assert.match(renderServer, /process\.once\("SIGTERM"/);
  assert.match(renderServer, /server\.close/);
});
