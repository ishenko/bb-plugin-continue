const HIDDEN = "data-bb-continue-hidden";
const SECONDARY_MIC = "data-bb-continue-secondary-mic";
const ACTIVE = "data-bb-continue-active";
export const MOBILE_QUERY = "(max-width: 767px) and (pointer: coarse)";

// Never reparent host-owned React nodes: decorate the original microphone and
// add a plugin-owned portal beside it, retaining voice handlers and preferences.
export function mountContinuePlacement(
  anchor: HTMLElement,
  onHost: (host: HTMLElement | null) => void,
): () => void {
  const doc = anchor.ownerDocument;
  const win = doc.defaultView!;
  const media = win.matchMedia(MOBILE_QUERY);
  const host = doc.createElement("span");
  host.className = "bb-continue-host";
  const attributes = new Map<HTMLElement, Map<string, string | null>>();
  let frame: number | null = null;
  let disposed = false;
  let mounted = false;

  const restore = () => {
    for (const [element, values] of attributes) {
      for (const [name, value] of values) {
        if (value === null) element.removeAttribute(name);
        else element.setAttribute(name, value);
      }
    }
    attributes.clear();
  };
  const mark = (element: HTMLElement, name: string) => {
    let values = attributes.get(element);
    if (!values) {
      values = new Map();
      attributes.set(element, values);
    }
    if (!values.has(name)) values.set(name, element.getAttribute(name));
    if (!element.hasAttribute(name)) element.setAttribute(name, "");
  };
  const detach = () => {
    restore();
    host.remove();
    if (mounted) {
      mounted = false;
      onHost(null);
    }
  };
  const sync = () => {
    if (disposed) return;
    const shell = anchor.closest("[data-promptbox-shell]");
    const form = shell?.querySelector<HTMLElement>("[data-promptbox]");
    const group = form?.querySelector<HTMLElement>("[data-promptbox-submit-group]");
    const native = group?.querySelector<HTMLButtonElement>("button[data-promptbox-submit-action]");
    const voice = !!native?.querySelector('[data-icon="Mic"]');
    const stop = native?.querySelector('[data-icon="Square"]');
    const row = group?.closest("[data-promptbox-standard-actions]");
    if (!form || !group || !native || stop || row?.hasAttribute("inert") ||
        form.hasAttribute("data-promptbox-voice-active") || native.getAttribute("aria-busy") === "true" ||
        (voice ? !media.matches || native.disabled : !native.disabled)) {
      detach();
      return;
    }
    // Reconcile replaced host controls without leaking attributes to old nodes.
    for (const [element, values] of attributes) {
      const keep = element === form || (voice ? element === native : group.contains(element));
      if (!keep) {
        for (const [name, value] of values) {
          if (value === null) element.removeAttribute(name);
          else element.setAttribute(name, value);
        }
        attributes.delete(element);
      }
    }
    mark(form, ACTIVE);
    if (voice) {
      mark(native, SECONDARY_MIC);
    } else {
      const sendChrome = native.closest<HTMLElement>("[data-promptbox-send-menu]") ?? native.parentElement!;
      mark(sendChrome, HIDDEN);
    }
    if (host.parentElement !== group) group.append(host);
    if (!mounted) {
      mounted = true;
      onHost(host);
    }
  };
  const schedule = () => {
    if (disposed || frame !== null) return;
    frame = win.requestAnimationFrame(() => {
      frame = null;
      sync();
    });
  };
  const observer = new win.MutationObserver(schedule);
  const shell = anchor.closest("[data-promptbox-shell]");
  if (shell) observer.observe(shell, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["disabled", "inert", "aria-busy", "data-promptbox-voice-active", "data-promptbox-compact"],
  });
  media.addEventListener("change", schedule);
  sync();
  return () => {
    disposed = true;
    observer.disconnect();
    media.removeEventListener("change", schedule);
    if (frame !== null) win.cancelAnimationFrame(frame);
    detach();
  };
}
