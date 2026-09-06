# Build a Flue 2.0 Cloudflare Assistant

## What you are building

You are building a proactive Assistant for one signed-in User. It runs on Cloudflare Workers as a Flue 2.0 `'use agent'` function. There is one Assistant instance per User. Name the Durable Object with `instanceIdFor(userId)`, which returns `user-${userId}`. That string is an address. Origin is `initialData.userId` from the creating send.

The first client is a small web UI with `@flue/react`. It shows Cards from `useDataWriter`. The model never sees those `data-*` parts. The Assistant runs the Pi harness. It calls tools with `useTool`, loads skills with `useSkill`, and edits Notes.

Notes are markdown in `usePersistentState`. Large bodies move to R2 later. The User creates and edits those Notes. The Assistant maintains them on later turns and on a Review. Skills are the predefined capabilities. An imported `SKILL.md` teaches one procedure. Supporting files on that skill hold templates. Templates shape Notes for analysis, search, task tracking, and planning so those jobs stay consistent. Style lives in Instruction. There is no prefs key.

Flue has no scheduler. A Review uses `export const cloudflare = extend({ base })`, then Agents SDK `this.scheduleEvery(...)`, then `dispatch(Assistant, { id, message })` a signal into the same Assistant instance. A Review can run with no client `POST`.

This how-to is the work sequence. For hook names, limits, and what not to mix, use [best-practices.md](best-practices.md). For the validated path from client to Durable Object to Notes, search, Review, and later voice, use [data-flow.md](data-flow.md).

Leave live voice, Vectorize, push notifications, and native iOS until the slices below pass.

## Decide identity first

Derive the instance address with `instanceIdFor` from the session User. The result is `user-${userId}`. One User maps to one Assistant instance. Notes stay in that object.

If you later need many threads per User, add a second id scheme and a store that Notes can share. Do not start with both.

## Prerequisites

- Node.js 22.19 or newer (`@flue/cli` and `@flue/runtime` require it)
- A Cloudflare account
- A Workers Paid plan, or AI Gateway credits, if you use `kimi-k2.6`

Scaffold in a new directory. Keep this stub repo for hook-shape experiments if you want. Do not turn `src/flue.ts` into the Worker.

## Slice 1. Scaffold the Cloudflare app

```bash
npx @flue/cli init proactive-assistant --target cloudflare
cd proactive-assistant
npm install
```

`flue init` writes files. It does not install packages.

Confirm `vite.config.ts` lists `flue()` before `cloudflare()`. Confirm there is no source-root `db.ts`. Add `.flue-vite/` and `.flue-vite.wrangler.jsonc` to `.gitignore` if they are missing.

```bash
npx vite dev
```

Pass: the scaffolded hello agent answers at its mount URL.

## Slice 2. Mount Assistant

Replace the hello agent with `Assistant`. The function must return instruction text.

```ts
'use agent';
import { type AgentProps, useModel } from '@flue/runtime';

export function Assistant(_props: AgentProps): string {
	useModel('cloudflare/@cf/moonshotai/kimi-k2.6');
	return 'You keep notes for this user. Prefer short replies.';
}
```

Until Workers AI billing is on, use a cheaper `@cf` model. `kimi-k2.6` is 20 requests per minute by default.

Mount with `createAgentRouter`. The instance address is the next path segment, not a Hono param on the agent function.

```ts
import { createAgentRouter } from '@flue/runtime/routing';
import { Hono } from 'hono';
import { Assistant } from './agents/assistant.ts';

const app = new Hono();
app.route('/agents/assistant', createAgentRouter(Assistant));
export default app;
```

In authored `wrangler.jsonc`, append a uniquely tagged migration. Do not hand-author `FLUE_*` bindings.

```jsonc
{
	"name": "proactive-assistant",
	"compatibility_date": "2026-09-01",
	"migrations": [
		{ "tag": "v1", "new_sqlite_classes": ["FlueAssistantAgent"] }
	]
}
```

`nodejs_compat` is already the default for this compatibility date. You may still list the flag.

Pass: `POST /agents/assistant/dev-1` with body `{ "kind": "user", "body": "Hello" }` returns `202` and a `streamUrl`, `offset`, and `submissionId`.

## Slice 3. Authenticate before admission

Flue does not authenticate. Anyone who can hit the Assistant URL can read history, send, and abort.

Put Hono middleware on `/agents/assistant/*` before the router mount. Reject a missing session cookie with `401`. Reject a caller whose session User does not match `instanceIdFor` with `403`. Issue addresses as `instanceIdFor(userId)`. The function returns `user-${userId}`. Ownership is an equality check.

After admission, Flue does not keep the original request headers. Authenticate before the Durable Object runs.

On the creating send, stamp Origin as `initialData.userId` from the session. Do not parse the instance name.

Reject `kind: 'signal'` on `POST /agents/assistant/:id` with `400`. Session and id stay the ownership check. Body kind is a second admission rule.

Pass: a second cookie identity gets `403` on the same URL, including `GET /:id/attachments/:attachmentId`.

## Slice 4. Replay with the official client

