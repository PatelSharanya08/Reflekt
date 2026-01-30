function monacoBridgeMainWorld() {
  if (window.__MONACO_BRIDGE_INSTALLED__) return;
  window.__MONACO_BRIDGE_INSTALLED__ = true;

  console.log("[PAGE] Monaco bridge injected");

  function sendCode(action = "UNKNOWN") {
    const monaco = window.monaco;
    if (!monaco?.editor) return;

    const models = monaco.editor.getModels();
    if (!models?.length) return;

    window.postMessage(
      {
        __FROM_MONACO_BRIDGE__: true,
        type: "MONACO_CODE",
        action,
        code: models[0].getValue()
      },
      "*"
    );
  }

  document.addEventListener("REQUEST_CODE", (e) => {
    sendCode(e.detail?.action);
  });
}


chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === "INJECT_MONACO_BRIDGE") {
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      world: "MAIN",   // THIS BYPASSES CSP
      func: monacoBridgeMainWorld
    });
  }
});


