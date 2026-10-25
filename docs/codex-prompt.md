# Prompt for Codex

Paste everything below the line into Codex, run from the `omnisupport` repo root on a new branch.

---

You are building the character renderer for Clippet, a macOS desktop companion made with Electron, TypeScript, and Three.js. The Electron shell, screen capture, speech bubble, and agent loop already exist and are owned by someone else. Your work is limited to one folder.

Read these files first, in this order:

1. `docs/companion-protocol.md` — the contract between the Electron main process and your renderer. Every command and event in it must be implemented exactly. If something in it is unworkable, say so and propose a change, but do not change it silently.
2. `docs/codex-brief.md` — what to build, the constraints, and what "done" means.
3. `src/renderer/companion/index.ts` — the current placeholder. It implements the protocol with a procedural capsule character. Keep its protocol handling (hover → click-through, drag, moveTo, lookAt, states, reactions, idle frame rate) and replace the character with a real renderer. The `hover` event is what makes the desktop window click-through everywhere except on the body, so it must keep working exactly as it does now.
4. `src/shared/protocol.ts` — the TypeScript types for the protocol. Import from `@shared/protocol`; do not redefine them.

Scope:

- Edit only `src/renderer/companion/**`. Do not touch `src/main/`, `src/preload/`, `src/renderer/bubble/`, `src/renderer/picker/`, or `docs/companion-protocol.md`.
- Load the GLB from `config.modelUrl` with `GLTFLoader`. Support both a static unrigged mesh (fall back to procedural motion for every state and reaction) and a Mixamo-rigged mesh with the clips named in the protocol (use `AnimationMixer`, crossfade loops, overlay one-shot reactions, drive `mixamorig:Head`/`Neck`/`Spine1` for `lookAt`). Missing clips fall back to procedural motion, never to a frozen pose.
- Orthographic camera in canvas pixels, transparent canvas, shadow catcher under the feet, nothing visible outside the body.
- Build a dev harness at `src/renderer/companion/dev/index.html` that fakes `window.clippet` with buttons for every command and a toggle between a placeholder GLB and a rigged GLB, so the renderer can be tested in a plain browser with `npx vite src/renderer/companion/dev`.
- There is no GLB in `assets/` yet. Use any small humanoid GLB you can generate or find for development, but do not commit model files larger than 2 MB; the real asset arrives later as `assets/clippet.glb`.

Verify before finishing: `npm run typecheck` and `npm run build` pass; the dev harness shows a visibly different motion for every state and reaction on both model types; `hover` fires only on change, with no flicker when the pointer skims the body edge; walking across a 1440 px display takes at most 1.2 s and lands exactly on the requested point.

Deliver a single commit on your branch with a short summary of what is procedural versus clip-driven and anything in the protocol you want changed.
