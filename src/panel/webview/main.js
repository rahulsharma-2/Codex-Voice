(function () {
  const vscode = acquireVsCodeApi();
  const listenButton = document.getElementById("listenButton");
  const clearButton = document.getElementById("clearButton");
  const sendButton = document.getElementById("sendButton");
  const typedPrompt = document.getElementById("typedPrompt");
  const status = document.getElementById("status");
  const transcript = document.getElementById("transcript");
  const response = document.getElementById("response");
  listenButton?.addEventListener("click", () => {
    setStatus("Starting or stopping VS Code Speech dictation...");
    listenButton?.classList.add("recording");
    vscode.postMessage({ type: "startListening" });
  });

  sendButton?.addEventListener("click", () => {
    sendTypedPrompt();
  });

  typedPrompt?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      sendTypedPrompt();
    }
  });

  clearButton?.addEventListener("click", () => {
    vscode.postMessage({ type: "clearHistory" });
  });

  window.addEventListener("message", (event) => {
    const message = event.data;

    if (message.type === "status" && transcript) {
      setStatus(message.text);
    }

    if (message.type === "startListening") {
      setStatus("Starting native speech recognition...");
    }

    if (message.type === "transcript") {
      listenButton?.classList.remove("recording");
      setTranscript(message.text);
      setStatus("Transcript captured.");
    }

    if (message.type === "draft") {
      listenButton?.classList.remove("recording");
      setTranscript(message.text);

      if (typedPrompt) {
        typedPrompt.value = message.text;
        typedPrompt.focus();
        typedPrompt.select();
      }

      setStatus("Review the transcript, edit if needed, then press Send.");
    }

    if (message.type === "response" && response) {
      listenButton?.classList.remove("recording");
      response.textContent = message.text;
      response.classList.remove("placeholder");
      setStatus("Codex response received.");
    }

    if (message.type === "error") {
      listenButton?.classList.remove("recording");
      if (response) {
        response.textContent = message.text;
        response.classList.remove("placeholder");
      }
      setStatus(message.text);
    }

    if (message.type === "clearHistory") {
      if (transcript) {
        transcript.textContent = "Click Start, speak with VS Code Speech, then click Codex Voice again to stop.";
        transcript.classList.add("placeholder");
      }

      if (response) {
        response.textContent = "Codex responses will appear here.";
        response.classList.add("placeholder");
      }

      setStatus("Ready");
    }
  });

  vscode.postMessage({ type: "ready" });

  function sendTypedPrompt() {
    const text = typedPrompt?.value?.trim() || "";

    if (!text) {
      setStatus("Type a prompt first.");
      typedPrompt?.focus();
      return;
    }

    sendTranscript(text);
    typedPrompt.value = "";
  }

  function sendTranscript(text) {
    setTranscript(text);
    setStatus("Sending to Codex...");
    vscode.postMessage({ type: "transcript", text });
  }

  function setTranscript(text) {
    if (!transcript) {
      return;
    }

    transcript.textContent = text;
    transcript.classList.remove("placeholder");
  }

  function setStatus(text) {
    if (status) {
      status.textContent = text;
    }
  }

})();
