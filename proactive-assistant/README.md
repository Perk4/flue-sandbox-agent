# proactive-assistant

A [Flue](https://flueframework.com) agent project.

## Setup

```sh
npm install
```

The Assistant uses Workers AI (`cloudflare/@cf/...`). No provider API key is required.

`flue run` is Node-local and does not prove the Worker mount. Use `vite dev`.

## Develop

```sh
npm run dev
```

The Assistant is served at `http://localhost:5173/agents/assistant`. Send a User turn with a raw POST:

```sh
curl -X POST http://localhost:5173/agents/assistant/dev-1 \
  -H 'content-type: application/json' \
  -d '{"kind":"user","body":"Hello"}'
```

A `202` with `streamUrl`, `offset`, and `submissionId` means the turn was admitted. `npm run check:admission` asserts that.

## Deploy

```sh
npm run deploy
```

## Learn more

- [Flue docs](https://flueframework.com/docs/) — or `npx flue docs` from the terminal.
