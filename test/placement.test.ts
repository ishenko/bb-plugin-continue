// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOBILE_QUERY, mountContinuePlacement } from "../placement";

let mobile = false;
let cleanup: (() => void) | undefined;
let frame: FrameRequestCallback | undefined;
let change: (() => void) | undefined;

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: vi.fn() });
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    get matches() { return mobile; },
    media: query,
    onchange: null,
    addEventListener: vi.fn((_type, listener) => { change = listener as () => void; }),
    removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { frame = callback; return 1; });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => { frame = undefined; });
  mobile = false;
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  frame = undefined;
  change = undefined;
});

function fixture(icon = "CornerDownLeft", disabled = true) {
  document.body.innerHTML = `<div data-promptbox-shell><span id="anchor" hidden></span>
    <form data-promptbox><div data-promptbox-standard-actions>
    <button id="secondary-mic"><svg data-icon="Mic"></svg></button>
    <div data-promptbox-submit-group><span id="native-wrapper">
    <button type="button" data-promptbox-submit-action ${disabled ? "disabled" : ""}>
    <svg data-icon="${icon}"></svg></button></span></div></div></form></div>`;
  const anchor = document.querySelector<HTMLElement>("#anchor")!;
  const native = document.querySelector<HTMLButtonElement>("[data-promptbox-submit-action]")!;
  const callback = vi.fn();
  cleanup = mountContinuePlacement(anchor, callback);
  return { native, callback, form: document.querySelector("form")!, wrapper: native.parentElement! };
}

async function flush() {
  await Promise.resolve();
  const callback = frame;
  frame = undefined;
  callback?.(0);
}

describe("Continue placement", () => {
  it("only uses the mobile touch breakpoint", () => {
    fixture();
    expect(window.matchMedia).toHaveBeenCalledWith(MOBILE_QUERY);
  });
  it("replaces disabled Send on desktop without touching the microphone", () => {
    const { wrapper, callback } = fixture();
    expect(wrapper.hasAttribute("data-bb-continue-hidden")).toBe(true);
    expect(document.querySelector("#secondary-mic")?.attributes.length).toBe(1);
    expect(callback).toHaveBeenCalledOnce();
    expect(document.querySelector(".bb-continue-host")?.parentElement).toBe(wrapper.parentElement);
  });
  it("keeps the original mobile microphone and its listeners as a secondary action", () => {
    mobile = true;
    const { native, wrapper } = fixture("Mic", false);
    const handler = vi.fn();
    native.addEventListener("click", handler);
    native.click();
    expect(handler).toHaveBeenCalledOnce();
    expect(native.parentElement).toBe(wrapper);
    expect(native.hasAttribute("data-bb-continue-secondary-mic")).toBe(true);
    expect(native.hasAttribute("data-bb-continue-hidden")).toBe(false);
  });
  it("does not replace an enabled Send", () => {
    const { callback } = fixture("CornerDownLeft", false);
    expect(callback).not.toHaveBeenCalled();
    expect(document.querySelector(".bb-continue-host")).toBeNull();
  });
  it("never changes Stop", () => {
    const { callback, native } = fixture("Square", false);
    expect(callback).not.toHaveBeenCalled();
    expect(native.attributes.length).toBe(2);
  });
  it("does not demote a primary mic on desktop or a wide tablet", () => {
    const { callback } = fixture("Mic", false);
    expect(callback).not.toHaveBeenCalled();
  });
  it("removes Continue during recording and restores it afterwards", async () => {
    mobile = true;
    const { form, native } = fixture("Mic", false);
    form.setAttribute("data-promptbox-voice-active", "");
    await flush();
    expect(document.querySelector(".bb-continue-host")).toBeNull();
    expect(native.hasAttribute("data-bb-continue-secondary-mic")).toBe(false);
    form.removeAttribute("data-promptbox-voice-active");
    await flush();
    expect(document.querySelector(".bb-continue-host")).not.toBeNull();
  });
  it("removes Continue while an upload or submission is busy", async () => {
    const { native } = fixture();
    native.setAttribute("aria-busy", "true");
    await flush();
    expect(document.querySelector(".bb-continue-host")).toBeNull();
  });
  it("does not leak decorations when host controls are replaced", async () => {
    mobile = true;
    const { native, wrapper } = fixture("Mic", false);
    wrapper.replaceChildren();
    const send = document.createElement("button");
    send.setAttribute("data-promptbox-submit-action", "");
    send.disabled = true;
    wrapper.append(send);
    await flush();
    expect(native.hasAttribute("data-bb-continue-secondary-mic")).toBe(false);
    expect(wrapper.hasAttribute("data-bb-continue-hidden")).toBe(true);
  });
  it.each([false, true])("keeps the mic left of Continue after React replaces the primary control (compact=%s)", async (compact) => {
    mobile = true;
    const { wrapper, form } = fixture("Mic", false);
    if (compact) form.setAttribute("data-promptbox-compact", "");
    const group = wrapper.parentElement!;
    const host = group.querySelector<HTMLElement>(".bb-continue-host")!;
    wrapper.remove();
    const replacement = document.createElement("span");
    const microphone = document.createElement("button");
    microphone.type = "button";
    microphone.setAttribute("data-promptbox-submit-action", "");
    microphone.innerHTML = '<svg data-icon="Mic"></svg>';
    replacement.append(microphone);
    group.append(replacement);
    await flush();
    expect(Array.from(group.children)).toEqual([replacement, host]);
    expect(microphone.hasAttribute("data-bb-continue-secondary-mic")).toBe(true);
    expect(group.querySelectorAll(".bb-continue-host")).toHaveLength(1);
    await flush();
    expect(frame).toBeUndefined();
  });
  it("reacts to a change in pointer/viewport mode", async () => {
    mobile = true;
    const { native } = fixture("Mic", false);
    mobile = false;
    change?.();
    await flush();
    expect(native.hasAttribute("data-bb-continue-secondary-mic")).toBe(false);
    expect(document.querySelector(".bb-continue-host")).toBeNull();
  });
  it("fully restores host DOM on disable, including a scheduled frame", async () => {
    const { wrapper, form } = fixture();
    form.setAttribute("data-promptbox-compact", "");
    await Promise.resolve();
    cleanup!();
    cleanup = undefined;
    expect(wrapper.hasAttribute("data-bb-continue-hidden")).toBe(false);
    expect(form.hasAttribute("data-bb-continue-active")).toBe(false);
    expect(document.querySelector(".bb-continue-host")).toBeNull();
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
  });
  it("fails open when the host markup is unavailable", () => {
    const anchor = document.createElement("span");
    document.body.append(anchor);
    const callback = vi.fn();
    cleanup = mountContinuePlacement(anchor, callback);
    expect(callback).not.toHaveBeenCalled();
  });
});
