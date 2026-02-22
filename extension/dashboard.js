window.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('open-analytics-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      window.open('analytics.html', '_blank');
    });
  }
});

// ═══════════════════════════════════════════════════════
//  BOOT ANIMATION
// ═══════════════════════════════════════════════════════
const BOOT_LINES = [
  '> reflekt v1.0 — initializing dashboard...',
  '> connecting to CodeTrackerDB (IndexedDB)...',
  '> loading runs, question_stats, daily_stats...',
  '> rendering visualizations...',
  '> done. ████████████████ 100%',
];

function typeText(el, text, speed) {
  return new Promise(resolve => {
    el.classList.add('show');
    let i = 0;
    const t = setInterval(() => {
      el.textContent = text.slice(0, ++i);
      if (i >= text.length) { clearInterval(t); resolve(); }
    }, speed || 18);
  });
}

function dismissBoot() {
  const boot = document.getElementById('boot');
  if (!boot) return;
  boot.classList.add('out');
  setTimeout(() => {
    boot.style.display = 'none';
    document.querySelectorAll('.fade-up').forEach((el, i) => {
      setTimeout(() => el.classList.add('in'), i * 80);
    });
  }, 420);
}

async function runBoot() {
  for (let i = 0; i < BOOT_LINES.length; i++) {
    const el = document.getElementById('bl' + i);
    if (!el) continue;
    await typeText(el, BOOT_LINES[i], i === 4 ? 10 : 18);
    await new Promise(r => setTimeout(r, 70));
  }
  await new Promise(r => setTimeout(r, 350));
  dismissBoot();
}

// ═══════════════════════════════════════════════════════
//  CLOCK
// ═══════════════════════════════════════════════════════
function updateClock() {
  const el = document.getElementById('clock');
  if (el) el.textContent = new Date().toLocaleTimeString('en-US', { hour12: false });
}
updateClock();
setInterval(updateClock, 1000);

// ═══════════════════════════════════════════════════════
//  INDEXEDDB
// ═══════════════════════════════════════════════════════
const DB_NAME = 'CodeTrackerDB';
const DB_VER  = 1;
let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onsuccess = () => { _db = req.result; res(_db); };
    req.onerror   = () => rej(req.error);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('runs')) {
        const r = db.createObjectStore('runs', { keyPath: 'id', autoIncrement: true });
        r.createIndex('questionId', 'questionId');
        r.createIndex('status',    'status');
        r.createIndex('timestamp', 'timestamp');
      }
      if (!db.objectStoreNames.contains('question_stats'))
        db.createObjectStore('question_stats', { keyPath: 'questionId' });
      if (!db.objectStoreNames.contains('daily_stats'))
        db.createObjectStore('daily_stats', { keyPath: 'date' });
    };
  });
}

function getAll(store) {
  return openDB().then(db => new Promise((res, rej) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll();
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  }));
}

