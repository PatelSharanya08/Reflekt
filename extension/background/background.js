console.log("Background loaded");

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

// ======================================================
// INDEXEDDB CONFIG
// ======================================================

// indexedDB.deleteDatabase("CodeTrackerDB");

const DB_NAME = "CodeTrackerDB";
const DB_VERSION = 2;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains("runs")) {
        const runs = db.createObjectStore("runs", {
          keyPath: "id",
          autoIncrement: true
        });

        runs.createIndex("questionId", "questionId");
        runs.createIndex("platform", "platform");
        runs.createIndex("status", "status");
        runs.createIndex("timestamp", "timestamp");
      }

      if (!db.objectStoreNames.contains("question_stats")) {
        const qs = db.createObjectStore("question_stats", {
          keyPath: "questionId"
        });

        qs.createIndex("platform", "platform");
        qs.createIndex("lastTriedAt", "lastTriedAt");
        qs.createIndex("solvedAt", "solvedAt");
      }


      if (!db.objectStoreNames.contains("daily_stats")) {
        db.createObjectStore("daily_stats", {
          keyPath: "date"
        });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

// ======================================================
// UTILITIES
// ======================================================

function getTodayDateString() {
  return new Date().toISOString().split("T")[0];
}

function validateRunData(data) {
  if (!data?.questionId || !data?.status || !data?.platform) {
    throw new Error("Invalid run data");
  }
}

// ======================================================
// ADD RUN EVENT (APPEND-ONLY)
// ======================================================

async function addRunEvent(data) {
  validateRunData(data);
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(["runs", "question_stats"], "readwrite");
    const runsStore = tx.objectStore("runs");
    const qsStore = tx.objectStore("question_stats");

    const getReq = qsStore.get(data.questionId);

    getReq.onsuccess = () => {
      const record = getReq.result;
      const attemptNumber = record ? record.totalAttempts + 1 : 1;

      runsStore.add({
        questionId: data.questionId,
        platform: data.platform,
        title: data.title || "",
        difficulty: data.difficulty || "unknown",
        topics: data.topics || [],
        action: data.action || "run",
        status: data.status,
        language: data.lang || "unknown",
        attemptNumber,
        timestamp: Date.now()
      });
    };

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}


// ======================================================
// UPDATE QUESTION STATS
// ======================================================

async function updateQuestionStats(data) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction("question_stats", "readwrite");
    const store = tx.objectStore("question_stats");

    const getReq = store.get(data.questionId);

    getReq.onsuccess = () => {
      const now = Date.now();
      let record = getReq.result;

      // FIRST TIME seeing this question
      if (!record) {
        record = {
          questionId: data.questionId,
          platform: data.platform,
          title: data.title || "",
          difficulty: data.difficulty || "unknown",
          topics: data.topics || [],
          totalAttempts: 0,
          totalRuns: 0,
          totalSubmits: 0,
          acCount: 0,
          tleCount: 0,
          reCount: 0,
          ceCount: 0,
          firstAttemptAt: now,
          solvedAt: null,
          timeToSolve: null,
          lastStatus: null,
          lastTriedAt: null
        };
      }

      // Increment attempt count
      record.totalAttempts++;

      if (data.action === "submit") record.totalSubmits++;
      else record.totalRuns++;

      // Error counters
      if (data.status === "AC") record.acCount++;
      if (data.status === "TLE") record.tleCount++;
      if (data.status === "RE") record.reCount++;
      if (data.status === "CE") record.ceCount++;

      // FIRST AC logic
      if (data.status === "AC" && !record.solvedAt) {
        record.solvedAt = now;
        record.timeToSolve = now - record.firstAttemptAt;
        record.attemptsBeforeFirstAC = record.totalAttempts;
      }

      record.lastStatus = data.status;
      record.lastTriedAt = now;

      store.put(record);
    };

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

// ======================================================
// UPDATE DAILY STATS
// ======================================================

async function updateDailyStats(data) {
  const db = await openDB();
  const today = getTodayDateString();

  return new Promise((resolve, reject) => {
    const tx = db.transaction("daily_stats", "readwrite");
    const store = tx.objectStore("daily_stats");

    const getReq = store.get(today);

    getReq.onsuccess = () => {
      let record = getReq.result || {
        date: today,
        runs: 0,
        submits: 0,
        ac: 0,
        tle: 0,
        re: 0,
        ce: 0
      };

      if (data.action === "submit") record.submits++;
      else record.runs++;

      if (data.status === "AC") record.ac++;
      if (data.status === "TLE") record.tle++;
      if (data.status === "RE") record.re++;
      if (data.status === "CE") record.ce++;

      store.put(record);
    };

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

// ======================================================
// MASTER HANDLER
// ======================================================

async function handleRunEvent(data) {
  await addRunEvent(data);
  await updateQuestionStats(data);
  await updateDailyStats(data);
}

// ======================================================
// MESSAGE LISTENER
// ======================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SAVE_RUN_EVENT") {
    handleRunEvent(message.payload)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));

    return true;
  }

  // Dashboard requests all data in one shot
  if (message.type === "GET_DASHBOARD_DATA") {
    Promise.all([
      getAllFromStore("runs"),
      getAllFromStore("question_stats"),
      getAllFromStore("daily_stats")
    ])
      .then(([runs, questionStats, dailyStats]) =>
        sendResponse({ success: true, runs, questionStats, dailyStats })
      )
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});


