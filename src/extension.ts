import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { AuthManager } from "./authManager";
import { CodexClient } from "./codexClient";
import { VoiceRecorder } from "./voiceRecorder";
import { VoicePanel } from "./panel/VoicePanel";

let statusBarItem: vscode.StatusBarItem | undefined;
let outputChannel: vscode.OutputChannel | undefined;
const CODEX_VOICE_TRIGGER = "/codex-voice";

export function activate(context: vscode.ExtensionContext): void {
  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const codexClient = new CodexClient(workspacePath);
  const authManager = new AuthManager(context, codexClient);
  const voiceRecorder = new VoiceRecorder(workspacePath);
  outputChannel = vscode.window.createOutputChannel("Codex Voice");
  ensureRootDictationFile(workspacePath).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    outputChannel?.appendLine(`[${new Date().toLocaleTimeString()}] Failed to prepare codex-voice file: ${message}`);
  });

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = "codexvoice.startListening";
  statusBarItem.text = "$(mic) Codex Voice";
  statusBarItem.tooltip = "Start Codex Voice listening";
  statusBarItem.show();

  context.subscriptions.push(
    outputChannel,
    statusBarItem,
    registerUntitledTranscriptMirror(workspacePath),
    vscode.commands.registerCommand("codexvoice.startListening", async () => {
      const panel = VoicePanel.currentPanel;
      outputChannel?.appendLine(`[${new Date().toLocaleTimeString()}] Voice command fired.`);

      if (voiceRecorder.isRecording) {
        panel?.postStatus("Stopping VS Code Speech dictation...");

        try {
          const transcript = await voiceRecorder.stopRecording();
          outputChannel?.appendLine(`[${new Date().toLocaleTimeString()}] Transcript: ${transcript}`);
          panel?.postTranscript(transcript);
          await insertTranscriptIntoCodexChat(transcript, workspacePath);
          panel?.postStatus(`${CODEX_VOICE_TRIGGER} inserted into Codex chat. Transcript saved to handoff file.`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          outputChannel?.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
          panel?.postError(`${message} The transcript is copied when available, so you can paste it manually.`);
          vscode.window.showErrorMessage(message);
        } finally {
          statusBarItem!.text = "$(mic) Codex Voice";
          statusBarItem!.tooltip = "Start Codex Voice listening";
        }

        return;
      }

      try {
        panel?.postStatus("VS Code Speech dictation started. Click Codex Voice again to stop.");
        statusBarItem!.text = "$(record) Stop Codex Voice";
        statusBarItem!.tooltip = "Stop dictation and import transcript";
        await voiceRecorder.startRecording();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        outputChannel?.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
        panel?.postError(`${message} You can still type a prompt and press Send.`);
        vscode.window.showErrorMessage(message);
        statusBarItem!.text = "$(mic) Codex Voice";
        statusBarItem!.tooltip = "Start Codex Voice listening";
      }
    }),
    vscode.commands.registerCommand("codexvoice.openPanel", () => {
      VoicePanel.createOrShow(context.extensionUri, (transcript) =>
        handleTranscript(transcript, workspacePath)
      );
    }),
    vscode.commands.registerCommand("codexvoice.clearHistory", () => {
      VoicePanel.currentPanel?.clearHistory();
      vscode.window.showInformationMessage("Codex Voice history cleared.");
    }),
    vscode.commands.registerCommand("codexvoice.checkCodexLogin", async () => {
      const status = await authManager.checkCodexLogin();
      const message = status.available
        ? `Codex CLI is available. ${status.detail ?? ""}`.trim()
        : `Codex CLI was not found or is not ready. ${status.detail ?? ""}`.trim();

      vscode.window.showInformationMessage(message);
    })
  );
}

export function deactivate(): void {
  statusBarItem?.dispose();
}

async function handleTranscript(transcript: string, workspacePath: string | undefined): Promise<void> {
  const panel = VoicePanel.currentPanel;
  const prompt = transcript.trim();

  if (!prompt) {
    panel?.postError("I did not catch any speech. Try again or type a prompt in the panel.");
    return;
  }

  panel?.postTranscript(prompt);
  panel?.postStatus(`Inserting ${CODEX_VOICE_TRIGGER} into Codex chat...`);

  try {
    await insertTranscriptIntoCodexChat(prompt, workspacePath);
    panel?.postStatus(`${CODEX_VOICE_TRIGGER} inserted into Codex chat. Transcript saved to handoff file.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    panel?.postError(message);
    vscode.window.showErrorMessage(message);
  }
}

async function insertTranscriptIntoCodexChat(
  transcript: string,
  workspacePath: string | undefined
): Promise<void> {
  const text = transcript.trim();

  if (!text) {
    throw new Error("No transcript was captured. Try speaking again or type the prompt.");
  }

  await writeTranscriptHandoff(text, workspacePath);
  await vscode.env.clipboard.writeText(text);
  await focusCodexChat();

  try {
    await vscode.commands.executeCommand("type", { text: CODEX_VOICE_TRIGGER });
  } catch {
    await vscode.env.clipboard.writeText(CODEX_VOICE_TRIGGER);
    await vscode.commands.executeCommand("editor.action.clipboardPasteAction");
  }
}

async function writeTranscriptHandoff(
  transcript: string,
  workspacePath: string | undefined
): Promise<void> {
  const createdAt = new Date().toISOString();
  const payload = `${JSON.stringify({ createdAt, transcript }, null, 2)}\n`;
  const directories = [
    workspacePath ? path.join(workspacePath, ".codex-voice") : undefined,
    path.join(os.homedir(), ".codex-voice")
  ].filter((directory): directory is string => Boolean(directory));

  if (workspacePath) {
    await fs.writeFile(path.join(workspacePath, "codex-voice"), transcript, "utf8");
  }

  await Promise.all(
    directories.map(async (directory) => {
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(path.join(directory, "latest-transcript.txt"), transcript, "utf8");
      await fs.writeFile(path.join(directory, "latest-transcript.json"), payload, "utf8");
    })
  );
}

async function ensureRootDictationFile(workspacePath: string | undefined): Promise<void> {
  if (!workspacePath) {
    return;
  }

  const filePath = path.join(workspacePath, "codex-voice");

  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, "", "utf8");
  }
}

function registerUntitledTranscriptMirror(workspacePath: string | undefined): vscode.Disposable {
  let pendingWrite: NodeJS.Timeout | undefined;

  const mirrorDocument = (document: vscode.TextDocument): void => {
    if (document.uri.scheme !== "untitled" || document.languageId !== "plaintext") {
      return;
    }

    const transcript = document.getText().trim();

    if (!transcript) {
      return;
    }

    if (pendingWrite) {
      clearTimeout(pendingWrite);
    }

    pendingWrite = setTimeout(() => {
      writeTranscriptHandoff(transcript, workspacePath).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        outputChannel?.appendLine(
          `[${new Date().toLocaleTimeString()}] Failed to mirror Untitled transcript: ${message}`
        );
      });
    }, 250);
  };

  return vscode.Disposable.from(
    vscode.workspace.onDidChangeTextDocument((event) => mirrorDocument(event.document)),
    vscode.workspace.onDidCloseTextDocument((document) => mirrorDocument(document))
  );
}

async function focusCodexChat(): Promise<void> {
  const commands = [
    "chatgpt.openSidebar",
    "chatgpt.sidebarSecondaryView.focus",
    "chatgpt.sidebarView.focus"
  ];

  for (const command of commands) {
    try {
      await vscode.commands.executeCommand(command);
      await wait(150);
    } catch {
      // Different Codex layouts expose different focus commands.
    }
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
