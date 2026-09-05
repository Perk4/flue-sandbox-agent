import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { NotesAgent, SANDBOX_TOKEN } from "./agent.ts";
import { getSession, resetSession } from "./flue.ts";

test("read_note sees in-memory notes that are absent on the host disk", async () => {
  resetSession();
  NotesAgent();
  const session = getSession();
  const sandbox = session.sandbox;
  const tool = session.tools.find((entry) => entry.name === "read_note");
  assert.equal(session.model, "anthropic/claude-haiku-4-5");
  assert.ok(sandbox);
  assert.ok(tool);

  const body = await tool.run({
    data: { path: "/notes/secret-token.txt" },
    harness: { sandbox },
  });
  assert.equal(body.trim(), SANDBOX_TOKEN);
  assert.equal(existsSync("/notes/secret-token.txt"), false);
  assert.equal(existsSync("notes/secret-token.txt"), false);

  const grep = await sandbox.exec("grep SANDBOX-ONLY /notes/secret-token.txt");
  assert.equal(grep.exitCode, 0);
  assert.match(grep.stdout, new RegExp(SANDBOX_TOKEN));
});
