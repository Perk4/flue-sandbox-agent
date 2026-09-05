# Flue 2.0 on Cloudflare

Facts for the Cloudflare target. Build steps live in [plan.md](plan.md). End-to-end data movement lives in [data-flow.md](data-flow.md). Official guides: [Cloudflare target](https://flueframework.com/docs/guide/cloudflare-target/), [Deploy on Cloudflare](https://flueframework.com/docs/ecosystem/deploy/cloudflare/), [Routing](https://flueframework.com/docs/guide/routing/), [Agent Hooks API](https://flueframework.com/docs/reference/agent-hooks-api/).

Flue 2.0 is the current stable release (npm `@flue/runtime@2.0.3` as of this writing). Agents are capitalized functions in `'use agent'` modules. The 1.0 Beta `defineAgent` API is retired.

## Build

Vite owns the build. Plugin order is `plugins: [flue(), cloudflare()]`. The wrong order is an error.

`flue()` scans `'use agent'` modules, generates the Worker entry, and merges bindings into `.flue-vite.wrangler.jsonc`. The Cloudflare plugin owns `vite dev`, `vite build`, and deployable output.

Gitignore `.flue-vite/` and `.flue-vite.wrangler.jsonc`. Flue never writes authored `wrangler.jsonc`.

Minimum `compatibility_date` is `2026-04-01`. Flue validates it at build. For dates on or after `2026-08-04`, `nodejs_compat` is on by default.

`vite dev` runs in workerd. `flue run` is Node-local and fails on `cloudflare:*` imports.

## Agent identity

`export function Assistant()` generates class `FlueAssistantAgent` and binding `env.FLUE_ASSISTANT_AGENT`. An `agentName` static pins the identity if you rename the function.

Renaming the function or `agentName` is a storage-identity change. Moving the mount path is not.

Adding an HTTP-facing agent is three edits: the `'use agent'` module, the `app.ts` mount, and a new migration tag.

## Migrations

Generated agent classes need Durable Object SQLite. Introduce them with `new_sqlite_classes`, not `new_classes`.

Migration history is append-only. Never rewrite or reorder deployed tags. Rename with `renamed_classes`. Remove with `deleted_classes`.

Do not hand-author generated `FLUE_*` bindings. A colliding name is a build error. Declare your own resources only (R2, extra Durable Objects, Queues).

Cloudflare also has a declarative `exports` lifecycle API. It is mutually exclusive with tagged `migrations`. Flue's authored `wrangler.jsonc` still uses tagged `new_sqlite_classes`.

## Routing

`src/app.ts` is the HTTP entry. Mount agents with `createAgentRouter` from `@flue/runtime/routing`:

```ts
app.route('/agents/assistant', createAgentRouter(Assistant));
```

Conversation URL: `{mount}/{conversationId}`. Example: `/agents/assistant/user-123`.

| Route | Purpose |
| --- | --- |
| `POST /:id` | Admit one message. Returns `202`. |
| `GET /:id` | Snapshot, updates, or live stream. |
| `HEAD /:id` | Stream metadata. |
| `POST /:id/abort` | Abort in-flight and queued work. |
| `GET /:id/attachments/:attachmentId` | Attachment bytes. |

Raw POST body is `{ "kind": "user", "body": "..." }`. `@flue/sdk` `send()` wraps that as `{ message: { kind, body } }`.

A registered agent with no mount is still reachable through `dispatch()`.

`cloudflare.ts` may export extra Durable Object classes and a `scheduled` handler. It must not export a default `fetch`. HTTP stays in `app.ts`.

## Admission and recovery

`POST` durably queues the message and returns `202` with `streamUrl`, `offset`, and `submissionId`. The client does not own execution. Disconnect does not cancel work.

After admission, Flue wakes the Durable Object on a zero-delay alarm and runs the full response there. Platform traces attribute the whole response to that invocation.

Direct HTTP prompts and `dispatch()` share one per-conversation queue.

Recovery is conservative. Flue requeues only when it can prove the input was not applied. Uncertain model or tool work is not replayed. An interruption advisory is recorded instead.

Flue stamps `flue_meta` in the Durable Object database. There is no in-place format migration. A rollback to an older format version will not open a newer database.

## Persistence

On Cloudflare there is no `db.ts`. A source-root `db.ts` is rejected at build.

The canonical conversation stream, immutable attachments, and accepted submissions live in the owning Durable Object's SQLite.

Application facts that must survive a restart go in `usePersistentState`. Large blobs go in R2. A SQL row, BLOB, or string in the Durable Object cannot exceed 2 MB.

Paid plan: 10 GB SQLite per object. Free plan: 1 GB per object, 5 GB account total.

The default sandbox filesystem is not durable just because conversation state is. Attach Computer or a container sandbox when files must survive.

## Client protocol

`createFlueClient({ url })` from `@flue/sdk` addresses one conversation. Methods: `send`, `wait`, `history`, `observe`, `abort`, `attachmentUrl`.

`useFlueAgent({ url })` from `@flue/react` wraps the same client. Live transport is SSE, with long-poll as `live: 'long-poll'`. Flue has no chat WebSocket.

Wire parts: `text`, `reasoning`, `dynamic-tool`, `file`. Stream app-specific cards with `useDataWriter(name, { schema })` as `data-*` parts. Tool output for custom UI lives on `dynamic-tool`.

Partial text while streaming is best-effort. The completed canonical assistant message is authoritative.

## Auth

A mounted agent has no built-in authentication. Protect the mount with Hono middleware before `createAgentRouter`. Check both who the caller is and whether that caller owns the conversation id. Ids are caller-chosen path segments.

After admission, Flue uses an internal request. Original headers, cookies, query parameters, and body are not replayed into the Durable Object. Authenticate before admission.

The agent router sets no CORS headers. `vite dev` is permissive on localhost. Production cross-origin callers need CORS that exposes `Stream-Next-Offset`, `Stream-Up-To-Date`, and `Location`.

## Hooks

All hooks come from `@flue/runtime`. Call them only while the agent function renders.

| Hook | Role |
| --- | --- |
| `useModel` | Required, exactly once. Specifier `'provider-id/model-id'`. |
| `useSandbox` | Execution environment. Absent means no filesystem tools. |
| `useTool` | Model-callable tool. |
| `useSkill` | Progressive skill catalog. |
| `useSubagent` | Delegate for the `task` tool. |
| `useInstruction` | Always-on extra instruction text. |
| `usePersistentState` | Durable per-instance JSON state. |
| `useInitialData` | Creation payload, constant for the instance. |
| `useDelivery` | Message currently in front of the model. |
| `useDispatchMessage` | Dispatch bound to this instance. |
| `useDataWriter` | Named client-facing data part. |
| `useMcpConnection` | Remote MCP tools. |
| `useAgentStart` / `useAgentFinish` | Awaited seams around a delivered message. |
| `useResponseStart` / `useResponseFinish` | Synchronous observers of the response. |

There is no `useState`. Durable state is `usePersistentState(name, defaultValue)`.

The agent function returns a string. That string is the base instructions.

Tools use Valibot `input` and `run({ data, harness })`. Optional flags: `harness: true`, `durable: true`. A bare object return from `run` throws. Return a string or `{ output }`.

Skills are a static `SKILL.md` import or `defineSkill(...)`. `useSkill('./file.md')` is invalid. A bare `.md` import is a string. Pass always-on markdown to `useInstruction`.

`useDataWriter` names are part of render identity. Declare the same names on every render.

## Sandbox

Start with no sandbox, or with `useSandbox(bash(() => new Bash({ fs: new InMemoryFs() })))`.

Durable workspace without a container: `flue add sandbox cloudflare-computer`. Import helpers from the generated adapter, not from `@flue/runtime/cloudflare`.

Full Linux: `flue add sandbox cloudflare`, install `@cloudflare/sandbox`, export `Sandbox` from `cloudflare.ts`, wrap with `cloudflareSandbox(getSandbox(env.Sandbox, id))`.

`flue add` prints a markdown blueprint. It does not install packages.

## Scheduling

Flue has no scheduler of its own.

Per-conversation wakes: `export const cloudflare = extend({ base })` from `@flue/runtime/cloudflare`, then Agents SDK `this.schedule()` or `this.scheduleEvery()` inside `onStart`. Do not override `fetch`, `onRequest`, `onFiberRecovered`, or `alarm`. Native SDK callbacks do not receive a Flue harness.

`schedule` and `scheduleEvery` share the Durable Object's one alarm with Flue's response runner. A callback due mid-response fires after that response settles. Delivery is durable. Timeliness is not guaranteed while the agent is busy. `queue()` is not alarm-driven.

Worker-level cron belongs in `cloudflare.ts` `scheduled`. From there, `dispatch(Agent, { id, message })`. Do not add a cron trigger only to call `scheduleEvery`.

Raw Durable Object `setAlarm` holds one timestamp per object, does not repeat, and is at-least-once (up to 6 retries). Make handlers idempotent.

## Models

Workers AI on this target: `useModel('cloudflare/@cf/moonshotai/kimi-k2.6')`. No provider API key. Billing follows the Worker account. `kimi-k2.6` requires Workers Paid or prepaid AI Gateway credits. Default rate limit is 20 requests per minute (50 with prepaid unified billing).

Flue enables AI Gateway for `cloudflare/...` models by default.

Local `wrangler dev` still bills Workers AI inference.

## Voice

`@cloudflare/voice` is a Beta mixin for the Agents SDK **class** `Agent`: `withVoice(Agent)`. It is not a Flue hook. Wrapping a Flue function, or subclassing the generated Flue Durable Object, fights Flue-owned `fetch` and `alarm`.

Voice transport is binary WebSocket PCM, 16 kHz mono 16-bit. Official defaults: `WorkersAIFluxSTT` (`@cf/deepgram/flux`) and `WorkersAITTS` (`@cf/deepgram/aura-1`). Aura-2 exists as `@cf/deepgram/aura-2-en` and `aura-2-es`. A Realtime SFU is optional and a different product. Voice docs state that no SFU is required.

`@cf/openai/whisper-large-v3-turbo` is batch ASR. It is not the `withVoice` streaming path. Its documented outputs are `text`, `segments`, `word_count`, and `vtt`. It does not take OpenAI `word_timestamps` or `timestamp_granularities`. Older `@cf/openai/whisper` documents a `words[]` array.

Published voice-example `first_audio_ms` is about 950 ms. That is STT plus LLM plus TTS, not TTS time-to-first-byte.

Batch transcription as a Flue tool, then `dispatch` of the transcript into `Assistant`, keeps voice off the Flue HTTP stream.

## Limits that affect this app

- Durable Object SQL value: 2 MB
- Paid SQLite per object: 10 GB
- Alarm, cron, and queue-consumer wall time: 15 minutes
- CPU: 30 seconds default, raise with `limits.cpu_ms` (max 5 minutes on Paid). I/O does not count.
- Memory: 128 MB per isolate
- Simultaneous outgoing connections per invocation: 6
- Vectorize: 20 million vectors per index, 1536 dimensions. Writes are not immediately queryable (WAL, median under 30 seconds).
- WebSocket incoming message: 32 MiB
- `getByName` / `idFromName` names above 1024 bytes do not surface on `ctx.id.name`

## Observability

```jsonc
{
	"observability": {
		"enabled": true,
		"traces": { "enabled": true }
	}
}
```

`createCloudflareTracing()` is installed by default on the Cloudflare target. It emits `invoke_agent`, `chat`, and `execute_tool` spans. `@flue/opentelemetry` is a separate package. `tracing: false` in `flue.config.ts` removes agent tracing from the build.
