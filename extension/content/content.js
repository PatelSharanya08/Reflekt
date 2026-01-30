console.log("content script has loaded");


chrome.runtime.sendMessage({ type: "INJECT_MONACO_BRIDGE" });


let latestCode = "";
let lastResult=null;
let lastaction=null;
let resultNode=null;
let payloadEmitted=false;




window.addEventListener("message", (e) => {
  if (e.source !== window) return;
  if (!e.data?.__FROM_MONACO_BRIDGE__) return;
  if (e.data.type !== "MONACO_CODE") return;

  latestCode = e.data.code;
  console.log(latestCode);
  console.log("✅ Monaco code received");
});

function requestCode(action) {
  document.dispatchEvent(
    new CustomEvent("REQUEST_CODE", {
      detail: { action },
      bubbles: true
    })
  );
}


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

  observeSubmissionResult();
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function waitForCodeWithRetry(action, {
  retries = 5,
  delay = 200
} = {}) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    function attempt() {
      if (latestCode && latestCode.trim()) {
        resolve(latestCode);
        return;
      }

      if (attempts >= retries) {
        reject(new Error("Code not received after retries"));
        return;
      }

      attempts++;
      requestCode(action); // 🔁 retry request
      setTimeout(attempt, delay);
    }

    attempt();
  });
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

function observeSubmissionResult() {
  const observer = new MutationObserver(async () => {
    if(lastaction==="run"){
      resultNode = document.querySelector(
        '[data-e2e-locator="console-result"]'
      );
    }
    if(lastaction==="submit"){
      resultNode=document.querySelector('[data-e2e-locator="submission-result"]');
    }
    
    if (!resultNode) {
      resultNode=document.querySelector('[data-e2e-locator="console-result"]');
    }
    if(!resultNode) return;
    const resultText = resultNode.innerText.trim();
    if (!resultText) return;

    // Allow repeated same resultText until payload is emitted
    if (payloadEmitted===true) return;

    


    let errorMsg = null;

    if (resultText !== "Accepted") {
      errorMsg = await getErrorMsg();

      // ⛔ error text not ready yet → wait
      if (!errorMsg) return;
    }

    lastResult = resultText;

    const payload = {
      result: resultText,
      errorMsg,
      code: latestCode,
      lang: getLanguageFromEditor(),
      timestamp: Date.now()
    };

    console.log("📦 Captured payload:", payload);

    // 🔒 emit only once
    payloadEmitted = true;
  });

  observer.observe(document.body, {
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

function attachSubmitListener(){
  let submitBtn=document.querySelector('[data-e2e-locator="console-submit-button"]');
  if(!submitBtn){
    setTimeout(attachSubmitListener,1000);
    return;
  }
  submitBtn.addEventListener("click",()=>{
   

payloadEmitted=false;
    lastaction="submit";
    console.log("submit button clicked");
    document.dispatchEvent(new CustomEvent("REQUEST_CODE",{
      detail:{action:"SUBMIT"},
      bubbles: true
    }))
    // getSubmitResult();
  });
}



function attachRunListener(){
  let runBtn=document.querySelector('[data-e2e-locator="console-run-button"]');
  if(!runBtn){
    setTimeout(attachRunListener, 1000);
    return;
  }
  runBtn.addEventListener("click",()=>{
    

    payloadEmitted=false;
    lastaction="run";
    console.log("run button clicked");
    document.dispatchEvent(new CustomEvent("REQUEST_CODE", {
        detail: { action: "RUN" },
        bubbles: true
      })
    )
  })
}



observeSubmissionResult();
attachRunListener();
attachSubmitListener();