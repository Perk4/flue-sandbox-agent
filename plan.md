# Build a Flue 2.0 Cloudflare assistant

## What you are building

You are building a proactive assistant for one signed-in user. It runs on Cloudflare Workers as a Flue 2.0 `'use agent'` function. Each conversation is one SQLite Durable Object named `user-${userId}`.

The first client is a small web UI with `@flue/react`. It shows cards from `useDataWriter`. The model never sees those `data-*` parts. The assistant runs the Pi harness. It calls tools with `useTool`, loads skills with `useSkill`, and edits notes.

Notes are markdown in `usePersistentState`. Large bodies move to R2 later. The user creates and edits those notes. The assistant maintains them on later turns and on a schedule. Skills are the predefined capabilities. An imported `SKILL.md` teaches one procedure. Supporting files on that skill hold templates. Templates shape notes for analysis, search, task tracking, and planning so those jobs stay consistent. Style preferences live in `usePersistentState` on this object. Later turns follow how this user likes notes, tasks, and plans to look.

Flue has no scheduler. A per-conversation wake uses `export const cloudflare = extend({ base })`, then Agents SDK `this.scheduleEvery(...)`, then `dispatch(Assistant, { id, message })` a signal into the same conversation. A wake can run with no client `POST`.

This how-to is the work sequence. For hook names, limits, and what not to mix, use [best-practices.md](best-practices.md). For the validated path from client to Durable Object to notes, search, wakes, and later voice, use [data-flow.md](data-flow.md).

Leave live voice, Vectorize, push notifications, and native iOS until the slices below pass.

## Decide identity first

Use the authenticated user id as the conversation id: `user-${userId}`. One human maps to one Durable Object. Notes and preferences stay in that object.

If you later need many threads per user, add a second id scheme and a store that notes can share. Do not start with both.

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

Mount with `createAgentRouter`. The conversation id is the next path segment, not a Hono param on the agent function.

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

Flue does not authenticate. Anyone who can hit a conversation URL can read history, send, and abort.

Put Hono middleware on `/agents/assistant/*` before the router mount. Reject a missing session with `401`. Reject a caller whose user id does not match the conversation id with `403`. Issue ids as `user-${userId}` so ownership is an equality check.

After admission, Flue does not keep the original request headers. Authenticate before the Durable Object runs.

Pass: a second token gets `403` on the same URL.

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

- Store the note list in `usePersistentState`.
- Emit a card with `useDataWriter('note', { schema })`.
- Create and update notes through one Valibot tool (`input` plus `run({ data, harness })`).
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

Add an R2 bucket binding in authored `wrangler.jsonc`. Store bytes at `userId/noteId/version`. Keep title, version, and the R2 key in `usePersistentState`.

Serve downloads through the Worker. Presigned S3 URLs work only on `*.r2.cloudflarestorage.com` and last at most 7 days.

Pass: a note larger than a short markdown string round-trips through R2.

## Slice 8. One scheduled wake

Export `cloudflare = extend({ base })` from the agent module. In `onStart`, call `this.scheduleEvery(...)`. From the callback, `dispatch(Assistant, { id, message })` a signal into the same conversation.

Do not override `fetch`, `onRequest`, `onFiberRecovered`, or `alarm`. Do not add a Worker cron only to reach `scheduleEvery`. A callback that comes due mid-response runs after that response settles. Make the handler idempotent.

Pass: a message appears with no client `POST`. A wake that fires during a turn still lands after the turn.

## Slice 9. Search as a tool

Add `searchRecent` over this user's notes and recent turns. Prefer keyword plus timestamps in the Durable Object.

Add Vectorize only after that search is too slow. Vectorize writes become queryable on a WAL delay (median under 30 seconds). Do not treat Vectorize as the source of truth for the current conversation.

Pass: the agent cites a note it created in an earlier turn.

## Later work

These are new products. Do not start them until slice 6 is boring and correct.

- **Batch voice in.** Transcribe an uploaded clip with Workers AI, then `dispatch` the transcript as a user message into `Assistant`.
- **Live voice.** Use `@cloudflare/voice` `withVoice` on an Agents SDK **class**, not on the Flue function. Official defaults are Flux STT and Aura-1 TTS. PCM is 16 kHz mono on the Agents WebSocket. Do not hang that socket on Flue's SSE client.
- **Native iOS.** One Swift client against the same conversation URL.
- **Push.** Name APNs or Web Push only when a wake must reach a disconnected phone.

## Deploy

```bash
npx vite build
npx wrangler deploy --dry-run
npx wrangler deploy
```

Enable observability in `wrangler.jsonc`. `createCloudflareTracing()` is installed by default on the Cloudflare target. `@flue/opentelemetry` is a separate adapter.

Pin `@flue/*` at 2.0.x. The 1.0 Beta `defineAgent` API is gone. If you copy old snippets, read the [Flue migration guide](https://flueframework.com/docs/guide/migration/).
