console.log("[PAGE] Monaco bridge injected");

function sendCode(action) {
const monaco = window.monaco;
if (!monaco?.editor) return;

const models = monaco.editor.getModels();
if (!models || !models.length) return;

window.postMessage({
    __FROM_MONACO_BRIDGE__: true,
    type: "MONACO_CODE",
    action,
    code: models[0].getValue()
}, "*");
}

document.addEventListener("REQUEST_CODE", (e) => {
    sendCode(e.detail?.action || "UNKNOWN");
});