async function getErrorDistribution() {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction("runs", "readonly");
    const store = tx.objectStore("runs");
    const index = store.index("status");

    const stats = { AC: 0, TLE: 0, RE: 0, CE: 0 };

    index.openCursor().onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        stats[cursor.key] = (stats[cursor.key] || 0) + 1;
        cursor.continue();
      } else {
        resolve(stats);
      }
    };

    tx.onerror = () => reject(tx.error);
  });
}


async function getLast7DaysRuns() {
  const db = await openDB();
  const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);

  return new Promise((resolve, reject) => {
    const tx = db.transaction("runs", "readonly");
    const store = tx.objectStore("runs");
    const index = store.index("timestamp");

    const range = IDBKeyRange.lowerBound(cutoff);
    let count = 0;

    index.openCursor(range).onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        count++;
        cursor.continue();
      } else {
        resolve(count);
      }
    };

    tx.onerror = () => reject(tx.error);
  });
}

async function getHardestQuestions(limit = 5) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction("question_stats", "readonly");
    const store = tx.objectStore("question_stats");

    const results = [];

    store.openCursor().onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        const r = cursor.value;
        const totalErrors = r.tleCount + r.reCount + r.ceCount;

        results.push({
          questionId: r.questionId,
          totalErrors
        });

        cursor.continue();
      } else {
        results.sort((a, b) => b.totalErrors - a.totalErrors);
        resolve(results.slice(0, limit));
      }
    };

    tx.onerror = () => reject(tx.error);
  });
}

// code to insert dummy data for the first time to test visualization
// async function seedDummyData(days = 15) {
//   const statuses = ["AC", "TLE", "RE", "CE"];
//   const questions = ["LC-1", "LC-53", "LC-121", "LC-200", "LC-322"];
//   const languages = ["cpp", "python"];

//   for (let i = days - 1; i >= 0; i--) {
//     const date = new Date();
//     date.setDate(date.getDate() - i);

//     const runsToday = Math.floor(Math.random() * 5) + 3; // 3–7 runs per day

//     for (let j = 0; j < runsToday; j++) {
//       const randomStatus =
//         statuses[Math.floor(Math.random() * statuses.length)];

//       const randomQuestion =
//         questions[Math.floor(Math.random() * questions.length)];

//       const randomLang =
//         languages[Math.floor(Math.random() * languages.length)];

//       const timestamp = new Date(date).getTime() + j * 1000;

//       await insertHistoricalRun({
//         questionId: randomQuestion,
//         platform: "leetcode",
//         action: Math.random() > 0.7 ? "submit" : "run",
//         status: randomStatus,
//         language: randomLang,
//         timestamp
//       });
//     }
//   }

//   console.log("Dummy data seeded successfully.");
// }


// async function insertHistoricalRun(data) {
//   const db = await openDB();

//   return new Promise((resolve, reject) => {
//     const tx = db.transaction(
//       ["runs", "question_stats", "daily_stats"],
//       "readwrite"
//     );

//     const runsStore = tx.objectStore("runs");
//     const qsStore = tx.objectStore("question_stats");
//     const dailyStore = tx.objectStore("daily_stats");

//     // 1️⃣ Add run event
//     runsStore.add({
//       questionId: data.questionId,
//       platform: data.platform,
//       action: data.action,
//       status: data.status,
//       language: data.language,
//       timestamp: data.timestamp
//     });

//     // 2️⃣ Update question_stats
//     const qsReq = qsStore.get(data.questionId);

//     qsReq.onsuccess = () => {
//       let record = qsReq.result || {
//         questionId: data.questionId,
//         platform: data.platform,
//         totalRuns: 0,
//         totalSubmits: 0,
//         acCount: 0,
//         tleCount: 0,
//         reCount: 0,
//         ceCount: 0,
//         lastStatus: null,
//         lastTriedAt: null
//       };

//       if (data.action === "submit") record.totalSubmits++;
//       else record.totalRuns++;

//       if (data.status === "AC") record.acCount++;
//       if (data.status === "TLE") record.tleCount++;
//       if (data.status === "RE") record.reCount++;
//       if (data.status === "CE") record.ceCount++;

//       record.lastStatus = data.status;
//       record.lastTriedAt = data.timestamp;

//       qsStore.put(record);
//     };

//     // 3️⃣ Update daily_stats
//     const dayString = new Date(data.timestamp)
//       .toISOString()
//       .split("T")[0];

//     const dailyReq = dailyStore.get(dayString);

//     dailyReq.onsuccess = () => {
//       let daily = dailyReq.result || {
//         date: dayString,
//         runs: 0,
//         submits: 0,
//         ac: 0,
//         tle: 0,
//         re: 0,
//         ce: 0
//       };

//       if (data.action === "submit") daily.submits++;
//       else daily.runs++;

//       if (data.status === "AC") daily.ac++;
//       if (data.status === "TLE") daily.tle++;
//       if (data.status === "RE") daily.re++;
//       if (data.status === "CE") daily.ce++;

//       dailyStore.put(daily);
//     };

//     tx.oncomplete = () => resolve(true);
//     tx.onerror = () => reject(tx.error);
//   });
// }
// seedDummyData(15);

