"use agent";

import { Bash, InMemoryFs } from "just-bash";
import { bash, defineTool, useModel, useSandbox, useTool } from "./flue.ts";

const FIXTURE_FILES = {
  "/notes/todo.txt": "buy milk\nship the flue agent\n",
  "/notes/secret-token.txt": "SANDBOX-ONLY-TOKEN-7f3a\n",
};

export const SANDBOX_TOKEN = "SANDBOX-ONLY-TOKEN-7f3a";

export const readNote = defineTool({
  name: "read_note",
  description: "Read one note from the sandbox filesystem by absolute path.",
  harness: true,
  async run({ data, harness }) {
    return harness.sandbox.readFile(data.path);
  },
});

export function NotesAgent(): string {
  useModel("anthropic/claude-haiku-4-5");
  useSandbox(bash(() => new Bash({ fs: new InMemoryFs(FIXTURE_FILES) })));
  useTool(readNote);
  return "Answer only from files under /notes. Call read_note with an absolute path.";
}
