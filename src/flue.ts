import { Bash } from "just-bash";

export type Sandbox = {
  readFile(path: string): Promise<string>;
  exec(command: string): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }>;
};

export type ToolInput = { path: string };

export type ToolDefinition = {
  name: string;
  description: string;
  harness: true;
  run(args: { data: ToolInput; harness: { sandbox: Sandbox } }): Promise<string>;
};

export type AgentSession = {
  model: string | undefined;
  sandbox: Sandbox | undefined;
  tools: ToolDefinition[];
};

let session: AgentSession = newSession();

function newSession(): AgentSession {
  return { model: undefined, sandbox: undefined, tools: [] };
}

export function resetSession(): void {
  session = newSession();
}

export function getSession(): AgentSession {
  return session;
}

export function useModel(id: string): void {
  session.model = id;
}

export function bash(create: () => Bash): { create(): Sandbox } {
  return {
    create() {
      const shell = create();
      return {
        readFile(path) {
          return shell.readFile(path);
        },
        async exec(command) {
          const result = await shell.exec(command);
          return {
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
          };
        },
      };
    },
  };
}

export function useSandbox(factory: { create(): Sandbox }): void {
  session.sandbox = factory.create();
}

export function defineTool(tool: ToolDefinition): ToolDefinition {
  return Object.freeze({ ...tool });
}

export function useTool(tool: ToolDefinition): void {
  session.tools.push(tool);
}
