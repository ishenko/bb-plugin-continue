---
title: Continue for BB
status: ready
updated: 2026-10-13
tags: [bb-plugin, composer, mobile]
---

# Continue for BB

Fork of [e-simpson/bb-plugin-nudge](https://github.com/e-simpson/bb-plugin-nudge), distributed under the original MIT license.

| Composer | Behavior |
| --- | --- |
| First message / new thread | No Continue button |
| Existing idle or failed thread, empty draft | Continue without a new user bubble |
| Mobile touch viewport below 768px | Large primary Continue; original microphone beside it in its secondary style |
| Desktop | Compact Continue beside the unchanged microphone |
| Typed text, mentions, or attachments | Native Send |
| Running thread or active voice recording | Native Stop / recording controls |
| Queued-message editor | No Continue button |

Expanded and collapsed follow-up composers are supported. The original microphone is not cloned or moved: its recording and voice-preferences handlers stay intact. Plugin removal restores the native controls.

> [!NOTE]
> The placement uses BB's `data-promptbox-*` DOM markers because the public composer API does not provide a primary-action replacement. If those markers disappear, the plugin leaves the native controls alone.

## Install

Disable or remove the original Nudge plugin before installing this fork: both provide `bb nudge`.

```sh
git clone https://github.com/ishenko/bb-plugin-continue.git
cd bb-plugin-continue
npm install --include=dev
npm run build
bb plugin install . --yes
```

## Verify

```sh
npm run typecheck
npm test
npm run build
```

## Command

The original CLI and backend behavior remain compatible:

```sh
bb nudge
bb nudge thr_abc123
bb nudge thr_abc123 --reason "transient provider overload" --json
```

Idle threads receive an agent-only `Please continue.` input. Failed turns retry by reference. Busy threads are refused. An explicit `--message` remains visible, as in the upstream plugin. No additional account or API key is required.
