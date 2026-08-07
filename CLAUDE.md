# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An ioBroker adapter that manages Docker containers, images, networks, and volumes from the ioBroker admin UI. It is two separate npm packages in one repo:

- **Backend** (`src/`, TypeScript → `build/`): the adapter daemon, runs under js-controller.
- **Admin frontend** (`src-admin/`, React + Vite → `admin/`): the GUI shown both as a config page and as a dedicated "Docker" admin tab.

`package.json` requires Node >= 22 (CI still runs the test matrix on 20/22/24). The adapter runs in `daemon` mode and supports `compact` mode (see the `module.exports` branch at the bottom of `src/main.ts`).

## Commands

Run from the repo root unless noted:

```bash
npm run npm              # install deps for BOTH root and src-admin (do this after clone)
npm run build            # full build: backend (build:ts) + frontend (build:gui)
npm run build:ts         # backend only: tsc -p tsconfig.build.json (+ a copy-i18n no-op, see below)
npm run build:gui        # frontend only: vite build via tasks.ts, copied into admin/
npm run lint             # ESLint backend (src/ + tasks.ts) — needs type info, so it is slow
npm run lint-frontend    # ESLint frontend (cd src-admin && eslint ...)
npm test                 # mocha --exit (see Testing)
npx tsc -p tsconfig.json         # type-check backend + tasks.ts (root tsconfig has noEmit)
cd src-admin && npm run check-ts # type-check frontend only
```

Frontend dev server (hot reload against a running ioBroker): `cd src-admin && npm start` (`vite --host`). Edit `App.tsx`'s commented-out `extendedProps.socket` block to point at a remote ioBroker host during development.

Releases use `@alcalzone/release-script`: `npm run release-patch` / `release-minor` / `release-major`.

### Testing

There are **no integration or unit tests** despite the script name `test:integration`. `npm test` runs `mocha --exit` with no spec argument and no `.mocharc`, so mocha picks up its default `test/*.js` glob — which is `test/mocha.setup.js` plus `test/package.test.js`. That single test is `@iobroker/legacy-testing/tests/testPackageFiles`, a validator for `io-package.json` / `package.json` consistency. To run just it: `npx mocha test/package.test.js --exit` (identical to `npm run test:package`). If you add real tests, add a `.mocharc` or an explicit spec — the bare `mocha --exit` will otherwise silently pick them up or miss them depending on filename.

## Architecture

### Backend layering

`src/main.ts` (`DockerManagerAdapter extends Adapter`) is thin — it only routes messages and manages GUI subscriptions. All Docker work is delegated to `src/lib/DockerMonitor.ts` (the only file under `src/lib/`).

`DockerMonitor extends DockerManager` from the external **`@iobroker/plugin-docker`** package. That package implements the actual Docker operations (CLI + dockerode/socket + HTTP API, image/container/network/volume lifecycle, `getDockerDaemonInfo`, etc.). `DockerMonitor` exists to:

1. **Override** the mutating operations (`imagePull`, `containerStart/Stop/...`, `imageRemove`, prunes, …) so that after each one it pushes fresh data to the GUI via `adapter.sendToGui(...)`. When changing Docker behavior, check whether the base method in `@iobroker/plugin-docker` already does what you need before adding code here.
2. **Poll** the daemon on 10s `setInterval` timers (`pollingUpdate` + `#pollingInfo/#pollingImages/#pollingContainers/#pollingContainer/#pollingNetworks/#pollingVolumes`), one timer per resource type, created/torn down based on which GUI subscriptions are active. Each timer is also kicked once via a 50ms `setTimeout` so the first update is immediate.
3. Add **one-shot container exec** (`containerExec` / `containerExecTerminate`) and **interactive terminals** (`terminalCreate/Write/Resize/Close`) — see below.
4. Detect the **local IP** reachable from the browser (`findOwnIpFor`, `getIpForDomain`, `isHttpResponse`) so the UI can show working links to container ports.

### Frontend ↔ backend communication

Three distinct channels, all over the ioBroker socket:

**1. Request/response** — UI calls `socket.sendTo('docker-manager.<instance>', '<command>', msg)`; handled by the `switch` in `DockerManagerAdapter.#onMessage`. Commands follow a `resource:action` naming convention: `image:pull`, `image:tags`, `container:create`, `container:stop`, `network:create`, `volume:file`, plus a bare `info`. **To add an operation: add a `case` in `#onMessage` and a method on `DockerMonitor`.** Note `image:tags` is the exception that does not touch `DockerMonitor` at all — it queries the Docker Hub HTTP API directly from `main.ts` (`#listImageTags`).

**2. Subscribe/push** — UI calls `socket.subscribeOnInstance(..., type, { ownIp, ... }, cb)`. The adapter (`onClientSubscribe`) records the subscription by `type` (`info` | `images` | `containers` | `container` | `networks` | `volumes`), then `scanRequests()` aggregates all active subscriptions into a single scan object and calls `pollingUpdate`, which starts/stops the matching polling timers. Updates flow back through `sendToGui` → `sendToUI` → the UI's `onBackendUpdates`. `sendToGui` broadcasts to every subscriber whose recorded `type` matches `data.command` — except when passed an explicit `sid`, which targets exactly one client, and except `command: 'container'`, which additionally matches on the container id.

One-shot exec also rides this channel: a `containers` subscription carrying a `containerId` plus a `command` (start) or `terminate: true` (stop) field.

