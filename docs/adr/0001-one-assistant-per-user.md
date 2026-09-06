# One Assistant per User

Flue lets a conversation id be a user, a ticket, or a daily job. This product has one signed-in human. We derive one Assistant address with `instanceIdFor(userId)`, which returns `user-${userId}`, and we record Origin as `initialData.userId` on the creating send. The path string is an address. It is not the User, and it is not a Flue export.

## Considered Options

- **Treat User and Conversation as the same type.** Rejected. Official Flue uses conversation id as an address you may derive from a user. Collapsing them traps Notes, Stop, Review, and search in a chat noun and makes a later thread scheme a rename of the person.
- **Caller-chosen ids plus a lookup table.** Rejected for v1. That is the second scheme. It needs a store and the same check on every `dispatch` that skips Hono.
- **Parse `user-` off the instance name after admission.** Rejected. Official docs allow encoding one fact in the id and still tell you to pass structured facts as `initialData`. A missing Origin means the stamper was skipped. Fail closed. A parse hides a bad `dispatch({ id })` and, after Slice 7, can write another User’s R2 prefix.

## Consequences

Hono, the client URL, and every `dispatch` call `instanceIdFor`. Tools close over Origin from `useInitialData()`. Heartbeat dispatches the instance name, never the raw User. `best-practices.md` may still say “conversation URL.” That is Flue’s path name, not a product type.