Use `@flue/sdk`. The URL is the whole contract.

```ts
import { createFlueClient } from '@flue/sdk';

const conversation = createFlueClient({
	url: '/agents/assistant/user-123',
	token,
});

const admission = await conversation.send({
	message: { kind: 'user', body: 'Hello' },
});
await conversation.wait(admission);
const { messages } = await conversation.history();
```

Raw HTTP `POST` uses `{ kind, body }`. The SDK wraps that as `{ message: { kind, body } }`. Do not send the SDK envelope as the raw body.

Live updates default to SSE and fall back to long-poll. There is no Flue chat WebSocket.

Pass: you see the model reply after reconnect, not only on the submitting connection.

## Slice 5. One artifact type

Ship markdown notes only. No charts, dashboards, or search indexes.

- Store the Notebook in `usePersistentState`.
- Emit a Card with `useDataWriter('note', { schema })`.
- Create and update Notes through one Valibot tool (`input` plus `run({ data, harness })`).
- Import a `SKILL.md` module and pass it to `useSkill`, or fold always-on style into `useInstruction`.

Do not invent wire parts named `artifact` or `suggestion`. Flue emits `text`, `reasoning`, `dynamic-tool`, and `file`, plus `data-*` writers.

Keep note bodies in persistent state while they stay small. A Durable Object SQL value cannot exceed 2 MB. Move large bodies to R2 in slice 7.

Pass: a second turn lists the same note after a Worker restart.

## Slice 6. Web UI

Add a page that calls `useFlueAgent({ url })` from `@flue/react`. Render `text` parts and the `note` data part as a card.

Same-origin needs no CORS. If a separate origin calls the agent, set CORS yourself and expose `Stream-Next-Offset`, `Stream-Up-To-Date`, and `Location`.

If one Worker serves the UI and the agent, put `/agents/*` in `assets.run_worker_first` so the SPA fallback does not swallow admission.

Pass: a browser sends a message, sees the stream, and opens the note card.

## Slice 7. R2 for large note bodies

Leave this slice until a catalog write, or the Card that copies it, would strain 2 MB. Stay on inlined `body` until then.

When it lands, add an R2 bucket binding in authored `wrangler.jsonc`. Put bytes first at `userId/noteId/version`. `userId` is Origin from `useInitialData()`, not a name parse. Then point the Note with `body` XOR `{ version, r2Key }`. Write a non-empty `excerpt` in the same offload. Use `durable: true` and `step.do` for the put. Call `setNotes` after the put so a crash before the batch commits still replays the pointer.

Serve one object through a cookie-authenticated Worker GET. Prefix comes from the session, not a client `userId`. Do not add a Notebook list GET. Presigned S3 URLs work only on `*.r2.cloudflarestorage.com` and last at most 7 days.

Pass: a Note larger than a short markdown string round-trips through R2, and a later search cites it from `excerpt`.

## Slice 8. One scheduled Review

Export `cloudflare = extend({ base })` from the agent module. In `onStart`, call `this.scheduleEvery(...)`. From the callback, `dispatch(Assistant, { id, message })` a signal into the same Assistant instance.

Do not override `fetch`, `onRequest`, `onFiberRecovered`, or `alarm`. Do not add a Worker cron only to reach `scheduleEvery`. A callback that comes due mid-response runs after that response settles. Make the handler idempotent.

Pass: a Review with no client `POST` writes a Note, or stays silent. Chat shows no assistant text on a no-op. A Review that fires during a turn still lands after the turn.

## Slice 9. Search as a tool

Add `searchRecent` as a TypeScript filter over this User's Notebook. Recency is `updatedAt` on Notes. Do not scan recent turns.

Add Vectorize only after that search is too slow. Vectorize writes become queryable on a WAL delay (median under 30 seconds). Do not treat Vectorize as the source of truth for the Notebook.

Pass: after an earlier turn's Note has left the prompt, the Assistant cites `{ id, title, updatedAt }` from `searchRecent`.

## Later work

These are new products. Do not start them until slice 6 is boring and correct.

- **Batch voice in.** Transcribe an uploaded clip with Workers AI, then `dispatch` the transcript as a user message into `Assistant`.
- **Live voice.** Use `@cloudflare/voice` `withVoice` on an Agents SDK **class**, not on the Flue function. Official defaults are Flux STT and Aura-1 TTS. PCM is 16 kHz mono on the Agents WebSocket. Do not hang that socket on Flue's SSE client.
- **Native iOS.** One Swift client against the same Assistant URL.
- **Push.** Name APNs or Web Push only when a Review must reach a disconnected phone.

## Deploy

```bash
npx vite build
npx wrangler deploy --dry-run
npx wrangler deploy
```

Enable observability in `wrangler.jsonc`. `createCloudflareTracing()` is installed by default on the Cloudflare target. `@flue/opentelemetry` is a separate adapter.

Pin `@flue/*` at 2.0.x. The 1.0 Beta `defineAgent` API is gone. If you copy old snippets, read the [Flue migration guide](https://flueframework.com/docs/guide/migration/).
