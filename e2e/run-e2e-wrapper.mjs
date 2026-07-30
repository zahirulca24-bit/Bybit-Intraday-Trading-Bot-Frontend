import { spawn } from "node:child_process";

const SUCCESS_MARKER = "Historical Replay Render frontend E2E passed.";
const HARD_TIMEOUT_MS = 180_000;
const child = spawn(process.execPath, ["e2e/run-e2e.mjs"], {
  cwd: process.cwd(),
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
});

let passed = false;
let settled = false;
let output = "";

function finish(code) {
  if (settled) return;
  settled = true;
  clearTimeout(timeout);
  process.exitCode = code;
}

function capture(chunk, stream) {
  const text = chunk.toString();
  output = `${output}${text}`.slice(-20_000);
  stream.write(text);
  if (!passed && output.includes(SUCCESS_MARKER)) {
    passed = true;
    setTimeout(() => {
      if (!child.killed) child.kill("SIGTERM");
    }, 250).unref();
  }
}

child.stdout.on("data", (chunk) => capture(chunk, process.stdout));
child.stderr.on("data", (chunk) => capture(chunk, process.stderr));
child.on("error", (error) => {
  console.error(error);
  finish(1);
});
child.on("close", (code, signal) => {
  if (passed) {
    finish(0);
    return;
  }
  console.error(`Historical Replay E2E exited before success (code=${code}, signal=${signal || "none"}).`);
  finish(code && code > 0 ? code : 1);
});

const timeout = setTimeout(() => {
  console.error(`Historical Replay E2E exceeded ${HARD_TIMEOUT_MS / 1000} seconds.`);
  if (!child.killed) child.kill("SIGKILL");
  finish(1);
}, HARD_TIMEOUT_MS);