// ═══════════════════════════════════════════════════════
//  SEED DUMMY DATA
// ═══════════════════════════════════════════════════════
async function seedDummy() {
  const db = await openDB();
  const QUESTIONS = [
    { id: 'Two Sum',                              diff: 'Easy',   topics: ['Array','Hash Table'] },
    { id: 'Merge Intervals',                      diff: 'Medium', topics: ['Array','Sorting'] },
    { id: 'LRU Cache',                            diff: 'Medium', topics: ['Hash Table','Linked List'] },
    { id: 'Trapping Rain Water',                  diff: 'Hard',   topics: ['Array','Two Pointers'] },
    { id: 'Longest Substring Without Repeating',  diff: 'Medium', topics: ['Sliding Window','String'] },
    { id: 'Median of Two Sorted Arrays',          diff: 'Hard',   topics: ['Array','Binary Search'] },
    { id: 'Valid Parentheses',                    diff: 'Easy',   topics: ['Stack','String'] },
    { id: 'Maximum Subarray',                     diff: 'Medium', topics: ['Array','Dynamic Programming'] },
    { id: 'Climbing Stairs',                      diff: 'Easy',   topics: ['Dynamic Programming','Math'] },
    { id: 'Binary Tree Inorder Traversal',        diff: 'Easy',   topics: ['Tree','DFS'] },
  ];
  const STATUSES = ['AC','AC','AC','TLE','RE','WA','CE','AC','TLE','RE'];
  const LANGS    = ['cpp','python','javascript','cpp','python','java'];

  for (let day = 111; day >= 0; day--) {
    const date = new Date();
    date.setDate(date.getDate() - day);
    const cnt = (day % 7 === 0) ? 0 : Math.floor(Math.random() * 7) + 1;

    for (let j = 0; j < cnt; j++) {
      const q      = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
      const status = STATUSES[Math.floor(Math.random() * STATUSES.length)];
      const lang   = LANGS[Math.floor(Math.random() * LANGS.length)];
      const ts     = date.getTime() + j * 120000;
      const action = Math.random() > 0.55 ? 'submit' : 'run';
      const dkey   = new Date(ts).toISOString().split('T')[0];

      await new Promise((res, rej) => {
        const tx = db.transaction(['runs','question_stats','daily_stats'], 'readwrite');

        tx.objectStore('runs').add({
          questionId: q.id, platform: 'LeetCode', action,
          status, language: lang, timestamp: ts,
          difficulty: q.diff, topics: q.topics
        });

        const qs  = tx.objectStore('question_stats');
        const qr  = qs.get(q.id);
        qr.onsuccess = () => {
          let rec = qr.result || {
            questionId: q.id, platform: 'LeetCode',
            totalRuns: 0, totalSubmits: 0,
            acCount: 0, tleCount: 0, reCount: 0, ceCount: 0, waCount: 0,
            lastStatus: null, lastTriedAt: null,
            difficulty: q.diff, topics: q.topics
          };
          action === 'submit' ? rec.totalSubmits++ : rec.totalRuns++;
          if (status === 'AC')  rec.acCount++;
          if (status === 'TLE') rec.tleCount++;
          if (status === 'RE')  rec.reCount++;
          if (status === 'CE')  rec.ceCount++;
          if (status === 'WA')  rec.waCount = (rec.waCount || 0) + 1;
          rec.lastStatus  = status;
          rec.lastTriedAt = ts;
          qs.put(rec);
        };

        const ds  = tx.objectStore('daily_stats');
        const dr  = ds.get(dkey);
        dr.onsuccess = () => {
          let d = dr.result || { date: dkey, runs:0, submits:0, ac:0, tle:0, re:0, ce:0, wa:0 };
          action === 'submit' ? d.submits++ : d.runs++;
          if (status === 'AC')  d.ac++;
          if (status === 'TLE') d.tle++;
          if (status === 'RE')  d.re++;
          if (status === 'CE')  d.ce++;
          if (status === 'WA')  d.wa = (d.wa || 0) + 1;
          ds.put(d);
        };

        tx.oncomplete = res;
        tx.onerror    = rej;
      });
    }
  }
}

