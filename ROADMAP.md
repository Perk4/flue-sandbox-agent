# flue-sandbox-agent roadmap

Standing Flue sandbox harness for app-specific agents + easy deploy.
Not a one-shot teach anymore — graduate path from the YouTube Hobby Bot example.

## North star

- Real Flue runtime (`'use agent'`, Node ≥22.19) — replace the stub in `src/flue.ts`.
- Use-case-specific harness pattern (different apps plug in tools/sandbox).
- Dual deploy: container path + Cloudflare Workers one-script deploy.

## How we track work

- **Phases + intent:** this file.
- **Active phase only:** GitHub Issues on this repo (link the NOW issue below).
- No Linear for YouTube Hobby.

## Human gate (current)

- [ ] Perk reviews / tests / merges [PR #1](https://github.com/Perk4/flue-sandbox-agent/pull/1) + docs.
- Builder stays idle until that merge.

## Builder order (post-merge)

Locked unless Perk overrides: **A → C → B → D**.

| Phase | Title | Status | Issue |
|-------|--------|--------|-------|
| A | Real `@flue/runtime` + Node ≥22.19 CI | queued | _open after merge_ |
| C | Cloudflare Workers one-script deploy | queued | |
| B | Container deploy setup | queued | |
| D | Multi-app harness scaffold (reusable) | queued | |

### Phase A — Real Flue
Swap stub → real `@flue/runtime`, enable `'use agent'`, bump CI/runtime to Node ≥22.19. Keep NotesAgent + just-bash tests green.

### Phase C — Workers deploy
One script / wrangler path so this harness deploys to Cloudflare Workers easily (Workers path, not as a container).

### Phase B — Container deploy
Container deploy setup for environments that need a real sandbox beyond in-memory just-bash.

### Phase D — Multi-app harness
Extract the reusable pattern so different apps get a use-case-specific harness without copying the whole teach repo.

## NOW

_Until PR #1 merges: no Builder NOW. After merge: open GitHub Issue for Phase A and link it here._
