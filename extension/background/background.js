function monacoBridgeMainWorld() {
  console.log("[PAGE] Monaco bridge injected");

  function sendCode() {
    const monaco = window.monaco;
    if (!monaco?.editor) return;

    const models = monaco.editor.getModels();
    if (!models || !models.length) return;

    window.postMessage({
      __FROM_MONACO_BRIDGE__: true,
      type: "MONACO_CODE",
      code: models[0].getValue()
    }, "*");
  }

  const wait = setInterval(() => {
    if (window.monaco?.editor?.getModels()?.length) {
      clearInterval(wait);
      sendCode();

    // 🔥 push updates on every change
    const model = monaco.editor.getModels()[0];

    model.onDidChangeContent(() => {
    sendCode();
    });

    }
  }, 300);
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === "INJECT_MONACO_BRIDGE") {
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      world: "MAIN",   // 🚨 THIS BYPASSES CSP
      func: monacoBridgeMainWorld
    });
  }
});
