# Hearthvale — notes for Claude

Discord server → explorable voxel world. npm workspaces: `packages/shared`, `apps/server`, `apps/hearthvale` (the client). See README.md for architecture.

## Commands
- `npm run dev` — server (:3000, tsx watch) + Vite client (:5173, proxies /api /auth /ws)
- `npm run voice` — local LiveKit (`--dev`, devkey/secret)
- `npm run typecheck && npm test && npm run build` — run all three before calling work done
- `http://localhost:5173/?sandbox` — dev-only offline 3D preview (no Discord needed); `&at=<channel>&inside&dist=&pitch=`

## Conventions
- Relative imports inside workspaces use explicit `.ts` extensions.
- Anything both sides need (protocol, schemas, world generation) lives in `packages/shared`; the generator must stay deterministic and slot-based (see its tests) — never make positions depend on channel counts.
- Server never trusts client IDs/permissions: re-check via `PermissionService` (bot-fetched member).
- Never persist Discord message content; only IDs/metadata.
- Client UI is framework-free: build DOM with `h()` from `ui/dom.ts`; never assign user text to `innerHTML` except through `formatDiscord`.
- Voxel geometry goes through `VoxelBuilder` (merged, vertex-coloured); repeated props through `InstancedMesh` in `assets/props.ts`.
