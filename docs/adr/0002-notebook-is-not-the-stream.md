# Notebook is not the stream

Flue keeps instance JSON, client `data-*` parts, and sandbox files. Only `usePersistentState` is the Notebook. A Card is a picture stamped after a Note is created or updated. Chat history is not the Notebook.

## Considered Options

- **Hydrate the Notebook from `history()` or leftover Cards.** Rejected. Compaction in Flue 2.0.3 shortens the model prompt and does not drop older Cards, but an old Card is that turn’s stamp. A later edit does not patch it. A panel keyed off the last assistant message blanks on a silent Review.
- **Always write a full-catalog Card, including no-op Reviews, and treat that as reload source of truth.** Rejected. A no-op Review writes no Card. Hourly copies do not close a hole. A later Flue prune would need a store read, not more snapshots.
- **A Notebook list GET in v1.** Rejected. Hono cannot call `usePersistentState`. A list route is a second Notebook. Reconstruct from the latest catalog-shaped `data-note` until Slice 7’s body GET exists for another reason.
- **Style and taste as a prefs key on the same object.** Rejected. Style lives in Instruction. There is no prefs key. Storage is not visibility.

## Consequences

`upsertNote` is the writer. Search is TypeScript over `{ id, title, updatedAt, body }`. Slice 7 stays later. When a catalog write or its Card would strain 2 MB, offload with `body` XOR `{ version, r2Key }` and a required excerpt. Do not port `read_note` from this stub.
