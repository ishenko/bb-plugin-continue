import { describe, expect, it } from "vitest";
import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import plugin, { NUDGE_TEXT } from "../server";

describe("inherited continuation behavior", () => {
  it("starts an idle thread with an agent-only continuation", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "continue", sdk: { threads: {
      get: async () => makeThreadResponse({ id: "t1", status: "idle" }),
      send: async () => ({ delivery: "sent" }),
    } } });
    try {
      await plugin(bb);
      expect(await harness.behavior.callRpc("nudge", { threadId: "t1" })).toEqual({ action: "sent", delivery: "sent", threadId: "t1" });
      expect(harness.inspection.sdk.callsTo("threads.send")[0]?.[0]).toEqual({
        threadId: "t1", mode: "auto", input: [{ type: "text", text: NUDGE_TEXT, mentions: [], visibility: "agent-only" }],
      });
    } finally { await harness.lifecycle.dispose(); }
  });
  it("retries a failed turn without sending a new message", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "continue", sdk: { threads: {
      get: async () => makeThreadResponse({ id: "t1", status: "error" }),
      retry: async () => ({ delivery: "retried" }),
    } } });
    try {
      await plugin(bb);
      await harness.behavior.callRpc("nudge", { threadId: "t1", reason: "Retry" });
      expect(harness.inspection.sdk.callsTo("threads.retry")[0]?.[0]).toEqual({ threadId: "t1", reason: "Retry" });
      expect(harness.inspection.sdk.callsTo("threads.send")).toEqual([]);
    } finally { await harness.lifecycle.dispose(); }
  });
  it("refuses a busy thread", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "continue", sdk: { threads: {
      get: async () => makeThreadResponse({ status: "active" }),
    } } });
    try {
      await plugin(bb);
      await expect(harness.behavior.callRpc("nudge", { threadId: "t1" })).rejects.toThrow("Thread is active");
      expect(harness.inspection.sdk.callsTo("threads.send")).toEqual([]);
    } finally { await harness.lifecycle.dispose(); }
  });
});
