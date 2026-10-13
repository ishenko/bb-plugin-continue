// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot, type RenderedSlot, type RenderSlotOptions } from "@get-bb/plugin-sdk/testing/app";
import { ContinueControl } from "../app";
import { useComposer } from "@get-bb/plugin-sdk/app";
import type { PluginComposerApi } from "@get-bb/plugin-sdk/app";
import { act } from "@testing-library/react";

let slot: RenderedSlot | undefined;
let composerHandle: PluginComposerApi;
beforeEach(() => {
  Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: vi.fn() });
  vi.spyOn(window, "matchMedia").mockReturnValue({
    matches: false, media: "", onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  });
});
afterEach(() => { slot?.lifecycle.unmount(); document.body.replaceChildren(); vi.restoreAllMocks(); });

function render(composer: RenderSlotOptions["composer"], rpc = vi.fn()) {
  function Fixture() {
    composerHandle = useComposer();
    return <div data-promptbox-shell=""><ContinueControl />
      <form data-promptbox=""><div data-promptbox-standard-actions="">
        <div data-promptbox-submit-group=""><span><button data-promptbox-submit-action="" disabled /></span></div>
      </div></form></div>;
  }
  slot = renderSlot({ component: Fixture }, {}, { composer, context: { threadId: "route-thread" }, rpc: { nudge: rpc } });
  return rpc;
}

it("registers only for existing thread composers", async () => {
  const app = await loadPluginApp(() => import("../app"));
  expect(app.composerCustomizations[0]?.scopes).toEqual(["thread"]);
});
it("sends the latest model and execution choices after the picker changes", async () => {
  const rpc = render({
    scope: { kind: "thread", threadId: "t1" },
    selection: { providerId: "claude-code", model: "old-model", reasoningLevel: "low" },
  });
  await act(async () => {
    await composerHandle.setSelection({ model: "new-model", reasoningLevel: "high", serviceTier: "fast", permissionMode: "accept-edits" });
  });
  await act(async () => { document.querySelector<HTMLButtonElement>(".bb-continue-button")!.click(); });
  expect(rpc).toHaveBeenCalledWith({ threadId: "t1", execution: {
    providerId: "claude-code", model: "new-model", reasoningLevel: "high", serviceTier: "fast", permissionMode: "accept-edits",
  } });
});
it("omits unavailable picker fields instead of putting undefined into the RPC", async () => {
  const rpc = render({ scope: { kind: "thread", threadId: "t1" }, selection: { model: "picked-model" } });
  await act(async () => { document.querySelector<HTMLButtonElement>(".bb-continue-button")!.click(); });
  expect(rpc).toHaveBeenCalledWith({ threadId: "t1", execution: { model: "picked-model" } });
});
it.each([
  { scope: { kind: "new-thread" as const, projectId: null } },
  { scope: { kind: "queued-message" as const, threadId: "queue-thread", queuedMessageId: "q1" } },
  { scope: { kind: "thread" as const, threadId: "t1" }, isRunning: true },
  { scope: { kind: "thread" as const, threadId: "t1" }, isSubmitting: true },
  { scope: { kind: "thread" as const, threadId: "t1" }, text: "Hello" },
  { scope: { kind: "thread" as const, threadId: "t1" }, attachmentCount: 1 },
])("hides Continue for an ineligible composer: %j", (composer) => {
  render(composer);
  expect(document.querySelector(".bb-continue-button")).toBeNull();
});
it("uses the composer's thread, blocks double presses and hides after typing", async () => {
  let resolve!: () => void;
  const rpc = render({ scope: { kind: "thread", threadId: "side-thread" }, layout: "compact" },
    vi.fn(() => new Promise<void>((done) => { resolve = done; })));
  const button = document.querySelector<HTMLButtonElement>(".bb-continue-button")!;
  expect(button).not.toBeNull();
  button.click();
  button.click();
  expect(rpc).toHaveBeenCalledOnce();
  expect(rpc).toHaveBeenCalledWith({ threadId: "side-thread" });
  resolve();
  await slot!.behavior.setComposerText("A new message");
  expect(document.querySelector(".bb-continue-button")).toBeNull();
  expect(document.querySelector("[data-bb-continue-hidden]")).toBeNull();
});
