---
name: chub-docs
description: >-
  Look up Flue 2.0, Photon, and Spectrum documentation with the chub CLI
  (sometimes called chubb) before answering how-to questions or writing code
  against those APIs. Use when the task involves Flue, @flue/runtime, flue.config,
  'use agent', agent hooks, Cloudflare Durable Objects in Flue, Photon, Spectrum,
  spectrum-ts, iMessage, signed webhooks, or when the user mentions chub, chubb,
  or Context Hub. Fetch with chub instead of guessing from training data.
---

# Chub docs for Flue and Photon

Local Chub sources on this machine hold the current Flue 2.0.3 docs and the Photon/Spectrum docs. `chub` is at `/opt/homebrew/bin/chub`. Docs are TypeScript: always pass `--lang ts`.

This repo's product how-to stays in `plan.md`, `best-practices.md`, and `data-flow.md`. Use chub for framework APIs and limits.

## Loop

1. **Search** until an `id` matches the question.
2. **Get** that id (and a second page if the first is only an overview).
3. **Answer or code from the fetched text.** Treat it as the API.

Done when the answer cites a fetched page, or search plus the catalog (`flue/docs` / `photon/docs`) shows no matching page.

```bash
chub search "<keywords>" --lang ts
chub get <id> --lang ts
```

Prefix `flue/` for Flue, `photon/` for Photon/Spectrum. Source prefix if an id collides: `chub get flue:flue/guide-routing --lang ts`.

## Starting ids

**Flue**

| Question | id |
|---|---|
| Catalog of every Flue page | `flue/docs` |
| `flue.config.ts`, `flue()`, targets | `flue/reference-configuration` |
| Scaffold / first agent | `flue/guide-getting-started` |
| Hooks (`useModel`, `useTool`, `useSkill`, state) | `flue/guide-agent-hooks` |
| Agent function + `'use agent'` | `flue/guide-building-agents` |
| Cloudflare + Durable Objects | `flue/guide-cloudflare-target` |
| Node target | `flue/guide-node-target` |
| `app.ts` routing | `flue/guide-routing` |
| Tools / skills / sandboxes / schedules | `flue/guide-tools`, `flue/guide-skills`, `flue/guide-sandboxes`, `flue/guide-schedules` |
| Hook contract | `flue/reference-agent-hooks-api` |
| Deploy Cloudflare | `flue/ecosystem-deploy-cloudflare` |
| `flue run` / `flue init` | `flue/cli-run`, `flue/cli-init` |

**Photon / Spectrum**

| Question | id |
|---|---|
| Catalog of every Photon page | `photon/docs` |
| Signed webhook deliveries | `photon/webhooks-overview` |
| Register + first delivery | `photon/webhooks-quickstart` |
| Wire format / events | `photon/webhooks-events` |
| HMAC verification | `photon/webhooks-verifying-signatures` |
| Retries / HTTPS rules | `photon/webhooks-delivery` |
| SDK loop vs HTTP | `photon/spectrum-ts-webhooks` |
| Install Spectrum | `photon/spectrum-ts-getting-started` |
| Messages / spaces | `photon/spectrum-ts-messages`, `photon/spectrum-ts-spaces-and-users` |
| iMessage routing | `photon/spectrum-ts-providers-imessage-connection-and-routing` |

Unknown topic: `chub search "<topic>" --lang ts`. Empty results: `chub get flue/docs --lang ts` or `chub get photon/docs --lang ts` and pick the id.

## After the fetch

If you hit a gotcha that is not in the page, save it for later sessions:

```bash
chub annotate <id> "one-line gotcha"
```
