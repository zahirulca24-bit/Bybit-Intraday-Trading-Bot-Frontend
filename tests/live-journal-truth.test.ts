import assert from "node:assert/strict";

import {
  adaptExecutionEntry,
  adaptExecutionSummary,
  adaptRuntimeJournalEntry,
  classifyJournalLevel,
  mergeJournalRows,
  sourceFailureRow,
} from "../api/live-journal";

function testBlockedReasonCannotBecomePass(): void {
  const entry = {
    time: 1_722_271_552,
    event: "setup_execution_handoff",
    payload: {
      result: {
        retCode: -1003,
        retMsg: "Max trades/day reached (1/1)",
      },
    },
  };
  assert.equal(classifyJournalLevel(entry), "BLOCKED");
  const row = adaptRuntimeJournalEntry(entry, 0);
  assert.equal(row.level, "BLOCKED");
  assert.match(row.message, /Max trades\/day reached/);
}

function testExplicitBackendStatusWins(): void {
  assert.equal(
    classifyJournalLevel({
      event: "risk_decision",
      payload: { status: "BLOCKED", reason: "Policy denied a new entry" },
    }),
    "BLOCKED",
  );
  assert.equal(
    classifyJournalLevel({
      event: "storage_state",
      payload: { level: "DEGRADED", reason: "PostgreSQL persistence unavailable" },
    }),
    "DEGRADED",
  );
}

function testExecutionAuditMessage(): void {
  const row = adaptExecutionEntry({
    execId: "ena-close-1",
    execTime: 1_722_275_326_000,
    symbol: "ENAUSDT",
    side: "Buy",
    action: "PARTIAL_EXIT",
    execQty: "4453",
    execPrice: "0.07975000",
    execFee: "0.1953",
    feeCurrency: "USDT",
    closedSize: "4453",
    entrySize: "0",
    positionBefore: "-11134",
    positionAfter: "-6681",
    orderId: "order-ena-close",
    isMaker: false,
    syncedAt: 1_722_275_400_000,
  }, 0);

  assert.equal(row.level, "PASS");
  assert.equal(row.category, "bybit_partial_exit");
  assert.match(row.message, /ENAUSDT partially closed exposure/);
  assert.match(row.message, /fee 0\.1953 USDT/);
  assert.match(row.message, /position -11134 → -6681/);
  assert.equal(row.details?.closedSize, "4453");
}

function testSummaryAndMerge(): void {
  const summary = adaptExecutionSummary({
    available: true,
    stale: false,
    lastSyncedAt: 1_722_275_500_000,
    totalExecutions: 16,
    entryExecutions: 8,
    exitExecutions: 8,
    partialCloseExecutions: 1,
    completedTrades: 7,
    netTradingFees: "1.5000",
    feeCurrencies: ["USDT"],
  });
  assert.ok(summary);
  assert.equal(summary.level, "PASS");
  assert.match(summary.message, /16 fills/);

  const failure = sourceFailureRow("RUNTIME_JOURNAL", "temporary source failure", 1_722_275_600_000);
  const duplicate = { ...failure, message: "newer duplicate" };
  const merged = mergeJournalRows([summary, failure, duplicate], 10);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].message, "newer duplicate");
  assert.equal(merged[0].level, "DEGRADED");
}

function testUnavailableExecutionBlockIsBlocked(): void {
  assert.equal(
    classifyJournalLevel({
      event: "risk_guard",
      payload: {
        reason: "Daily risk unavailable; execution blocked: closed PnL endpoint unavailable",
      },
    }),
    "BLOCKED",
  );
}

testBlockedReasonCannotBecomePass();
testExplicitBackendStatusWins();
testExecutionAuditMessage();
testSummaryAndMerge();
testUnavailableExecutionBlockIsBlocked();

console.log("live journal truth tests passed");
