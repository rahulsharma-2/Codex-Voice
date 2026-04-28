import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";

export class VoiceRecorder {
  private dictationDocument: vscode.TextDocument | undefined;
  private dictationEditor: vscode.TextEditor | undefined;

  constructor(private readonly workspacePath?: string) {}

  get isRecording(): boolean {
    return Boolean(this.dictationDocument);
  }

  async startRecording(): Promise<void> {
    const speechExtension = vscode.extensions.getExtension("ms-vscode.vscode-speech");

    if (!speechExtension) {
      throw new Error("VS Code Speech is not installed. Install ms-vscode.vscode-speech and reload VS Code.");
    }

    if (!speechExtension.isActive) {
      await speechExtension.activate();
    }

    const dictationFile = await this.prepareDictationFile();
    this.dictationDocument = await vscode.workspace.openTextDocument(dictationFile);
    this.dictationEditor = await vscode.window.showTextDocument(this.dictationDocument, {
      preview: true,
      preserveFocus: false,
      viewColumn: vscode.ViewColumn.Beside
    });

    await vscode.commands.executeCommand("workbench.action.editorDictation.start");
  }

  async stopRecording(): Promise<string> {
    const document = this.dictationDocument;

    if (!document) {
      throw new Error("Codex Voice is not currently listening.");
    }

    await vscode.commands.executeCommand("workbench.action.editorDictation.stop");
    await wait(500);
    await document.save();

    const transcript = document.getText().trim();

    await this.closeDictationEditor();
    this.dictationDocument = undefined;
    this.dictationEditor = undefined;

    if (!transcript) {
      throw new Error("No transcript was captured. Try speaking again or type the prompt.");
    }

    return transcript;
  }

  async cancelRecording(): Promise<void> {
    if (!this.dictationDocument) {
      return;
    }

    await vscode.commands.executeCommand("workbench.action.editorDictation.stop");
    await this.closeDictationEditor();
    this.dictationDocument = undefined;
    this.dictationEditor = undefined;
  }

  private async closeDictationEditor(): Promise<void> {
    if (!this.dictationDocument) {
      return;
    }

    await vscode.window.showTextDocument(this.dictationDocument, {
      preview: true,
      preserveFocus: false,
      viewColumn: this.dictationEditor?.viewColumn ?? vscode.ViewColumn.Beside
    });
    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
  }

  private async prepareDictationFile(): Promise<vscode.Uri> {
    if (!this.workspacePath) {
      throw new Error("Open a workspace folder before starting Codex Voice.");
    }

    const filePath = path.join(this.workspacePath, "codex-voice");
    await fs.writeFile(filePath, "", "utf8");
    return vscode.Uri.file(filePath);
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
