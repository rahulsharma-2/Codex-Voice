import * as childProcess from "child_process";
import * as util from "util";
import * as vscode from "vscode";

const execFile = util.promisify(childProcess.execFile);

export interface CodexAvailability {
  readonly available: boolean;
  readonly detail?: string;
}

export interface CodexResponse {
  readonly text: string;
}

export class CodexClient {
  constructor(private readonly workspacePath?: string) {}

  async checkAvailability(): Promise<CodexAvailability> {
    const model = await this.selectVsCodeModel();

    if (model) {
      return {
        available: true,
        detail: `VS Code model provider is available: ${model.name}`
      };
    }

    try {
      const { stdout } = await runCodex(["--version"], this.workspacePath ?? process.cwd(), 10_000);

      return {
        available: true,
        detail: stdout.trim() || "Codex CLI is available."
      };
    } catch (error) {
      return {
        available: false,
        detail: getErrorMessage(error)
      };
    }
  }

  async sendPrompt(prompt: string): Promise<CodexResponse> {
    const trimmedPrompt = prompt.trim();

    if (!trimmedPrompt) {
      throw new Error("Transcript is empty.");
    }

    const vscodeResponse = await this.sendWithVsCodeLanguageModel(trimmedPrompt);

    if (vscodeResponse) {
      return vscodeResponse;
    }

    throw new Error(
      "No VS Code language model provider was available. Open the Codex/OpenAI extension, make sure you are signed in, then reload VS Code. The Codex CLI fallback is disabled because it is failing on this Windows setup."
    );
  }

  private async sendWithVsCodeLanguageModel(prompt: string): Promise<CodexResponse | undefined> {
    const model = await this.selectVsCodeModel();

    if (!model) {
      return undefined;
    }

    const messages = [
      vscode.LanguageModelChatMessage.User(
        [
          "You are Codex Voice, a concise coding assistant inside VS Code.",
          "Answer the user's spoken or typed prompt directly.",
          "",
          prompt
        ].join("\n")
      )
    ];
    const response = await model.sendRequest(messages);
    let text = "";

    for await (const chunk of response.text) {
      text += chunk;
    }

    return { text: text.trim() || "The VS Code model returned an empty response." };
  }

  private async selectVsCodeModel(): Promise<vscode.LanguageModelChat | undefined> {
    const selectors: vscode.LanguageModelChatSelector[] = [
      { vendor: "openai" },
      { vendor: "copilot" },
      {}
    ];

    for (const selector of selectors) {
      try {
        const models = await vscode.lm.selectChatModels(selector);
        const model = models[0];

        if (model) {
          return model;
        }
      } catch {
        // Some providers may reject until the user grants access; try the next selector.
      }
    }

    return undefined;
  }
}

async function runCodex(
  args: string[],
  cwd: string,
  timeout: number
): Promise<{ stdout: string; stderr: string }> {
  if (process.platform === "win32") {
    return execFile("cmd.exe", ["/d", "/c", "codex", ...args], {
      cwd,
      timeout,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 10
    });
  }

  return execFile("codex", args, {
    cwd,
    timeout,
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 10
  });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
