# flue-sandbox-agent

This repo has two layers.

**Code today** is a local Flue-shaped stub. `src/flue.ts` copies a few `@flue/runtime` hook names so tests can run on Node 22.14. The sandbox is `just-bash` plus `InMemoryFs`. Nothing here is a Cloudflare Worker.

**The product to build** is a Flue 2.0 agent on Cloudflare Workers. Each conversation is one Durable Object. Chat uses HTTP admission and SSE or long-poll. Artifacts live in `usePersistentState` and R2. Follow [plan.md](plan.md). Look up APIs and limits in [best-practices.md](best-practices.md). How data moves is in [data-flow.md](data-flow.md).

Do not grow `src/flue.ts` into that product. Scaffold a real Flue app with `@flue/cli` on Node 22.19 or newer.

## Run the stub

```bash
npm install
npm run run -- --message "read /notes/todo.txt"
```

You should see the in-memory `/notes/todo.txt` body:

```
buy milk
ship the flue agent
```

If the message names another `/notes/...` path, the runner passes that path to `read_note`. Otherwise it reads `/notes/todo.txt`.

## Verify the stub

```bash
npm test
```

The test renders `NotesAgent`, calls `read_note`, and checks that `SANDBOX-ONLY-TOKEN-7f3a` comes from memory while `/notes/secret-token.txt` is absent on the host.