// ═══════════════════════════════════════════════════════
//  COUNTER ANIMATION
// ═══════════════════════════════════════════════════════
function animCount(el, to) {
  if (!el) return;
  const dur   = 900;
  const start = performance.now();
  const tick  = now => {
    const p    = Math.min((now - start) / dur, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(ease * to);
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = to;
  };
  requestAnimationFrame(tick);
}

// ═══════════════════════════════════════════════════════
//  RENDER
// ═══════════════════════════════════════════════════════
async function render() {
  let [runs, questionStats, dailyStats] = await Promise.all([
    getAll('runs'), getAll('question_stats'), getAll('daily_stats')
  ]);

  if (runs.length === 0) {
    await seedDummy();
    [runs, questionStats, dailyStats] = await Promise.all([
      getAll('runs'), getAll('question_stats'), getAll('daily_stats')
    ]);
  }

  const total  = runs.length;
  const acCnt  = runs.filter(r => r.status === 'AC').length;
  const errCnt = runs.filter(r => ['TLE','RE','CE','WA'].includes(r.status)).length;
  const uniq   = questionStats.length;
  const week   = runs.filter(r => r.timestamp >= Date.now() - 7 * 86400000).length;
  const acRate = total > 0 ? Math.round((acCnt / total) * 100) : 0;

  // ── STAT COUNTERS ──────────────────────────────────────
  animCount(document.getElementById('sv-total'), total);
  animCount(document.getElementById('sv-ac'),    acCnt);
  animCount(document.getElementById('sv-err'),   errCnt);
  animCount(document.getElementById('sv-uniq'),  uniq);
  animCount(document.getElementById('sv-week'),  week);

  // ── STATUS MAP ─────────────────────────────────────────
  const statusMap = {};
  runs.forEach(r => { statusMap[r.status] = (statusMap[r.status] || 0) + 1; });

  // ── DONUT CHART ────────────────────────────────────────
  const dColors = {
    AC: '#00ff41', TLE: '#ffb700', RE: '#ff2244',
    CE: '#ff8800', WA: '#00ffcc', UNKNOWN: '#1a2b1d'
  };
  const dLabels = Object.keys(statusMap);
  const dVals   = dLabels.map(k => statusMap[k]);

  const donutPct = document.getElementById('donut-pct');
  if (donutPct) donutPct.textContent = acRate + '%';

  const donutCtx = document.getElementById('donut-chart');
  if (donutCtx) {
    new Chart(donutCtx.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: dLabels,
        datasets: [{ data: dVals, backgroundColor: dLabels.map(l => dColors[l] || '#1a2b1d'), borderWidth: 0, hoverOffset: 5 }]
      },
      options: {
        cutout: '68%',
        plugins: { legend: { display: false } },
        animation: { duration: 1000 }
      }
    });
  }

  const legendEl = document.getElementById('donut-legend');
  if (legendEl) {
    legendEl.innerHTML = dLabels.map(l => `
      <div class="legend-item">
        <div class="legend-dot" style="background:${dColors[l] || '#1a2b1d'}"></div>
        <span class="legend-name">${l}</span>
        <span class="legend-count">${statusMap[l]}</span>
        <span class="legend-pct">${Math.round((statusMap[l] / total) * 100)}%</span>
      </div>`).join('');
  }

  // ── LINE CHART ─────────────────────────────────────────
  const today = new Date();
  const lineLabels = [], acLine = [], errLine = [];
  for (let i = 29; i >= 0; i--) {
    const d   = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    const s   = dailyStats.find(x => x.date === key);
    lineLabels.push(d.getDate() === 1 || i === 29
      ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
    acLine.push(s ? s.ac : 0);
    errLine.push(s ? (s.tle || 0) + (s.re || 0) + (s.ce || 0) + (s.wa || 0) : 0);
  }

  const lineCtx = document.getElementById('line-chart');
  if (lineCtx) {
    new Chart(lineCtx.getContext('2d'), {
      type: 'line',
      data: {
        labels: lineLabels,
        datasets: [
          { label: 'AC',     data: acLine,  borderColor: '#00ff41', backgroundColor: 'rgba(0,255,65,0.06)',  borderWidth: 1.5, pointRadius: 0, tension: 0.4, fill: true },
          { label: 'Errors', data: errLine, borderColor: '#ff2244', backgroundColor: 'rgba(255,34,68,0.04)', borderWidth: 1.5, pointRadius: 0, tension: 0.4, fill: true }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: '#1e3320', maxTicksLimit: 8, font: { size: 9, family: 'JetBrains Mono' } }, grid: { color: '#0d1410' } },
          y: { ticks: { color: '#1e3320', font: { size: 9, family: 'JetBrains Mono' } }, grid: { color: '#0d1410' }, beginAtZero: true }
        },
        plugins: {
          legend: { labels: { color: '#3a5c3e', boxWidth: 10, font: { size: 10, family: 'JetBrains Mono' }, padding: 14 } },
          tooltip: { mode: 'index', intersect: false }
        },
        interaction: { mode: 'nearest', axis: 'x', intersect: false }
      }
    });
  }

  // ── RING CHART (difficulty) ────────────────────────────
  const diffMap = { Easy: 0, Medium: 0, Hard: 0 };
  questionStats.forEach(q => { if (q.difficulty && diffMap[q.difficulty] !== undefined) diffMap[q.difficulty]++; });
  const diffTotal  = Object.values(diffMap).reduce((a, b) => a + b, 0) || 1;
  const solvedCnt  = questionStats.filter(q => q.acCount > 0).length;
  const solvedPct  = uniq > 0 ? Math.round((solvedCnt / uniq) * 100) : 0;

  const ringPctEl = document.getElementById('ring-pct');
  if (ringPctEl) ringPctEl.textContent = solvedPct + '%';

  const ringCtx = document.getElementById('ring-chart');
  if (ringCtx) {
    new Chart(ringCtx.getContext('2d'), {
      type: 'doughnut',
      data: {
        datasets: [{
          data: [diffMap.Easy, diffMap.Medium, diffMap.Hard, Math.max(0, diffTotal * 0.02)],
          backgroundColor: ['#00cc33', '#ffb700', '#ff2244', '#0d1410'],
          borderWidth: 0
        }]
      },
      options: {
        cutout: '72%',
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        animation: { duration: 1000 }
      }
    });
  }

  const diffGrid = document.getElementById('diff-grid');
  if (diffGrid) {
    diffGrid.innerHTML = ['Easy', 'Medium', 'Hard'].map(d => `
      <div class="diff-row">
        <span class="diff-label ${d.toLowerCase()}">${d}</span>
        <div class="diff-bar"><div class="diff-fill ${d.toLowerCase()}" style="width:${Math.round((diffMap[d] / diffTotal) * 100)}%"></div></div>
        <span class="diff-count">${diffMap[d]}</span>
      </div>`).join('');
  }

  // ── HARDEST QUESTIONS TABLE ────────────────────────────
  const sorted = [...questionStats]
    .map(q => ({ ...q, errs: (q.tleCount || 0) + (q.reCount || 0) + (q.ceCount || 0) + (q.waCount || 0) }))
    .filter(q => q.errs > 0)
    .sort((a, b) => b.errs - a.errs)
    .slice(0, 8);

  const tEl = document.getElementById('trouble-table');
  if (tEl && sorted.length) {
    const maxErr = sorted[0].errs;
    tEl.innerHTML = `
      <table class="trouble">
        <thead><tr><th>#</th><th>Question</th><th>Last</th><th style="width:160px">Errors</th></tr></thead>
        <tbody>${sorted.map((q, i) => `
          <tr>
            <td class="rank-num">${i + 1}</td>
            <td><span class="q-title">${q.questionId}</span></td>
            <td><span class="pill pill-${q.lastStatus || 'UNKNOWN'}">${q.lastStatus || '—'}</span></td>
            <td>
              <div class="errbar">
                <div class="errbar-track"><div class="errbar-fill" style="width:${Math.round((q.errs / maxErr) * 100)}%"></div></div>
                <span class="errbar-count">${q.errs}</span>
              </div>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  }

  // ── HEATMAP ────────────────────────────────────────────
  const dayMap = {};
  runs.forEach(r => {
    const d = new Date(r.timestamp).toISOString().split('T')[0];
    dayMap[d] = (dayMap[d] || 0) + 1;
  });
  const maxDay = Math.max(...Object.values(dayMap), 1);
  const hmap   = document.getElementById('hmap');
  if (hmap) {
    let cells = '';
    for (let i = 111; i >= 0; i--) {
      const d   = new Date();
      d.setDate(d.getDate() - i);
      const k   = d.toISOString().split('T')[0];
      const c   = dayMap[k] || 0;
      const lvl = c === 0 ? 0 : c <= maxDay * 0.25 ? 1 : c <= maxDay * 0.5 ? 2 : c <= maxDay * 0.75 ? 3 : 4;
      const lbl = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      cells += `<div class="hmap-cell h${lvl}" data-tip="${lbl}: ${c} run${c !== 1 ? 's' : ''}"></div>`;
    }
    hmap.innerHTML = cells;
  }

  // ── LANGUAGE BARS ──────────────────────────────────────
  const langMap    = {};
  runs.forEach(r => { const l = r.language || 'unknown'; langMap[l] = (langMap[l] || 0) + 1; });
  const LANG_COLORS = ['#00ff41', '#00ffcc', '#ffb700', '#ff8800', '#ff2244', '#8888ff'];
  const langSorted  = Object.entries(langMap).sort((a, b) => b[1] - a[1]);
  const langEl      = document.getElementById('lang-rows');
  if (langEl && langSorted.length) {
    langEl.innerHTML = langSorted.map(([name, cnt], i) => {
      const pct = Math.round((cnt / total) * 100);
      return `<div class="lang-row">
        <div class="lang-head"><span class="lang-name">${name}</span><span class="lang-meta">${cnt} · ${pct}%</span></div>
        <div class="lang-bar"><div class="lang-fill" style="width:${pct}%; background:${LANG_COLORS[i % LANG_COLORS.length]}"></div></div>
      </div>`;
    }).join('');
  }

  // ── TOPIC CLOUD ────────────────────────────────────────
  const topicMap    = {};
  questionStats.forEach(q => (q.topics || []).forEach(t => { topicMap[t] = (topicMap[t] || 0) + 1; }));
  const topicSorted = Object.entries(topicMap).sort((a, b) => b[1] - a[1]).slice(0, 24);
  const topicEl     = document.getElementById('topic-cloud');
  if (topicEl && topicSorted.length) {
    topicEl.innerHTML = topicSorted.map(([t, c]) =>
      `<div class="topic-tag" title="${c} problem${c > 1 ? 's' : ''}">${t} <span style="color:var(--very-muted)">${c}</span></div>`
    ).join('');
  }
}

// ═══════════════════════════════════════════════════════
//  INIT — boot and render run in parallel;
//  boot always dismisses itself regardless of render result
// ═══════════════════════════════════════════════════════
runBoot();
render().catch(err => {
  console.error('reflekt render error:', err);
  dismissBoot(); // ensure boot screen always clears even on failure
});