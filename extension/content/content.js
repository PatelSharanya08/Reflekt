console.log("content script has loaded");
let lastResult=null;
let latestCode="";

console.log("=== DEBUG INFO ===");
console.log("Content script loaded on:", window.location.href);

// Test if we can access Monaco directly
setTimeout(() => {
    console.log("Testing Monaco access...");
    console.log("window.monaco exists:", !!window.monaco);
    console.log("window.monaco.editor exists:", !!window.monaco?.editor);
    console.log("window.monaco.editor.getModels exists:", !!window.monaco?.editor?.getModels);
    
    if (window.monaco?.editor?.getModels) {
        try {
            const models = window.monaco.editor.getModels();
            console.log("Number of models:", models?.length);
            if (models && models.length > 0) {
                const code = models[0].getValue();
                console.log("Code sample:", code.substring(0, 100));
                console.log("✅ Direct access WORKS!");
            }
        } catch(e) {
            console.log("Error:", e.message);
        }
    }
}, 3000);


function waitForResultContainer(){
    console.log("waiting for result container..");
    let resultNode=document.querySelector(
        '[data-e2e-locator="console-result"]'
    )
    
    if(!resultNode){
        setTimeout(waitForResultContainer,1000);
        return;
    }
    const target=resultNode.closest('.flexlayout__tab'); 
    if(!target){
        setTimeout(waitForResultContainer,1000);
        return;
    }
    
    console.log("result container found");
    observeSubmissionResult(target,resultNode);
}

function sleep(ms){
    return new Promise(resolve=> setTimeout(resolve,ms));
}

async function getErrorMsg(retries=5){
    for(let i=0;i<=retries;i++){
        const errorNode = document.querySelector(
        '.font-menlo.whitespace-pre-wrap.break-all'
        );
        if(errorNode) return errorNode.innerText.trim();
        await sleep(100);
    }
    return null;
}

function observeSubmissionResult(target,resultNode){
    console.log("Observing node:", target);
    const observer=new MutationObserver(async()=>{
        resultNode=document.querySelector(
            '[data-e2e-locator="console-result"]'
        )
        if(!resultNode) return;
        console.log("Observer callback fired");
        const resultText=resultNode.innerText.trim();
        if(!resultText) return;

        let errorMsg=null;
        if(resultText!=="Accepted"){
            errorMsg=await getErrorMsg();
        }
        
        // getCode();
        const code=await getCodeAsync();

        const lang=getLanguageFromEditor();
        // let lang="java";

        const payload = {
            result: resultText,
            errorMsg,
            code,   
            lang: getLanguageFromEditor(),
            timestamp: Date.now(),
        };

        console.log("Captured data:",payload);
    });
    observer.observe(target,{
        childList:true,
        subtree:true,
        characterData:true,
    })

    console.log("observer attached on .flexlayout__tab");
}

function getLanguageFromEditor() {
  const editorNode = document.querySelector("[data-mode-id]");
  const btn=document.querySelector('button[aria-haspopup="dialog"]');
  return editorNode?.getAttribute("data-mode-id") || btn?.innerText.trim() || "unknown";
}

// ===== 1. Inject page-side script =====
function injectMonacoBridge() {
  const s = document.createElement("script");
  s.textContent = `
    (function () {
  console.log("[PAGE] Monaco bridge injected");

  function sendCode() {
    console.log("[PAGE] RUN_CODE received");

    const monaco = window.monaco;
    if (!monaco?.editor) return false;

    const models = monaco.editor.getModels();
    if (!models.length) return false;

    window.postMessage({
      __FROM_MONACO_BRIDGE__: true,
      type: "MONACO_CODE",
      code: models[0].getValue()
    }, "*");
    return true;
  }

  window.addEventListener("RUN_CODE", ()=>{
    const interval=setInterval(()=>{
        if(sendCode()) clearInterval(interval);    
    },1000);

    });

  window.postMessage({
        __FROM_MONACO_BRIDGE__: true,
        type: "MONACO_READY"
    }, "*");
})();

  `;
  document.documentElement.appendChild(s);
  s.remove();
}

injectMonacoBridge();

// ===== 2. Receive code back =====
// window.addEventListener("message", (e) => {
//   if (e.source !== window) return;
//   if (e.data?.type !== "MONACO_CODE") return;

//   latestCode=e.data.code;
// //   console.log("✅ Monaco code:", e.data.code);

//   // OPTIONAL:
//   // chrome.runtime.sendMessage({ type: "SAVE_CODE", code: e.data.code });
// });


function getCodeAsync(timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
        clearTimeout(timer);
        window.removeEventListener("message", handler);
        reject("Timed out waiting for Monaco code");
    }, timeout);

    let ready=false;
    const handler = (e) => {
        console.log("[CONTENT] received:", e.data);
        if (e.source !== window) return;
        if (!e.data?.__FROM_MONACO_BRIDGE__) return;
        if (e.data.type === "MONACO_READY") {
            ready=true;
            window.dispatchEvent(new Event("RUN_CODE"));
            return;
        }

        if(e.data.type==="MONACO_CODE"){
            clearTimeout(timer);
            window.removeEventListener("message", handler);
            resolve(e.data.code);
        }
    //   latestCode=e.data.code;
      
    //   resolve(e.data.code);
    };

    window.addEventListener("message", handler);
  });
}



waitForResultContainer();
