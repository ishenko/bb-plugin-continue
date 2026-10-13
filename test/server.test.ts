import { describe, expect, it } from "vitest";
import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import plugin, { NUDGE_TEXT } from "../server";

describe("inherited continuation behavior", () => {
  it("uses the picked model and settings instead of the thread's old model", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "continue", sdk: { threads: {
      get: async () => makeThreadResponse({ id: "t1", status: "idle", providerId: "claude-code" }),
      send: async () => ({ delivery: "sent" }),
    } } });
    try {
      await plugin(bb);
      await harness.behavior.callRpc("nudge", { threadId: "t1", execution: {
        providerId: "claude-code", model: "new-model", reasoningLevel: "high", serviceTier: "fast", permissionMode: "accept-edits",
      } });
      expect(harness.inspection.sdk.callsTo("threads.send")[0]?.[0]).toMatchObject({
        threadId: "t1", model: "new-model", reasoningLevel: "high", serviceTier: "fast", permissionMode: "accept-edits",
      });
    } finally { await harness.lifecycle.dispose(); }
  });
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
  it.each([false, true])("uses a new model after failure without losing or duplicating input (accepted=%s)", async (accepted) => {
    const input = [{ type: "text", text: "Original question", mentions: [] }, { type: "localImage", path: "/tmp/original.png" }];
    const { bb, harness } = createFakePluginHost({ pluginId: "continue", sdk: { threads: {
      get: async () => makeThreadResponse({ id: "t1", status: "error", providerId: "claude-code" }),
      events: { list: async (args: { types?: readonly string[] }) => args.types?.[0] === "client/turn/requested" ? [{
        type: "client/turn/requested", seq: 10, data: { requestId: "failed-request", input,
          execution: { model: "old-model", reasoningLevel: "high", serviceTier: "default", permissionMode: "full" },
        },
      }] : accepted ? [{ type: "turn/input/accepted", seq: 11, data: { clientRequestId: "failed-request" } }] : [] },
      send: async () => ({ delivery: "sent" }),
    } } });
    try {
      await plugin(bb);
      await harness.behavior.callRpc("nudge", { threadId: "t1", execution: { model: "new-model" } });
      expect(harness.inspection.sdk.callsTo("threads.retry")).toEqual([]);
      expect(harness.inspection.sdk.callsTo("threads.send")[0]?.[0]).toMatchObject({
        model: "new-model",
        input: accepted ? [{ type: "text", text: NUDGE_TEXT, mentions: [], visibility: "agent-only" }]
          : input.map((block) => ({ ...block, visibility: "agent-only" })),
      });
      expect(harness.inspection.sdk.callsTo("threads.events.list")[1]?.[0]).toMatchObject({ afterSeq: "10", types: ["turn/input/accepted"] });
    } finally { await harness.lifecycle.dispose(); }
  });
  it("keeps retry-by-reference when the selected execution is unchanged", async () => {
    const execution = { model: "same-model", reasoningLevel: "high", serviceTier: "default", permissionMode: "full" };
    const { bb, harness } = createFakePluginHost({ pluginId: "continue", sdk: { threads: {
      get: async () => makeThreadResponse({ id: "t1", status: "error" }),
      events: { list: async () => [{ type: "client/turn/requested", seq: 10,
        data: { requestId: "failed-request", execution, input: [] },
      }] },
      retry: async () => ({ delivery: "retried" }),
    } } });
    try {
      await plugin(bb);
      await harness.behavior.callRpc("nudge", { threadId: "t1", execution });
      expect(harness.inspection.sdk.callsTo("threads.retry")[0]?.[0]).toEqual({ threadId: "t1", turnRequestId: "failed-request" });
      expect(harness.inspection.sdk.callsTo("threads.send")).toEqual([]);
    } finally { await harness.lifecycle.dispose(); }
  });
  it("does not silently launch the old provider when a different one is selected", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "continue", sdk: { threads: {
      get: async () => makeThreadResponse({ id: "t1", status: "idle", providerId: "claude-code" }),
    } } });
    try {
      await plugin(bb);
      await expect(harness.behavior.callRpc("nudge", { threadId: "t1", execution: { providerId: "codex", model: "new-model" } })).rejects.toThrow("cannot switch providers");
      expect(harness.inspection.sdk.callsTo("threads.send")).toEqual([]);
    } finally { await harness.lifecycle.dispose(); }
  });
});
