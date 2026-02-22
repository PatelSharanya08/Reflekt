
    // ═══════════════════════════════════════════════════════════════════════════
    //  MAIN INITIALIZATION
    // ═══════════════════════════════════════════════════════════════════════════

    const DB_NAME = 'CodeTrackerDB';
    const DB_VERSION = 2;

    /**
     * Load data from IndexedDB
     */
    async function loadData() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(['runs', 'question_stats', 'daily_stats'], 'readonly');

          const runsReq = tx.objectStore('runs').getAll();
          const questionStatsReq = tx.objectStore('question_stats').getAll();
          const dailyStatsReq = tx.objectStore('daily_stats').getAll();

          Promise.all([
            new Promise((res, rej) => {
              runsReq.onsuccess = () => res(runsReq.result);
              runsReq.onerror = () => rej(runsReq.error);
            }),
            new Promise((res, rej) => {
              questionStatsReq.onsuccess = () => res(questionStatsReq.result);
              questionStatsReq.onerror = () => rej(questionStatsReq.error);
            }),
            new Promise((res, rej) => {
              dailyStatsReq.onsuccess = () => res(dailyStatsReq.result);
              dailyStatsReq.onerror = () => rej(dailyStatsReq.error);
            })
          ]).then(([runs, questionStats, dailyStats]) => {
            resolve({ runs, questionStats, dailyStats });
          }).catch(reject);
        };

        request.onerror = () => reject(request.error);
      });
    }

    /**
     * Initialize dashboard
     */
    async function init() {
      try {
        console.log('Loading data from IndexedDB...');
        const data = await loadData();
        
        console.log('Rendering dashboard...');
        await Dashboard.render(data);
        
        console.log('Dashboard ready!');

        // Set up AI insights button
        const generateBtn = document.getElementById('generate-insights-btn');
        if (generateBtn) {
          generateBtn.addEventListener('click', async () => {
            generateBtn.disabled = true;
            generateBtn.textContent = 'Generating...';
            
            const insightsContainer = document.getElementById('ai-insights');
            insightsContainer.innerHTML = '<div class="loading">Analyzing your data with AI...</div>';

            try {
              const insights = await Dashboard.generateAIInsights(data);
              
              if (insights) {
                console.log('AI insights generated successfully');
              } else {
                insightsContainer.innerHTML = '<div style="color: var(--accent-red);">Failed to generate insights. Check console for errors.</div>';
              }
            } catch (error) {
              console.error('Error generating insights:', error);
              insightsContainer.innerHTML = `<div style="color: var(--accent-red);">Error: ${error.message}</div>`;
            } finally {
              generateBtn.disabled = false;
              generateBtn.textContent = 'Generate Weekly Summary';
            }
          });
        }

      } catch (error) {
        console.error('Error initializing dashboard:', error);
        document.body.innerHTML = `
          <div style="text-align: center; margin-top: 100px; color: var(--accent-red);">
            <h2>Error Loading Dashboard</h2>
            <p>${error.message}</p>
            <p style="color: var(--text-muted); margin-top: 20px;">Make sure you have data in IndexedDB.</p>
          </div>
        `;
      }
    }

    // Initialize on page load
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }

    // Optional: Set OpenAI API key
    // Uncomment and add your key, or use localStorage
    // WeeklySummary.setApiKey('your-openai-api-key-here');