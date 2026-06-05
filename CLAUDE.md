# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An ioBroker adapter that manages Docker containers, images, networks, and volumes from the ioBroker admin UI. It is two separate npm packages in one repo:

- **Backend** (`src/`, TypeScript → `build/`): the adapter daemon, runs under js-controller.
- **Admin frontend** (`src-admin/`, React + Vite → `admin/`): the GUI shown both as a config page and as a dedicated "Docker" admin tab.

Node >= 20 required. The adapter runs in `daemon` mode and supports `compact` mode (see `module.exports` branch at the bottom of `src/main.ts`).

## Commands

Run from the repo root unless noted:

```bash
npm run npm              # install deps for BOTH root and src-admin (do this after clone)
npm run build            # full build: backend (build:ts) + frontend (build:gui)
npm run build:ts         # backend only: tsc -p tsconfig.build.json + copy i18n
npm run build:gui        # frontend only: vite build via tasks.js, copied into admin/
npm run lint             # ESLint backend (src/)
npm run lint-frontend    # ESLint frontend (cd src-admin && eslint ...)
npm test                 # integration + package validation tests (mocha)
npm run test:package     # just the io-package.json / package.json validation test
```

Frontend dev server (hot reload against a running ioBroker): `cd src-admin && npm start` (`vite --host`). Edit `App.tsx`'s commented-out `extendedProps.socket` block to point at a remote ioBroker host during development.

Releases use `@alcalzone/release-script`: `npm run release-patch` / `release-minor` / `release-major`.

## Architecture

### Backend layering

`src/main.ts` (`DockerManagerAdapter extends Adapter`) is thin — it only routes messages and manages GUI subscriptions. All Docker work is delegated to `src/lib/DockerMonitor.ts`.

`DockerMonitor extends DockerManager` from the external **`@iobroker/plugin-docker`** package. That package implements the actual Docker operations (CLI + dockerode/socket + HTTP API, image/container/network/volume lifecycle, `getDockerDaemonInfo`, etc.). `DockerMonitor` exists to:

1. **Override** the mutating operations (`imagePull`, `containerStart/Stop/...`, `imageRemove`, prunes, …) so that after each one it pushes fresh data to the GUI via `adapter.sendToGui(...)`. When changing Docker behavior, check whether the base method in `@iobroker/plugin-docker` already does what you need before adding code here.
2. **Poll** the daemon on 10s `setInterval` timers (`pollingUpdate` + `#pollingInfo/#pollingImages/#pollingContainers/...`), one timer per resource type, created/torn down based on which GUI subscriptions are active.
3. Add **interactive container exec** (`containerExec` / `containerExecTerminate`) by `spawn()`-ing the Docker CLI and streaming output back per client.
4. Detect the **local IP** reachable from the browser (`findOwnIpFor`, `getIpForDomain`, `isHttpResponse`) so the UI can show working links to container ports.

### Frontend ↔ backend communication

Two distinct channels, both over the ioBroker socket:

- **Request/response** — UI calls `socket.sendTo('docker-manager.<instance>', '<command>', msg)`; handled by the `switch` in `DockerManagerAdapter.#onMessage`. Commands follow a `resource:action` naming convention: `image:pull`, `image:tags`, `container:create`, `container:stop`, `network:create`, `volume:file`, plus a bare `info`. **To add an operation: add a `case` in `#onMessage` and a method on `DockerMonitor`.**
- **Subscribe/push** — UI calls `socket.subscribeOnInstance(..., type, { ownIp }, cb)`. The adapter (`onClientSubscribe`) records the subscription by `type` (`info` | `images` | `containers` | `container` | `networks` | `volumes`), then `scanRequests()` aggregates all active subscriptions into a single scan object and calls `pollingUpdate`, which starts/stops the matching polling timers. Updates flow back through `sendToGui` → `sendToUI` → the UI's `onBackendUpdates`. Interactive exec also rides this channel (a `containers` subscription carrying a `command`/`terminate` field).

`GUIRequest`/`GUIResponse` message shapes are defined in `src/types.d.ts`. Domain types (`ContainerInfo`, `ImageInfo`, `NetworkInfo`, `VolumeInfo`, `DockerContainerInspect`, `DiskUsage`, `ContainerConfig`) are imported from `@iobroker/plugin-docker` and shared by both backend and frontend — there is one copy of `types.d.ts` per side, kept in sync by hand.

### Frontend structure

`src-admin/src/App.tsx` (`extends GenericApp` from `@iobroker/adapter-react-v5`) owns connection state, the alive/backend-running lifecycle, the subscription refresh loop (`refreshBackendSubscription`, re-subscribes every 60s; faster retries when the backend looks dead), and routes `onBackendUpdates` into per-tab state. One tab per Docker resource under `src-admin/src/Tabs/` (`Info`, `Images`, `Containers`, `Networks`, `Volumes`, `Options`); the container-creation wizard lives in `src-admin/src/Components/CreateContainer/`. Material-UI throughout; i18n via `I18n.t()`.

### Build / packaging details (`tasks.js`)

`tasks.js` orchestrates the frontend build with `@iobroker/build-tools`: it `npm install`s `src-admin`, runs the Vite build, copies `src-admin/build/**` into `admin/`, then patches `src-admin/build/index.html` and copies it to both `admin/index_m.html` (config page) and `admin/tab_m.html` (admin tab). Backend i18n is copied from `src/lib/i18n/` to `build/lib/i18n` by `build:ts --copy-i18n`. Frontend i18n lives separately in `src-admin/src/i18n/*.json`.

## Conventions

- TypeScript is `strict` with `Node16` module resolution (`import type` for type-only imports; ESM-style imports compiled for Node). Backend lint requires type info via `tsconfig.json`.
- Class private members use the `#` prefix (e.g. `#dockerMonitor`, `#onMessage`).
- ESLint config is `@iobroker/eslint-config` (`eslint.config.mjs` in both root and `src-admin/`). The root config explicitly ignores `src-admin/`, `admin/`, `build/`, and `tasks.js` — lint the frontend with `npm run lint-frontend`.
- Messages prefixed `dm:` are handled by the ioBroker Device Manager and are intentionally ignored in `#onMessage`.

> Note: `.github/copilot-instructions.md` references a `src/lib/DockerManager.ts` that no longer exists — that logic now lives in the `@iobroker/plugin-docker` dependency, with `DockerMonitor` subclassing it. Trust this file over the Copilot doc for current structure.
