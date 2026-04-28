# Codex Voice

Codex Voice is a zero-cost-first push-to-talk voice assistant for Codex in VS Code.

This MVP uses browser/native speech recognition when it is available in the VS Code webview, then sends the transcript to the local Codex CLI with the user's existing Codex login. If speech recognition is unavailable, type a prompt in the panel and press Send.

## Commands

- `Codex Voice: Start Listening`
- `Codex Voice: Open Codex Voice Panel`
- `Codex Voice: Clear Codex Voice History`
- `Codex Voice: Check Codex Login`

## MVP Cost Model

- No hosted backend.
- No OpenAI API key required by default.
- Codex responses will use the user's existing Codex login through Codex CLI in a later step.
- Transcription will start with browser/native speech recognition in a later step.

## Development

```bash
npm install
npm run compile
```

Press `F5` in VS Code to launch an Extension Development Host.

## Manual Install

```bash
code --install-extension codex-voice-0.0.1.vsix
```

Then run `Codex Voice: Open Codex Voice Panel` from the Command Palette, or use the mic/status bar command.
