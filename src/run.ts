import { NotesAgent } from "./agent.ts";
import { getSession, resetSession } from "./flue.ts";

function messageFromArgv(argv: string[]): string {
  const flag = argv.indexOf("--message");
  const text = flag === -1 ? undefined : argv[flag + 1];
  if (text === undefined) {
    throw new Error("usage: src/run.ts --message <text>");
  }
  return text;
}

function notePathFromMessage(message: string): string {
  const match = message.match(/(\/notes\/[^\s]+)/);
  return match?.[1] ?? "/notes/todo.txt";
}

resetSession();
NotesAgent();
const session = getSession();
const sandbox = session.sandbox;
const tool = session.tools.find((entry) => entry.name === "read_note");
if (sandbox === undefined || tool === undefined) {
  throw new Error("NotesAgent did not mount read_note on a sandbox");
}

const path = notePathFromMessage(messageFromArgv(process.argv.slice(2)));
const output = await tool.run({ data: { path }, harness: { sandbox } });
process.stdout.write(output);
