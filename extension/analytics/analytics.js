// ═══════════════════════════════════════════════════════════════════════════════
//  ANALYTICS.JS — Data Aggregation & Analytics Engine for Reflekt
//  All analytics computations separated from visualization logic
//  Uses existing IndexedDB data — NO fake data, NO database rewrites
// ═══════════════════════════════════════════════════════════════════════════════

const Analytics = (() => {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  //  UTILITIES
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get date string in YYYY-MM-DD format
   * @param {Date} date - Date object
   * @returns {string} - Formatted date string
   */
  function toDateKey(date) {
    return date.toISOString().split('T')[0];
  }

  /**
   * Get date N days ago
   * @param {number} days - Number of days to go back
   * @returns {Date}
   */
  function daysAgo(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d;
  }

  /**
   * Get hour from timestamp (0-23)
   * @param {number} timestamp - Unix timestamp
   * @returns {number}
   */
  function getHour(timestamp) {
    return new Date(timestamp).getHours();
  }

  /**
   * Safe division with fallback
   * @param {number} numerator
   * @param {number} denominator
   * @returns {number}
   */
  function safeDivide(numerator, denominator) {
    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Calculate percentage
   * @param {number} part
   * @param {number} total
   * @returns {number} - Rounded percentage
   */
  function pct(part, total) {
    return Math.round(safeDivide(part, total) * 100);
  }

  /**
   * Round to N decimal places
   * @param {number} num
   * @param {number} decimals
   * @returns {number}
   */
  function round(num, decimals = 1) {
    const factor = Math.pow(10, decimals);
    return Math.round(num * factor) / factor;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  1. ACTIVITY & PRODUCTIVITY ANALYTICS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get daily activity data for the last N days
   * @param {Array} dailyStats - Array from daily_stats table
   * @param {number} days - Number of days to analyze
   * @returns {Array} - Daily activity with runs, submits, AC counts
   */
  function getDailyActivity(dailyStats, days = 30) {
    const result = [];
    const today = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const date = daysAgo(i);
      const key = toDateKey(date);
      const stats = dailyStats.find(s => s.date === key);

      result.push({
        date: key,
        dayLabel: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        runs: stats?.runs || 0,
        submits: stats?.submits || 0,
        total: (stats?.runs || 0) + (stats?.submits || 0),
        ac: stats?.ac || 0,
        errors: (stats?.tle || 0) + (stats?.re || 0) + (stats?.ce || 0) + (stats?.wa || 0)
      });
    }

    return result;
  }

  /**
   * Calculate 7-day rolling average
   * @param {Array} dailyActivity - Output from getDailyActivity
   * @returns {Array} - Same structure with added rollingAvg property
   */
  function addRollingAverage(dailyActivity) {
    return dailyActivity.map((day, idx) => {
      const windowStart = Math.max(0, idx - 6);
      const window = dailyActivity.slice(windowStart, idx + 1);
      const sum = window.reduce((acc, d) => acc + d.total, 0);
      const avg = round(sum / window.length, 1);

      return { ...day, rollingAvg: avg };
    });
  }

  /**
   * Calculate run vs submit ratio
   * @param {Array} runs - All runs from runs table
   * @returns {Object} - Run/submit statistics
   */
  function getRunSubmitRatio(runs) {
    const runCount = runs.filter(r => r.action === 'run').length;
    const submitCount = runs.filter(r => r.action === 'submit').length;
    const total = runCount + submitCount;

    return {
      runs: runCount,
      submits: submitCount,
      total,
      runPercentage: pct(runCount, total),
      submitPercentage: pct(submitCount, total),
      ratio: submitCount > 0 ? round(runCount / submitCount, 2) : 0
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  2. PERFORMANCE ANALYTICS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Calculate overall accuracy
   * @param {Array} runs - All runs from runs table
   * @returns {Object} - Accuracy metrics
   */
  function getOverallAccuracy(runs) {
    const total = runs.length;
    const acCount = runs.filter(r => r.status === 'AC').length;
    const accuracy = pct(acCount, total);

    return {
      total,
      acCount,
      errorCount: total - acCount,
      accuracy,
      accuracyLabel: accuracy >= 80 ? 'Excellent' : accuracy >= 60 ? 'Good' : accuracy >= 40 ? 'Fair' : 'Needs Work'
    };
  }

  /**
   * Get error distribution
   * @param {Array} runs - All runs from runs table
   * @returns {Object} - Error breakdown by type
   */
  function getErrorDistribution(runs) {
    const statusMap = {
      AC: 0,
      TLE: 0,
      RE: 0,
      CE: 0,
      WA: 0,
      Other: 0
    };

    runs.forEach(r => {
      const status = r.status;
      if (statusMap.hasOwnProperty(status)) {
        statusMap[status]++;
      } else {
        statusMap.Other++;
      }
    });

    const total = runs.length;

    return {
      counts: statusMap,
      percentages: Object.keys(statusMap).reduce((acc, key) => {
        acc[key] = pct(statusMap[key], total);
        return acc;
      }, {}),
      total,
      mostCommonError: Object.entries(statusMap)
        .filter(([key]) => key !== 'AC')
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'None'
    };
  }

  /**
   * Calculate attempts before AC for each question
   * @param {Array} questionStats - All questions from question_stats table
   * @returns {Object} - Attempts analysis
   */
  function getAttemptsBeforeAC(questionStats) {
    const solvedQuestions = questionStats.filter(q => q.acCount > 0);
    
    const attemptsData = solvedQuestions.map(q => ({
      questionId: q.questionId,
      attempts: q.totalAttempts,
      attemptsBeforeFirstAC: q.attemptsBeforeFirstAC || q.totalAttempts
    }));

    const totalAttempts = attemptsData.reduce((sum, q) => sum + q.attemptsBeforeFirstAC, 0);
    const avgAttempts = round(safeDivide(totalAttempts, solvedQuestions.length), 1);

    // Distribution buckets
    const distribution = {
      firstTry: attemptsData.filter(q => q.attemptsBeforeFirstAC === 1).length,
      twoToThree: attemptsData.filter(q => q.attemptsBeforeFirstAC >= 2 && q.attemptsBeforeFirstAC <= 3).length,
      fourToFive: attemptsData.filter(q => q.attemptsBeforeFirstAC >= 4 && q.attemptsBeforeFirstAC <= 5).length,
      moreThanFive: attemptsData.filter(q => q.attemptsBeforeFirstAC > 5).length
    };

    return {
      avgAttempts,
      distribution,
      solvedCount: solvedQuestions.length,
      firstTrySuccessRate: pct(distribution.firstTry, solvedQuestions.length)
    };
  }

  /**
   * Calculate time to solve distribution
   * @param {Array} questionStats - All questions from question_stats table
   * @returns {Object} - Time analysis
   */
  function getTimeToSolveDistribution(questionStats) {
    const solvedWithTime = questionStats.filter(q => q.timeToSolve && q.timeToSolve > 0);

    if (solvedWithTime.length === 0) {
      return {
        avgTimeMinutes: 0,
        medianTimeMinutes: 0,
        distribution: { under5: 0, under15: 0, under30: 0, over30: 0 },
        count: 0
      };
    }

    const times = solvedWithTime.map(q => q.timeToSolve / 1000 / 60); // Convert to minutes
    const sum = times.reduce((a, b) => a + b, 0);
    const avg = round(sum / times.length, 1);

    const sorted = [...times].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    const distribution = {
      under5: times.filter(t => t < 5).length,
      under15: times.filter(t => t >= 5 && t < 15).length,
      under30: times.filter(t => t >= 15 && t < 30).length,
      over30: times.filter(t => t >= 30).length
    };

    return {
      avgTimeMinutes: avg,
      medianTimeMinutes: round(median, 1),
      distribution,
      count: solvedWithTime.length
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  3. DIFFICULTY ANALYTICS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Analyze performance by difficulty level
   * @param {Array} questionStats - All questions from question_stats table
   * @param {Array} runs - All runs from runs table
   * @returns {Object} - Difficulty breakdown
   */
  function getDifficultyAnalytics(questionStats, runs) {
    const difficulties = ['Easy', 'Medium', 'Hard'];
    const result = {};

    difficulties.forEach(diff => {
      const questions = questionStats.filter(q => q.difficulty === diff);
      const questionIds = questions.map(q => q.questionId);
      const relevantRuns = runs.filter(r => questionIds.includes(r.questionId));

      const totalRuns = relevantRuns.length;
      const acCount = relevantRuns.filter(r => r.status === 'AC').length;
      const totalAttempts = questions.reduce((sum, q) => sum + q.totalAttempts, 0);
      const avgAttempts = round(safeDivide(totalAttempts, questions.length), 1);

      const solvedQuestions = questions.filter(q => q.acCount > 0);
      const timesToSolve = solvedQuestions
        .filter(q => q.timeToSolve && q.timeToSolve > 0)
        .map(q => q.timeToSolve / 1000 / 60);
      const avgTimeToSolve = timesToSolve.length > 0
        ? round(timesToSolve.reduce((a, b) => a + b, 0) / timesToSolve.length, 1)
        : 0;

      result[diff] = {
        questionCount: questions.length,
        totalRuns,
        acCount,
        accuracy: pct(acCount, totalRuns),
        avgAttempts,
        avgTimeToSolve,
        solvedCount: solvedQuestions.length
      };
    });

    return result;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  4. TOPIC INTELLIGENCE
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Analyze performance by topic
   * @param {Array} questionStats - All questions from question_stats table
   * @param {Array} runs - All runs from runs table
   * @returns {Array} - Topic performance data
   */
  function getTopicPerformance(questionStats, runs) {
    const topicMap = {};

    // Aggregate by topic
    questionStats.forEach(q => {
      (q.topics || []).forEach(topic => {
        if (!topicMap[topic]) {
          topicMap[topic] = {
            topic,
            questions: [],
            totalAttempts: 0,
            totalAC: 0,
            totalErrors: 0,
            totalTimeToSolve: 0,
            timeCount: 0
          };
        }
        topicMap[topic].questions.push(q);
        topicMap[topic].totalAttempts += q.totalAttempts;
        topicMap[topic].totalAC += q.acCount;
        topicMap[topic].totalErrors += (q.tleCount || 0) + (q.reCount || 0) + (q.ceCount || 0) + (q.waCount || 0);
        if (q.timeToSolve && q.timeToSolve > 0) {
          topicMap[topic].totalTimeToSolve += q.timeToSolve;
          topicMap[topic].timeCount++;
        }
      });
    });

    // Calculate metrics for each topic
    return Object.values(topicMap).map(t => {
      const questionCount = t.questions.length;
      const relevantRuns = runs.filter(r => 
        t.questions.some(q => q.questionId === r.questionId)
      );
      const totalRuns = relevantRuns.length;
      const acRuns = relevantRuns.filter(r => r.status === 'AC').length;

      return {
        topic: t.topic,
        questionCount,
        totalAttempts: t.totalAttempts,
        acRate: pct(acRuns, totalRuns),
        avgAttempts: round(safeDivide(t.totalAttempts, questionCount), 1),
        avgTimeToSolve: t.timeCount > 0 
          ? round(t.totalTimeToSolve / t.timeCount / 1000 / 60, 1)
          : 0,
        errorCount: t.totalErrors,
        solvedCount: t.questions.filter(q => q.acCount > 0).length
      };
    }).sort((a, b) => b.questionCount - a.questionCount);
  }

  /**
   * Find most error-prone topics
   * @param {Array} topicPerformance - Output from getTopicPerformance
   * @returns {Array} - Topics sorted by error count
   */
  function getMostErrorProneTopics(topicPerformance) {
    return [...topicPerformance]
      .filter(t => t.errorCount > 0)
      .sort((a, b) => b.errorCount - a.errorCount)
      .slice(0, 5);
  }

  /**
   * Find most time-consuming topics
   * @param {Array} topicPerformance - Output from getTopicPerformance
   * @returns {Array} - Topics sorted by avg time to solve
   */
  function getMostTimeConsumingTopics(topicPerformance) {
    return [...topicPerformance]
      .filter(t => t.avgTimeToSolve > 0)
      .sort((a, b) => b.avgTimeToSolve - a.avgTimeToSolve)
      .slice(0, 5);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  5. BEHAVIORAL PATTERNS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Analyze performance by time of day
   * @param {Array} runs - All runs from runs table
   * @returns {Array} - Hourly performance stats
   */
  function getTimeOfDayPerformance(runs) {
    const hourMap = {};

    // Initialize all hours
    for (let h = 0; h < 24; h++) {
      hourMap[h] = { hour: h, runs: 0, ac: 0, errors: 0 };
    }

    // Aggregate by hour
    runs.forEach(r => {
      const hour = getHour(r.timestamp);
      hourMap[hour].runs++;
      if (r.status === 'AC') {
        hourMap[hour].ac++;
      } else {
        hourMap[hour].errors++;
      }
    });

    // Calculate accuracy for each hour
    return Object.values(hourMap).map(h => ({
      ...h,
      accuracy: pct(h.ac, h.runs),
      label: `${h.hour.toString().padStart(2, '0')}:00`
    }));
  }

  /**
   * Find most productive hours
   * @param {Array} timeOfDayPerformance - Output from getTimeOfDayPerformance
   * @returns {Object} - Best hours for accuracy and volume
   */
  function getMostProductiveHours(timeOfDayPerformance) {
    const activeHours = timeOfDayPerformance.filter(h => h.runs > 0);
    
    const byAccuracy = [...activeHours].sort((a, b) => b.accuracy - a.accuracy);
    const byVolume = [...activeHours].sort((a, b) => b.runs - a.runs);

    return {
      mostAccurate: byAccuracy.slice(0, 3),
      mostActive: byVolume.slice(0, 3)
    };
  }

  /**
   * Calculate weekly improvement trend
   * @param {Array} dailyStats - All daily stats
   * @returns {Object} - Week-over-week comparison
   */
  function getWeeklyImprovementTrend(dailyStats) {
    const now = Date.now();
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    const twoWeeks = 14 * 24 * 60 * 60 * 1000;

    // Current week (last 7 days)
    const thisWeekStart = toDateKey(daysAgo(7));
    const thisWeekEnd = toDateKey(new Date());
    const thisWeekStats = dailyStats.filter(d => d.date >= thisWeekStart && d.date <= thisWeekEnd);

    // Previous week (8-14 days ago)
    const lastWeekStart = toDateKey(daysAgo(14));
    const lastWeekEnd = toDateKey(daysAgo(7));
    const lastWeekStats = dailyStats.filter(d => d.date >= lastWeekStart && d.date < lastWeekEnd);

    const thisWeekTotal = thisWeekStats.reduce((sum, d) => sum + d.runs + d.submits, 0);
    const thisWeekAC = thisWeekStats.reduce((sum, d) => sum + d.ac, 0);
    const thisWeekAccuracy = pct(thisWeekAC, thisWeekTotal);

    const lastWeekTotal = lastWeekStats.reduce((sum, d) => sum + d.runs + d.submits, 0);
    const lastWeekAC = lastWeekStats.reduce((sum, d) => sum + d.ac, 0);
    const lastWeekAccuracy = pct(lastWeekAC, lastWeekTotal);

    const activityChange = thisWeekTotal - lastWeekTotal;
    const accuracyChange = thisWeekAccuracy - lastWeekAccuracy;

    return {
      thisWeek: {
        total: thisWeekTotal,
        ac: thisWeekAC,
        accuracy: thisWeekAccuracy
      },
      lastWeek: {
        total: lastWeekTotal,
        ac: lastWeekAC,
        accuracy: lastWeekAccuracy
      },
      changes: {
        activity: activityChange,
        accuracy: accuracyChange,
        activityTrend: activityChange > 0 ? 'up' : activityChange < 0 ? 'down' : 'stable',
        accuracyTrend: accuracyChange > 5 ? 'improving' : accuracyChange < -5 ? 'declining' : 'stable'
      }
    };
  }

  /**
   * Get hardest questions by error count
   * @param {Array} questionStats - All questions from question_stats table
   * @param {number} limit - Number of questions to return
   * @returns {Array} - Hardest questions
   */
  function getHardestQuestions(questionStats, limit = 10) {
    return questionStats
      .map(q => ({
        questionId: q.questionId,
        difficulty: q.difficulty,
        topics: q.topics,
        totalAttempts: q.totalAttempts,
        errorCount: (q.tleCount || 0) + (q.reCount || 0) + (q.ceCount || 0) + (q.waCount || 0),
        lastStatus: q.lastStatus,
        solved: q.acCount > 0
      }))
      .filter(q => q.errorCount > 0)
      .sort((a, b) => b.errorCount - a.errorCount)
      .slice(0, limit);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  6. COMPREHENSIVE DASHBOARD DATA
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Generate all analytics for dashboard in one call
   * @param {Object} data - Raw data from IndexedDB {runs, questionStats, dailyStats}
   * @returns {Object} - Complete analytics object
   */
  function generateAllAnalytics(data) {
    const { runs, questionStats, dailyStats } = data;

    // Activity & Productivity
    const dailyActivity = getDailyActivity(dailyStats, 30);
    const dailyActivityWithRolling = addRollingAverage(dailyActivity);
    const runSubmitRatio = getRunSubmitRatio(runs);

    // Performance
    const overallAccuracy = getOverallAccuracy(runs);
    const errorDistribution = getErrorDistribution(runs);
    const attemptsBeforeAC = getAttemptsBeforeAC(questionStats);
    const timeToSolve = getTimeToSolveDistribution(questionStats);

    // Difficulty
    const difficultyAnalytics = getDifficultyAnalytics(questionStats, runs);

    // Topics
    const topicPerformance = getTopicPerformance(questionStats, runs);
    const errorProneTopics = getMostErrorProneTopics(topicPerformance);
    const timeConsumingTopics = getMostTimeConsumingTopics(topicPerformance);

    // Behavioral
    const timeOfDayPerformance = getTimeOfDayPerformance(runs);
    const productiveHours = getMostProductiveHours(timeOfDayPerformance);
    const weeklyTrend = getWeeklyImprovementTrend(dailyStats);
    const hardestQuestions = getHardestQuestions(questionStats, 10);

    return {
      activity: {
        daily: dailyActivityWithRolling,
        runSubmitRatio
      },
      performance: {
        overall: overallAccuracy,
        errorDistribution,
        attemptsBeforeAC,
        timeToSolve
      },
      difficulty: difficultyAnalytics,
      topics: {
        all: topicPerformance,
        errorProne: errorProneTopics,
        timeConsuming: timeConsumingTopics
      },
      behavioral: {
        timeOfDay: timeOfDayPerformance,
        productiveHours,
        weeklyTrend,
        hardestQuestions
      },
      summary: {
        totalRuns: runs.length,
        totalQuestions: questionStats.length,
        solvedQuestions: questionStats.filter(q => q.acCount > 0).length,
        overallAccuracy: overallAccuracy.accuracy,
        avgAttempts: attemptsBeforeAC.avgAttempts
      }
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  PUBLIC API
  // ─────────────────────────────────────────────────────────────────────────────

  return {
    // Comprehensive
    generateAllAnalytics,

    // Activity
    getDailyActivity,
    addRollingAverage,
    getRunSubmitRatio,

    // Performance
    getOverallAccuracy,
    getErrorDistribution,
    getAttemptsBeforeAC,
    getTimeToSolveDistribution,

    // Difficulty
    getDifficultyAnalytics,

    // Topics
    getTopicPerformance,
    getMostErrorProneTopics,
    getMostTimeConsumingTopics,

    // Behavioral
    getTimeOfDayPerformance,
    getMostProductiveHours,
    getWeeklyImprovementTrend,
    getHardestQuestions
  };
})();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Analytics;
}
