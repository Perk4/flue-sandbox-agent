# flue-sandbox-agent

A readable Flue-shaped agent. Four calls, one in-memory sandbox, no product UI.

The sandbox is Vercel just-bash plus `InMemoryFs`. `grep` and file reads run in process. They never touch the host disk.

`src/flue.ts` is a stub of `@flue/runtime`. The real package wants a `'use agent'` compiler transform and Node `>=22.19`. This repo is Node 22.14-safe CI, so the stub keeps the same hook names and the test still hits just-bash.

## Four primitives

1. `NotesAgent` in `src/agent.ts`, composed with `useModel`
2. One `defineTool`, `read_note`, mounted with `useTool`
3. `useSandbox` wrapping `Bash` + `InMemoryFs`
4. `src/run.ts --message`, a stub of `flue run --message`

## How to run

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

## How to verify

```bash
npm test
```

The test renders `NotesAgent`, calls the mounted `read_note` tool, and checks that `SANDBOX-ONLY-TOKEN-7f3a` comes from memory while `/notes/secret-token.txt` is absent on the host. It also runs `grep` inside just-bash against the same file.
