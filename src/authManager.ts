import * as vscode from "vscode";
import { CodexClient } from "./codexClient";

export interface CodexLoginStatus {
  readonly available: boolean;
  readonly detail?: string;
}

export class AuthManager {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly codexClient: CodexClient
  ) {}

  async checkCodexLogin(): Promise<CodexLoginStatus> {
    const availability = await this.codexClient.checkAvailability();
    const storedPreference = await this.context.globalState.get<string>("codexvoice.authMode");

    return {
      available: availability.available,
      detail: availability.detail ?? storedPreference ?? "Using existing Codex login when available."
    };
  }
}
