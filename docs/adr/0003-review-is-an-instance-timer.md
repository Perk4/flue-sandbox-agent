# Review is an instance timer

Flue has no scheduler. Official schedules docs lead with Worker cron. A Review belongs to one existing Assistant, so we use `extend({ base })`, `scheduleEvery` in `onStart`, and `dispatch` a `kind: 'signal'` `type: 'schedule'` message. Chat `POST /agents/assistant/:id` accepts only `kind: 'user'`. A signal on that mount is `400`, not `403`.

## Considered Options

- **Worker cron only to reach `scheduleEvery`.** Rejected. Cron addresses or creates instances from outside. It cannot enumerate `user-*` objects. Official Cloudflare target forbids adding cron just to unlock the instance timer.
- **Allow HTTP signals and treat `scheduledAt` as a fire.** Rejected. The owner already passed equality. A forged schedule is not a stranger. It is how the next engineer copies official schedule POSTs and believes a backend fire happened. `useDelivery()` is transport-agnostic after admission.
- **Create-only Review, or mute the User after a join.** Rejected. The Assistant maintains Notes. Prefer a new Note. Updates are allowed. After a User joins, stop that look and answer. Do not unmount `upsertNote` on the cursor flip.

## Consequences

The product pass is a Note write or silence, not “a message appeared.” A no-op writes no Card and no assistant text. Chat skips `display !== 'visible'` and empty assistant rows. The notes panel scans all messages for the latest `data-note`. Stop kills unsettled work on the instance and does not cancel `heartbeat`. `lastScheduleAt` is fire dedupe. It is not a Note change and not proof of origin. `scheduledAt` is not authority.
