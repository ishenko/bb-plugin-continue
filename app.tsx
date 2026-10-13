import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  definePluginApp,
  experimental_Icon as Icon,
  useComposer,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import type { rpcContract } from "./server";
import { mountContinuePlacement } from "./placement";
import "./app.css";

export function ContinueControl() {
  const composer = useComposer();
  const rpc = useRpc<typeof rpcContract>();
  const anchor = useRef<HTMLSpanElement>(null);
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const threadId = composer.scope.kind === "thread" ? composer.scope.threadId : null;
  const eligible = threadId !== null && composer.isEmpty && !composer.isRunning && !composer.isSubmitting;

  useLayoutEffect(() => {
    if (!eligible || !anchor.current) return;
    return mountContinuePlacement(anchor.current, setHost);
  }, [eligible, composer.key]);

  const onClick = async () => {
    if (inFlight.current || !eligible || !threadId) return;
    inFlight.current = true;
    setPending(true);
    try {
      await rpc.call("nudge", { threadId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  return (
    <>
      <span hidden ref={anchor} data-bb-continue-anchor="" />
      {eligible && host ? createPortal(
        <button
          type="button"
          className="bb-continue-button"
          aria-label="Continue"
          title="Continue"
          aria-busy={pending}
          disabled={pending}
          onPointerDown={(event) => {
            if (event.button === 0) event.preventDefault();
          }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClick}
        >
          <Icon name={pending ? "LoaderCircle" : "Play"} className={pending ? "animate-spin" : undefined} />
        </button>, host,
      ) : null}
    </>
  );
}

export default definePluginApp((app) => {
  app.composer.customize({
    id: "continue",
    scopes: ["thread"],
    // Banners stay mounted when the mobile composer collapses; actions do not.
    banners: [{ id: "continue-control", chrome: "bare", component: ContinueControl }],
  });
});
