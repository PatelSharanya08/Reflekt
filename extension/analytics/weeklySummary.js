// ═══════════════════════════════════════════════════════════════════════════════
//  WEEKLYSUMMARY.JS — AI Integration for Weekly Performance Insights
//  Aggregates data and sends to LLM for personalized recommendations
// ═══════════════════════════════════════════════════════════════════════════════

const WeeklySummary = (() => {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  //  CONFIGURATION
  // ─────────────────────────────────────────────────────────────────────────────

  const CONFIG = {
    // Set your OpenAI API key here or in localStorage
    apiKey: localStorage.getItem('OPENAI_API_KEY') || '',
    apiEndpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini', // Use gpt-4 for better quality, gpt-3.5-turbo for cost
    maxTokens: 1500,
    temperature: 0.7
  };

  // ─────────────────────────────────────────────────────────────────────────────
  //  DATA AGGREGATION
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Build comprehensive JSON summary for the past 7 days
   * @param {Object} data - Raw IndexedDB data {runs, questionStats, dailyStats}
   * @returns {Object} - Structured summary for LLM
   */
  async function buildWeeklySummaryJSON(data) {
    const { runs, questionStats, dailyStats } = data;

    // Filter last 7 days
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const recentRuns = runs.filter(r => r.timestamp >= sevenDaysAgo);
    
    // Get daily stats for last 7 days
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      last7Days.push(key);
    }
    const recentDailyStats = dailyStats.filter(d => last7Days.includes(d.date));

    // ── Overall Statistics ──
    const totalRuns = recentRuns.length;
    const totalSubmits = recentRuns.filter(r => r.action === 'submit').length;
    const acCount = recentRuns.filter(r => r.status === 'AC').length;
    const overallAccuracy = totalRuns > 0 ? Math.round((acCount / totalRuns) * 100) : 0;

    // ── Difficulty Breakdown ──
    const difficultyMap = { Easy: 0, Medium: 0, Hard: 0 };
    const difficultyAC = { Easy: 0, Medium: 0, Hard: 0 };
    
    recentRuns.forEach(r => {
      if (r.difficulty && difficultyMap[r.difficulty] !== undefined) {
        difficultyMap[r.difficulty]++;
        if (r.status === 'AC') difficultyAC[r.difficulty]++;
      }
    });

    const difficultyBreakdown = {
      Easy: {
        attempted: difficultyMap.Easy,
        solved: difficultyAC.Easy,
        accuracy: difficultyMap.Easy > 0 ? Math.round((difficultyAC.Easy / difficultyMap.Easy) * 100) : 0
      },
      Medium: {
        attempted: difficultyMap.Medium,
        solved: difficultyAC.Medium,
        accuracy: difficultyMap.Medium > 0 ? Math.round((difficultyAC.Medium / difficultyMap.Medium) * 100) : 0
      },
      Hard: {
        attempted: difficultyMap.Hard,
        solved: difficultyAC.Hard,
        accuracy: difficultyMap.Hard > 0 ? Math.round((difficultyAC.Hard / difficultyMap.Hard) * 100) : 0
      }
    };

    // ── Topic Stats ──
    const topicMap = {};
    recentRuns.forEach(r => {
      (r.topics || []).forEach(topic => {
        if (!topicMap[topic]) {
          topicMap[topic] = { attempted: 0, solved: 0 };
        }
        topicMap[topic].attempted++;
        if (r.status === 'AC') topicMap[topic].solved++;
      });
    });

    const topicStats = Object.entries(topicMap).map(([topic, stats]) => ({
      topic,
      attempted: stats.attempted,
      solved: stats.solved,
      accuracy: Math.round((stats.solved / stats.attempted) * 100)
    })).sort((a, b) => b.attempted - a.attempted);

    // ── Error Analysis ──
    const errorMap = { TLE: 0, RE: 0, CE: 0, WA: 0 };
    recentRuns.forEach(r => {
      if (errorMap[r.status] !== undefined) {
        errorMap[r.status]++;
      }
    });

    const mostCommonError = Object.entries(errorMap)
      .sort((a, b) => b[1] - a[1])
      .filter(([, count]) => count > 0)[0]?.[0] || 'None';

    // ── Attempts Analysis ──
    const recentQuestionIds = [...new Set(recentRuns.map(r => r.questionId))];
    const recentQuestions = questionStats.filter(q => recentQuestionIds.includes(q.questionId));
    
    const totalAttempts = recentQuestions.reduce((sum, q) => sum + q.totalAttempts, 0);
    const avgAttempts = recentQuestions.length > 0 
      ? Math.round((totalAttempts / recentQuestions.length) * 10) / 10 
      : 0;

    // ── Time to Solve ──
    const solvedWithTime = recentQuestions.filter(q => q.timeToSolve && q.timeToSolve > 0);
    const avgTimeToSolve = solvedWithTime.length > 0
      ? Math.round(solvedWithTime.reduce((sum, q) => sum + (q.timeToSolve / 1000 / 60), 0) / solvedWithTime.length)
      : 0;

    // ── Hardest Questions ──
    const hardestQuestions = recentQuestions
      .map(q => ({
        questionId: q.questionId,
        difficulty: q.difficulty,
        attempts: q.totalAttempts,
        errors: (q.tleCount || 0) + (q.reCount || 0) + (q.ceCount || 0) + (q.waCount || 0),
        solved: q.acCount > 0
      }))
      .filter(q => q.errors > 0)
      .sort((a, b) => b.errors - a.errors)
      .slice(0, 5);

    // ── Improvement Trend ──
    // Compare first 3 days vs last 3 days of the week
    const firstHalf = recentDailyStats.slice(0, 3);
    const secondHalf = recentDailyStats.slice(-3);

    const firstHalfAC = firstHalf.reduce((sum, d) => sum + (d.ac || 0), 0);
    const firstHalfTotal = firstHalf.reduce((sum, d) => sum + (d.runs || 0) + (d.submits || 0), 0);
    const firstHalfAccuracy = firstHalfTotal > 0 ? Math.round((firstHalfAC / firstHalfTotal) * 100) : 0;

    const secondHalfAC = secondHalf.reduce((sum, d) => sum + (d.ac || 0), 0);
    const secondHalfTotal = secondHalf.reduce((sum, d) => sum + (d.runs || 0) + (d.submits || 0), 0);
    const secondHalfAccuracy = secondHalfTotal > 0 ? Math.round((secondHalfAC / secondHalfTotal) * 100) : 0;

    const accuracyChange = secondHalfAccuracy - firstHalfAccuracy;
    const volumeChange = secondHalfTotal - firstHalfTotal;

    const improvementTrend = {
      accuracyChange,
      volumeChange,
      trend: accuracyChange > 5 ? 'improving' : accuracyChange < -5 ? 'declining' : 'stable',
      description: accuracyChange > 5 
        ? `Accuracy improved by ${accuracyChange}% this week`
        : accuracyChange < -5
        ? `Accuracy declined by ${Math.abs(accuracyChange)}% this week`
        : 'Performance is stable'
    };

    // ── Time of Day Stats ──
    const hourMap = {};
    recentRuns.forEach(r => {
      const hour = new Date(r.timestamp).getHours();
      if (!hourMap[hour]) hourMap[hour] = { total: 0, ac: 0 };
      hourMap[hour].total++;
      if (r.status === 'AC') hourMap[hour].ac++;
    });

    const bestHour = Object.entries(hourMap)
      .map(([hour, stats]) => ({
        hour: parseInt(hour),
        accuracy: Math.round((stats.ac / stats.total) * 100),
        volume: stats.total
      }))
      .sort((a, b) => b.accuracy - a.accuracy)[0];

    const timeOfDayStats = {
      mostProductiveHour: bestHour ? `${bestHour.hour}:00` : 'N/A',
      peakAccuracy: bestHour ? bestHour.accuracy : 0
    };

    // ── Daily Activity ──
    const dailyActivity = recentDailyStats.map(d => ({
      date: d.date,
      total: (d.runs || 0) + (d.submits || 0),
      ac: d.ac || 0
    }));

    // ── Build Final Summary ──
    return {
      period: '7 days',
      generatedAt: new Date().toISOString(),
      overview: {
        totalRuns,
        totalSubmits,
        totalAttempts: totalRuns + totalSubmits,
        overallAccuracy,
        uniqueQuestions: recentQuestionIds.length,
        solvedQuestions: recentQuestions.filter(q => q.acCount > 0).length
      },
      difficultyBreakdown,
      topicStats: topicStats.slice(0, 10), // Top 10 topics
      errors: {
        distribution: errorMap,
        mostCommon: mostCommonError,
        totalErrors: Object.values(errorMap).reduce((a, b) => a + b, 0)
      },
      attempts: {
        avgAttempts,
        totalQuestions: recentQuestions.length
      },
      timeToSolve: {
        avgMinutes: avgTimeToSolve,
        questionsWithTimeData: solvedWithTime.length
      },
      hardestQuestions,
      improvementTrend,
      timeOfDayStats,
      dailyActivity,
      recommendations: {
        // Will be filled by LLM
        placeholder: 'This will be replaced by AI-generated insights'
      }
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  LLM INTEGRATION
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Create prompt for LLM based on weekly summary
   * @param {Object} summary - Output from buildWeeklySummaryJSON
   * @returns {string} - Formatted prompt
   */
  function createPrompt(summary) {
    return `You are an expert coding mentor analyzing a student's LeetCode practice performance over the past 7 days.

**Performance Summary:**
- Total Attempts: ${summary.overview.totalAttempts} (${summary.overview.totalRuns} runs, ${summary.overview.totalSubmits} submits)
- Overall Accuracy: ${summary.overview.overallAccuracy}%
- Questions Attempted: ${summary.overview.uniqueQuestions}
- Questions Solved: ${summary.overview.solvedQuestions}

**Difficulty Breakdown:**
- Easy: ${summary.difficultyBreakdown.Easy.attempted} attempts, ${summary.difficultyBreakdown.Easy.accuracy}% accuracy
- Medium: ${summary.difficultyBreakdown.Medium.attempted} attempts, ${summary.difficultyBreakdown.Medium.accuracy}% accuracy
- Hard: ${summary.difficultyBreakdown.Hard.attempted} attempts, ${summary.difficultyBreakdown.Hard.accuracy}% accuracy

**Top Topics Practiced:**
${summary.topicStats.slice(0, 5).map(t => `- ${t.topic}: ${t.attempted} attempts, ${t.accuracy}% accuracy`).join('\n')}

**Common Errors:**
- Most Common: ${summary.errors.mostCommon}
- Total Errors: ${summary.errors.totalErrors}
${Object.entries(summary.errors.distribution).filter(([, c]) => c > 0).map(([type, count]) => `- ${type}: ${count}`).join('\n')}

**Performance Metrics:**
- Average Attempts per Question: ${summary.attempts.avgAttempts}
- Average Time to Solve: ${summary.timeToSolve.avgMinutes} minutes
- Most Productive Hour: ${summary.timeOfDayStats.mostProductiveHour} (${summary.timeOfDayStats.peakAccuracy}% accuracy)

**Improvement Trend:**
${summary.improvementTrend.description}

**Hardest Questions This Week:**
${summary.hardestQuestions.map(q => `- ${q.questionId} (${q.difficulty}): ${q.attempts} attempts, ${q.errors} errors${q.solved ? ' ✓ SOLVED' : ''}`).join('\n')}

Based on this data, provide:

1. **Key Strengths** (2-3 points): What is the student doing well?

2. **Areas for Improvement** (2-3 points): What needs work?

3. **Specific Action Items** (3-5 items): Concrete steps to improve next week. Be specific about:
   - Which topics to focus on
   - What difficulty level to target
   - Any patterns to address (error types, time management, etc.)

4. **Motivational Message**: A brief, encouraging message based on their progress.

Format your response as JSON:
{
  "strengths": ["strength 1", "strength 2"],
  "weaknesses": ["weakness 1", "weakness 2"],
  "actionItems": [
    {"action": "Specific action", "reason": "Why this helps"},
    ...
  ],
  "motivation": "Encouraging message"
}`;
  }

  /**
   * Send weekly summary to LLM and get recommendations
   * @param {Object} summary - Output from buildWeeklySummaryJSON
   * @returns {Promise<Object>} - LLM response with recommendations
   */
  async function sendWeeklySummaryToLLM(summary) {
    // Check API key
    if (!CONFIG.apiKey) {
      throw new Error('OpenAI API key not configured. Set it in localStorage as OPENAI_API_KEY or in CONFIG.');
    }

    const prompt = createPrompt(summary);

    try {
      const response = await fetch(CONFIG.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${CONFIG.apiKey}`
        },
        body: JSON.stringify({
          model: CONFIG.model,
          messages: [
            {
              role: 'system',
              content: 'You are an expert coding mentor providing personalized feedback. Always respond with valid JSON.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: CONFIG.maxTokens,
          temperature: CONFIG.temperature
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;

      // Parse JSON response
      let recommendations;
      try {
        // Try to extract JSON from markdown code blocks if present
        const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/```\n([\s\S]*?)\n```/);
        const jsonString = jsonMatch ? jsonMatch[1] : content;
        recommendations = JSON.parse(jsonString);
      } catch (parseError) {
        console.error('Failed to parse LLM response as JSON:', content);
        // Return raw content if JSON parsing fails
        recommendations = {
          strengths: ['Analysis generated successfully'],
          weaknesses: ['See raw response for details'],
          actionItems: [{ action: 'Review raw response', reason: 'JSON parsing failed' }],
          motivation: content,
          rawResponse: content
        };
      }

      return {
        success: true,
        summary,
        recommendations,
        generatedAt: new Date().toISOString(),
        model: CONFIG.model
      };

    } catch (error) {
      console.error('Error calling LLM:', error);
      return {
        success: false,
        error: error.message,
        summary
      };
    }
  }

  /**
   * Generate and send weekly summary in one call
   * @param {Object} data - Raw IndexedDB data
   * @returns {Promise<Object>} - Complete analysis with LLM recommendations
   */
  async function generateWeeklyInsights(data) {
    try {
      const summary = await buildWeeklySummaryJSON(data);
      const result = await sendWeeklySummaryToLLM(summary);
      return result;
    } catch (error) {
      console.error('Error generating weekly insights:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Save AI analysis to IndexedDB for history
   * @param {Object} analysis - Output from sendWeeklySummaryToLLM
   */
  async function saveAnalysisToHistory(analysis) {
    const DB_NAME = 'CodeTrackerDB';
    const DB_VERSION = 3; // Increment version to add new store

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('ai_analyses')) {
          const store = db.createObjectStore('ai_analyses', {
            keyPath: 'id',
            autoIncrement: true
          });
          store.createIndex('generatedAt', 'generatedAt');
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('ai_analyses', 'readwrite');
        const store = tx.objectStore('ai_analyses');
        
        store.add(analysis);
        
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get analysis history
   * @returns {Promise<Array>} - All saved analyses
   */
  async function getAnalysisHistory() {
    const DB_NAME = 'CodeTrackerDB';
    
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME);
      
      request.onsuccess = () => {
        const db = request.result;
        
        if (!db.objectStoreNames.contains('ai_analyses')) {
          resolve([]);
          return;
        }
        
        const tx = db.transaction('ai_analyses', 'readonly');
        const store = tx.objectStore('ai_analyses');
        const getAllRequest = store.getAll();
        
        getAllRequest.onsuccess = () => resolve(getAllRequest.result);
        getAllRequest.onerror = () => reject(getAllRequest.error);
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  PUBLIC API
  // ─────────────────────────────────────────────────────────────────────────────

  return {
    buildWeeklySummaryJSON,
    sendWeeklySummaryToLLM,
    generateWeeklyInsights,
    saveAnalysisToHistory,
    getAnalysisHistory,
    setApiKey: (key) => {
      CONFIG.apiKey = key;
      localStorage.setItem('OPENAI_API_KEY', key);
    }
  };
})();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WeeklySummary;
}
