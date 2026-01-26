console.log("content script has loaded");

/* =====================================================
   1️⃣ Ask background to inject Monaco bridge
   ===================================================== */
chrome.runtime.sendMessage({ type: "INJECT_MONACO_BRIDGE" });

/* =====================================================
   2️⃣ Receive Monaco code (PUSH-BASED)
   ===================================================== */
let latestCode = "";

window.addEventListener("message", (e) => {
  if (e.source !== window) return;
  if (!e.data?.__FROM_MONACO_BRIDGE__) return;
  if (e.data.type !== "MONACO_CODE") return;

  latestCode = e.data.code;
  console.log(latestCode);
  console.log("✅ Monaco code received");
});

/* =====================================================
   3️⃣ Observe submission result
   ===================================================== */
let lastResult = null;

function waitForResultContainer() {
  const resultNode = document.querySelector(
    '[data-e2e-locator="console-result"]'
  );

  if (!resultNode) {
    setTimeout(waitForResultContainer, 1000);
    return;
  }

  const target = resultNode.closest(".flexlayout__tab");
  if (!target) {
    setTimeout(waitForResultContainer, 1000);
    return;
  }

  observeSubmissionResult(target);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getErrorMsg(retries = 5) {
  for (let i = 0; i <= retries; i++) {
    const errorNode = document.querySelector(
      ".font-menlo.whitespace-pre-wrap.break-all"
    );
    if (errorNode) return errorNode.innerText.trim();
    await sleep(100);
  }
  return null;
}

function observeSubmissionResult(target) {
  const observer = new MutationObserver(async () => {
    const resultNode = document.querySelector(
      '[data-e2e-locator="console-result"]'
    );
    if (!resultNode) return;

    const resultText = resultNode.innerText.trim();
    if (!resultText || resultText === lastResult) return;

    lastResult = resultText;

    let errorMsg = null;
    if (resultText !== "Accepted") {
      errorMsg = await getErrorMsg();
    }

    const payload = {
      result: resultText,
      errorMsg,
      code: latestCode,   // ✅ always available
      lang: getLanguageFromEditor(),
      timestamp: Date.now()
    };

    console.log("📦 Captured payload:", payload);
  });

  observer.observe(target, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

function getLanguageFromEditor() {
  const editorNode = document.querySelector("[data-mode-id]");
  const btn = document.querySelector('button[aria-haspopup="dialog"]');
  return (
    editorNode?.getAttribute("data-mode-id") ||
    btn?.innerText.trim() ||
    "unknown"
  );
}

/* =====================================================
   4️⃣ Start observer
   ===================================================== */
waitForResultContainer();
