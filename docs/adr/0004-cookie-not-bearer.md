# Cookie, not Bearer, on one origin

Flue authenticates nothing. The first client is same-origin `useFlueAgent({ url })`, which builds a client with no `token`. Slice 3 is a session cookie plus `instanceIdFor` equality on `/agents/assistant/*`. A second cookie identity gets `403` on the same URL, including `GET /:id/attachments/:attachmentId`.

## Considered Options

- **Bearer-only, `createFlueClient({ token })`.** Rejected. The SDK adds `Authorization` only when `token` is passed. `attachmentUrl()` is a string. An `<img>` never sends Bearer. Later R2 body GETs are the same shape.
- **WorkOS or Cloudflare Access as the v1 product.** Rejected. Access may wrap the hostname later. Hono still maps that identity to a User and does equality. `ctx.access.getIdentity()` is not available on the Slice 6 assets Worker. WorkOS is a later product.
- **Split SPA and Assistant origins in v1.** Rejected. That needs CORS with credentials, a custom `fetch`, and `SameSite=None`. Stay on one origin.

## Consequences

The mount lock is the five conversation routes. Catalog, R2, and `dispatch` are separate ingresses. Hono overwrites Origin on the creating send from the session. A Valibot schema is not authority. Missing or forged cookie is `401`. Do not copy habit-harness’s unsigned default identity or unlocked `/agents/*` mounts.