**3. Interactive terminal** (xterm.js) — also carried on `subscribeOnInstance`, but as a `data.terminal` payload of shape `TerminalRequest` (`create` | `data` | `resize` | `close`). These messages **return early in `onClientSubscribe` and never register a subscription**, so they do not disturb polling. Each GUI `clientId` gets at most one terminal (`DockerMonitor.#terminals[sid]`); output is pushed back with `sendToGui({ command: 'terminal', ... }, sid)` targeted at that client alone. Two transports, chosen by `#getDockerodeForExec()`: the dockerode exec API when a socket/API connection exists (real TTY, `resize` supported), otherwise a `spawn('docker exec -it ...')` fallback (no resize). Frontend side: `src-admin/src/Components/ContainerTerminal.tsx` plus the `terminalCallbacks` map and `onTerminal*` methods in `App.tsx`.

`GUIRequest`/`GUIResponse`/`TerminalRequest` message shapes are defined in `src/types.d.ts`. Domain types (`ContainerInfo`, `ImageInfo`, `NetworkInfo`, `VolumeInfo`, `DockerContainerInspect`, `DiskUsage`, `ContainerConfig`) are imported from `@iobroker/plugin-docker` and shared by both sides. **`src/types.d.ts` and `src-admin/src/types.d.ts` are byte-identical duplicates kept in sync by hand — edit both, and verify with `diff src/types.d.ts src-admin/src/types.d.ts`.**

### Frontend structure

`src-admin/src/App.tsx` (`extends GenericApp` from `@iobroker/gui-components`) owns connection state, the alive/backend-running lifecycle, the subscription refresh loop (`refreshBackendSubscription`, re-subscribes every 60s; faster retries when the backend looks dead), and routes `onBackendUpdates` into per-tab state. One tab per Docker resource under `src-admin/src/Tabs/` (`Info`, `Images`, `Containers`, `Networks`, `Volumes`, `Options`); the container-creation wizard lives in `src-admin/src/Components/CreateContainer/`. Material-UI throughout; i18n via `I18n.t()`.

**`@iobroker/gui-components` v10 replaced `@iobroker/adapter-react-v5` v8** — it is the same library renamed, exporting `GenericApp`, `AdminConnection`, `I18n`, `Utils`, `InfoBox`, `IobTheme`, `ThemeType` under the new name. It also replaced `@foxriver76/iob-component-lib`, whose `IconButton` now lives locally at `src-admin/src/Components/IconButton.tsx`. React is 19 and MUI is 9; `@mui/material` / `@mui/icons-material` are peer deps of gui-components but are imported directly by ~16 files, so they are declared explicitly in `src-admin/package.json`.

Two MUI 9 constraints worth knowing: its `exports` map has **no wildcards and no nested paths**, so `@mui/material/FilledInput/FilledInput` and `@mui/material/colors/blue` are both invalid — use `@mui/material/FilledInput` (or the barrel) and `import { blue } from '@mui/material/colors'`. And React 19 removed `ReactDOM.findDOMNode`; where a ref is passed to a MUI component, MUI forwards it to the DOM node, so `ref.current` is the replacement.

### Build / packaging details (`tasks.ts`)

`tasks.ts` orchestrates the frontend build with `@iobroker/build-tools`: it `npm install`s `src-admin`, runs the Vite build, copies `src-admin/build/**` into `admin/`, then patches `src-admin/build/index.html` and copies it to both `admin/index_m.html` (config page) and `admin/tab_m.html` (admin tab). The numbered scripts `0-clean` … `4-patch` run those stages individually.

It is TypeScript run through **`tsx`** (a devDependency), not compiled — `tsx tasks.ts --build`. `tsx` is used rather than Node's native type stripping because the CI matrix builds on Node 20, which cannot strip types. It is type-checked but never emitted: `tsconfig.json` (`noEmit`, `rootDir: "."`) includes it, while the emitting `tsconfig.build.json` narrows `rootDir` to `./src/` and includes only `src/**/*.ts` — which is what keeps the output flat at `build/main.js`. **Don't move `rootDir` back into the shared base config**, or the backend emits to `build/src/` and `main` breaks.

`build:ts` also invokes `tasks.ts --copy-i18n`, which copies `src/lib/i18n/**` to `build/lib/i18n` — **that source folder does not exist**, so the step is currently a no-op. The backend has no translations; all i18n lives in `src-admin/src/i18n/*.json`. (`build/lib/` still holds stale artifacts from removed source files; the build never prunes it.)

## Conventions

- TypeScript is `strict` with `Node16` module resolution (`import type` for type-only imports; ESM-style imports compiled for Node). Backend lint requires type info via `tsconfig.json`, so `npm run lint` is noticeably slower than the frontend one.
- Class private members use the `#` prefix (e.g. `#dockerMonitor`, `#onMessage`).
- ESLint config is `@iobroker/eslint-config` (`eslint.config.mjs` in both root and `src-admin/`, with `reactConfig` added in the frontend). The root config explicitly ignores `src-admin/`, `admin/`, `build/`, and `test/` — lint the frontend with `npm run lint-frontend`. Prettier comes from the same shared config. The root config uses `projectService` and must **not** also set `project`; the current typescript-eslint rejects both together and fails every file with a parsing error.
- Messages prefixed `dm:` are handled by the ioBroker Device Manager and are intentionally ignored in `#onMessage`.

> Note: `.github/copilot-instructions.md` references a `src/lib/DockerManager.ts` that no longer exists — that logic now lives in the `@iobroker/plugin-docker` dependency, with `DockerMonitor` subclassing it. It also claims `npm test` runs package validation "and" integration tests. Trust this file over the Copilot doc for current structure.
