import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPickPollBackoffLadder,
  shouldAdvancePickPollBackoff,
  shouldResetPickPollFast,
} from "./pickPollBackoff.js";

describe("pickPollBackoff", () => {
  it("builds 500ms base ladder to 5s max", () => {
    assert.deepEqual(buildPickPollBackoffLadder(500), [500, 1000, 2000, 5000]);
  });

  it("resets fast when jobs were dispatched", () => {
    assert.equal(
      shouldResetPickPollFast({
        totalPicked: 3,
        totalDispatched: 1,
        rpcAttemptedEmpty: false,
        lockDeferred: false,
      }),
      true
    );
  });

  it("advances backoff on lockDeferred", () => {
    assert.equal(
      shouldAdvancePickPollBackoff({
        totalPicked: 0,
        totalDispatched: 0,
        rpcAttemptedEmpty: false,
        lockDeferred: true,
      }),
      true
    );
  });

  it("advances backoff on empty postgres pick", () => {
    assert.equal(
      shouldAdvancePickPollBackoff({
        totalPicked: 0,
        totalDispatched: 0,
        rpcAttemptedEmpty: true,
        lockDeferred: false,
      }),
      true
    );
  });

  it("advances when picks were actor-filtered with no dispatch", () => {
    assert.equal(
      shouldAdvancePickPollBackoff({
        totalPicked: 2,
        totalDispatched: 0,
        rpcAttemptedEmpty: false,
        lockDeferred: false,
      }),
      true
    );
  });
});
