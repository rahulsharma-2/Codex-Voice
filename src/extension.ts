import * as vscode from "vscode";
import { AuthManager } from "./authManager";
import { CodexClient } from "./codexClient";
import { VoiceRecorder } from "./voiceRecorder";
import { VoicePanel } from "./panel/VoicePanel";

let statusBarItem: vscode.StatusBarItem | undefined;
let outputChannel: vscode.OutputChannel | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const codexClient = new CodexClient(workspacePath);
  const authManager = new AuthManager(context, codexClient);
  const voiceRecorder = new VoiceRecorder();
  outputChannel = vscode.window.createOutputChannel("Codex Voice");

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = "codexvoice.startListening";
  statusBarItem.text = "$(mic) Codex Voice";
  statusBarItem.tooltip = "Start Codex Voice listening";
  statusBarItem.show();

  context.subscriptions.push(
    outputChannel,
    statusBarItem,
    vscode.commands.registerCommand("codexvoice.startListening", async () => {
      const panel = VoicePanel.currentPanel;
      outputChannel?.appendLine(`[${new Date().toLocaleTimeString()}] Voice command fired.`);

      if (voiceRecorder.isRecording) {
        panel?.postStatus("Stopping VS Code Speech dictation...");

        try {
          const transcript = await voiceRecorder.stopRecording();
          outputChannel?.appendLine(`[${new Date().toLocaleTimeString()}] Transcript: ${transcript}`);
          panel?.postDraft(transcript);
          await insertTranscriptIntoCodexChat(transcript);
          panel?.postStatus("Transcript inserted into Codex chat and copied to clipboard.");
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
        handleTranscript(transcript)
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

async function handleTranscript(transcript: string): Promise<void> {
  const panel = VoicePanel.currentPanel;
  const prompt = transcript.trim();

  if (!prompt) {
    panel?.postError("I did not catch any speech. Try again or type a prompt in the panel.");
    return;
  }

  panel?.postTranscript(prompt);
  panel?.postStatus("Inserting transcript into Codex chat...");

  try {
    await insertTranscriptIntoCodexChat(prompt);
    panel?.postStatus("Transcript inserted into Codex chat and copied to clipboard.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    panel?.postError(message);
    vscode.window.showErrorMessage(message);
  }
}

async function insertTranscriptIntoCodexChat(transcript: string): Promise<void> {
  const text = transcript.trim();

  if (!text) {
    throw new Error("No transcript was captured. Try speaking again or type the prompt.");
  }

  await vscode.env.clipboard.writeText(text);
  await focusCodexChat();

  try {
    await vscode.commands.executeCommand("type", { text });
  } catch {
    await vscode.commands.executeCommand("editor.action.clipboardPasteAction");
  }
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
