import * as vscode from "vscode";

type WebviewMessage =
  | { readonly type: "ready" }
  | { readonly type: "startListening" }
  | { readonly type: "clearHistory" }
  | { readonly type: "transcript"; readonly text: string }
  | { readonly type: "error"; readonly text: string };

export class VoicePanel {
  static currentPanel: VoicePanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];
  private onTranscript: (transcript: string) => Promise<void> | void;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    onTranscript: (transcript: string) => Promise<void> | void
  ) {
    this.onTranscript = onTranscript;
    this.panel.webview.html = this.getHtml();

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (message: WebviewMessage) => this.handleMessage(message),
      null,
      this.disposables
    );
  }

  static createOrShow(
    extensionUri: vscode.Uri,
    onTranscript: (transcript: string) => Promise<void> | void = () => undefined
  ): VoicePanel {
    if (VoicePanel.currentPanel) {
      VoicePanel.currentPanel.onTranscript = onTranscript;
      VoicePanel.currentPanel.panel.reveal(vscode.ViewColumn.Beside);
      return VoicePanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      "codexVoice",
      "Codex Voice",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "src", "panel", "webview")]
      }
    );

    VoicePanel.currentPanel = new VoicePanel(panel, extensionUri, onTranscript);
    return VoicePanel.currentPanel;
  }

  startListening(): void {
    this.panel.webview.postMessage({ type: "status", text: "Listening with native speech..." });
  }

  postStatus(text: string): void {
    this.panel.webview.postMessage({ type: "status", text });
  }

  postTranscript(text: string): void {
    this.panel.webview.postMessage({ type: "transcript", text });
  }

  postDraft(text: string): void {
    this.panel.webview.postMessage({ type: "draft", text });
  }

  postResponse(text: string): void {
    this.panel.webview.postMessage({ type: "response", text });
  }

  postError(text: string): void {
    this.panel.webview.postMessage({ type: "error", text });
  }

  clearHistory(): void {
    this.panel.webview.postMessage({ type: "clearHistory" });
  }

  dispose(): void {
    VoicePanel.currentPanel = undefined;

    while (this.disposables.length > 0) {
      const disposable = this.disposables.pop();
      disposable?.dispose();
    }
  }

  private handleMessage(message: WebviewMessage): void {
    if (message.type === "startListening") {
      vscode.commands.executeCommand("codexvoice.startListening");
      return;
    }

    if (message.type === "clearHistory") {
      vscode.commands.executeCommand("codexvoice.clearHistory");
      return;
    }

    if (message.type === "transcript") {
      this.onTranscript(message.text);
      return;
    }

    if (message.type === "error") {
      vscode.window.showErrorMessage(message.text);
    }
  }

  private getHtml(): string {
    const webview = this.panel.webview;
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "src", "panel", "webview", "main.js")
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "src", "panel", "webview", "style.css")
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${styleUri}" rel="stylesheet">
  <title>Codex Voice</title>
</head>
<body>
  <main class="app">
    <section class="toolbar" aria-label="Voice controls">
      <button id="listenButton" class="mic-button" type="button" title="Start listening">
        <span class="mic-icon" aria-hidden="true">$(mic)</span>
        <span>Start / Stop</span>
      </button>
      <input id="typedPrompt" class="prompt-input" type="text" placeholder="Type if speech is unavailable">
      <button id="sendButton" class="icon-button" type="button" title="Send typed prompt">Send</button>
      <button id="clearButton" class="icon-button" type="button" title="Clear history">Clear</button>
    </section>
    <p id="status" class="status">Ready</p>
    <section class="panel-section" aria-label="Transcript">
      <h2>Transcript</h2>
      <p id="transcript" class="placeholder">Click Start, speak with VS Code Speech, then click Codex Voice again to stop.</p>
    </section>
    <section class="panel-section response-section" aria-label="Codex response">
      <h2>Codex Response</h2>
      <div id="response" class="placeholder">Codex responses will appear here.</div>
    </section>
  </main>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";

  for (let i = 0; i < 32; i += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return nonce;
}
