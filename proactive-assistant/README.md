# proactive-assistant

A [Flue](https://flueframework.com) agent project.

## Setup

```sh
npm install
```

The Assistant uses Workers AI (`cloudflare/@cf/...`). No provider API key is required.

`flue run` is Node-local and does not prove the Worker mount. Use `vite dev`.

Copy a long random string into `.dev.vars` as `SESSION_SECRET=...`. That file is gitignored.

The first client is a same-origin page. Sign in, then send a message. `useFlueAgent({ url })` uses the session cookie; there is no Bearer token and no CORS.

```sh
npm run dev
```

Open http://localhost:5173, sign in as `alice`, and send a message. Chat shows visible User and Assistant text. The notes panel reads the latest catalog-shaped `data-note` Card, not the last reply.

`/agents/*` is in `assets.run_worker_first` so the SPA fallback does not swallow admission.

## Sign in

`POST /session` with `{ "userId": "alice" }` sets an HttpOnly `session` cookie. SameSite is Strict. Path is `/`. The body is `{ "address": "user-alice" }`.

```sh
curl -c cookies.txt -X POST http://localhost:5173/session \
  -H 'content-type: application/json' \
  -d '{"userId":"alice"}'
```

Send a User turn to that address. Raw POST is `{ "kind", "body" }`. Do not send the SDK `{ "message" }` envelope.

```sh
curl -b cookies.txt -X POST http://localhost:5173/agents/assistant/user-alice \
  -H 'content-type: application/json' \
  -d '{"kind":"user","body":"Hello"}'
```

A missing or forged cookie is `401`. A cookie for another User on this URL is `403`. `Secure` is set only on `https:`.

A `202` with `streamUrl`, `offset`, and `submissionId` means the turn was admitted. `npm run check:signed-in` signs in and asserts that lock.

The Assistant stores the Notebook in durable instance state. One tool, `upsertNote`, creates or updates a Note. A create or update stamps the full Notebook as a `data-note` Card. Style is Instruction. Skills for analysis, search write-up, task tracking, and planning load when the job matches.

## Develop

```sh
npm run dev
```

## Deploy

Put `SESSION_SECRET` on the Worker, then deploy.

```sh
npx wrangler secret put SESSION_SECRET
npm run deploy
```

## Learn more

- [Flue docs](https://flueframework.com/docs/), or `npx flue docs` from the terminal.
