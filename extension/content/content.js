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

function getDiff(retries=10,delay=300){
  return new Promise((resolve,reject)=>{
    function find(){
      const container = document.querySelector('.flex.items-start.justify-between.gap-4+.flex.gap-1');
      if(!container){
        if(retries-- >0) return setTimeout(find,delay);
        else return reject("Not found container");
      }
      const allowed = ['easy', 'medium', 'hard'];
      // console.log(
      //   [...container.children].map(el => el.textContent)
      // );

      const difficultyEl = [...container.children].find(el =>
        allowed.includes(el.textContent.trim().toLowerCase())
      );
      if(!difficultyEl){
        if(retries-- >0) return setTimeout(find,delay);
        else return reject("no child");
      }
      return resolve(difficultyEl.innerText.trim());
    }
    find();

  })
  
}

async function getTopic(){
  const parent1=document.querySelector(".overflow-hidden.transition-all>.mt-2.flex.flex-wrap.gap-1.pl-7");
  let child=parent1.children;
  return [...child].map(el => el.innerText.trim());
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

function getQuestion(){
  let node=document.querySelector(".flex.items-start.gap-2 .text-title-large.font-semibold.text-text-primary .no-underline.cursor-text");
  let question=node.innerText;
  return question;
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

    let difficulty=null;
    getDiff().then(res=>difficulty=res).catch(error=>difficulty=error);

    let topics=null;
    topics=await getTopic();

    let qid=null;
    qid=getQuestion();

    lastResult = resultText;

    const payload = {
      result: resultText,
      errorMsg,
      difficulty:difficulty,
      topics:[...topics],
      questionId:qid,
      platform:"LeetCode",
      status: mapResultToStatus(resultText),
      code: latestCode,
      lang: getLanguageFromEditor(),
      timestamp: Date.now()
    };

    console.log("📦 Captured payload:", payload);

    chrome.runtime.sendMessage({
      type: "SAVE_RUN_EVENT",
      payload:payload
    })
    // 🔒 emit only once
    payloadEmitted = true;
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
}


function mapResultToStatus(resultText) {
  if (!resultText) return "UNKNOWN";

  if (resultText.includes("Accepted")) return "AC";
  if (resultText.includes("Time Limit")) return "TLE";
  if (resultText.includes("Runtime")) return "RE";
  if (resultText.includes("Compile")) return "CE";
  if (resultText.includes("Wrong")) return "WA";

  return "UNKNOWN";
}

function getLanguageFromEditor() {
  const btn = document.querySelector(
    '#editor > div button[aria-haspopup="dialog"]'
  );
  return btn?.innerText.trim() || "unknown";
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