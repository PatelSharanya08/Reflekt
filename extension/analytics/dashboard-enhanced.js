// ═══════════════════════════════════════════════════════════════════════════════
//  DASHBOARD.JS — Visualization & UI Layer for Analytics
//  Renders all analytics using vanilla JS (no external chart libraries)
//  Integrates with analytics.js for data computation
// ═══════════════════════════════════════════════════════════════════════════════

const Dashboard = (() => {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  //  SIMPLE SVG CHART UTILITIES (No dependencies!)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Create line chart using SVG
   * @param {HTMLElement} container - Container element
   * @param {Array} data - Data points
   * @param {Object} options - Chart options
   */
  function renderLineChart(container, data, options = {}) {
    const {
      width = container.offsetWidth,
      height = 200,
      color = '#00ff41',
      fillOpacity = 0.1,
      showPoints = false
    } = options;

    if (data.length === 0) return;

    const maxValue = Math.max(...data, 1);
    const padding = 20;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    const stepX = chartWidth / (data.length - 1);

    // Create SVG
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.style.display = 'block';

    // Create path for line
    let pathD = '';
    let areaD = '';
    
    data.forEach((value, i) => {
      const x = padding + i * stepX;
      const y = padding + chartHeight - (value / maxValue) * chartHeight;
      
      if (i === 0) {
        pathD += `M ${x} ${y}`;
        areaD += `M ${padding} ${padding + chartHeight} L ${x} ${y}`;
      } else {
        pathD += ` L ${x} ${y}`;
        areaD += ` L ${x} ${y}`;
      }
    });

    areaD += ` L ${padding + (data.length - 1) * stepX} ${padding + chartHeight} Z`;

    // Area fill
    const area = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    area.setAttribute('d', areaD);
    area.setAttribute('fill', color);
    area.setAttribute('opacity', fillOpacity);
    svg.appendChild(area);

    // Line stroke
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathD);
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', '2');
    path.setAttribute('fill', 'none');
    svg.appendChild(path);

    // Points (optional)
    if (showPoints) {
      data.forEach((value, i) => {
        const x = padding + i * stepX;
        const y = padding + chartHeight - (value / maxValue) * chartHeight;
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x);
        circle.setAttribute('cy', y);
        circle.setAttribute('r', '3');
        circle.setAttribute('fill', color);
        svg.appendChild(circle);
      });
    }

    container.innerHTML = '';
    container.appendChild(svg);
  }

  /**
   * Create bar chart using SVG
   * @param {HTMLElement} container - Container element
   * @param {Array} data - Array of {label, value}
   * @param {Object} options - Chart options
   */
  function renderBarChart(container, data, options = {}) {
    const {
      width = container.offsetWidth,
      height = 200,
      color = '#00ff41',
      showLabels = true
    } = options;

    if (data.length === 0) return;

    const maxValue = Math.max(...data.map(d => d.value), 1);
    const padding = 40;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    const barWidth = chartWidth / data.length * 0.7;
    const barGap = chartWidth / data.length * 0.3;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);

    data.forEach((item, i) => {
      const barHeight = (item.value / maxValue) * chartHeight;
      const x = padding + i * (barWidth + barGap);
      const y = padding + chartHeight - barHeight;

      // Bar
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', x);
      rect.setAttribute('y', y);
      rect.setAttribute('width', barWidth);
      rect.setAttribute('height', barHeight);
      rect.setAttribute('fill', item.color || color);
      rect.setAttribute('rx', '2');
      svg.appendChild(rect);

      // Label
      if (showLabels) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', x + barWidth / 2);
        text.setAttribute('y', padding + chartHeight + 15);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '10');
        text.setAttribute('fill', '#3a5c3e');
        text.textContent = item.label;
        svg.appendChild(text);
      }
    });

    container.innerHTML = '';
    container.appendChild(svg);
  }

  /**
   * Create donut chart using SVG
   * @param {HTMLElement} container - Container element
   * @param {Array} data - Array of {label, value, color}
   * @param {Object} options - Chart options
   */
  function renderDonutChart(container, data, options = {}) {
    const {
      size = Math.min(container.offsetWidth, 200),
      innerRadius = 0.6
    } = options;

    const total = data.reduce((sum, d) => sum + d.value, 0);
    if (total === 0) return;

    const radius = size / 2;
    const center = radius;
    const outerR = radius * 0.9;
    const innerR = outerR * innerRadius;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);

    let currentAngle = -90; // Start from top

    data.forEach(item => {
      const angle = (item.value / total) * 360;
      const endAngle = currentAngle + angle;

      const path = createDonutSegment(center, center, outerR, innerR, currentAngle, endAngle);
      path.setAttribute('fill', item.color);
      path.setAttribute('class', 'donut-segment');
      svg.appendChild(path);

      currentAngle = endAngle;
    });

    container.innerHTML = '';
    container.appendChild(svg);
  }

  function createDonutSegment(cx, cy, outerR, innerR, startAngle, endAngle) {
    const toRadians = angle => (angle * Math.PI) / 180;
    
    const x1 = cx + outerR * Math.cos(toRadians(startAngle));
    const y1 = cy + outerR * Math.sin(toRadians(startAngle));
    const x2 = cx + outerR * Math.cos(toRadians(endAngle));
    const y2 = cy + outerR * Math.sin(toRadians(endAngle));
    const x3 = cx + innerR * Math.cos(toRadians(endAngle));
    const y3 = cy + innerR * Math.sin(toRadians(endAngle));
    const x4 = cx + innerR * Math.cos(toRadians(startAngle));
    const y4 = cy + innerR * Math.sin(toRadians(startAngle));

    const largeArc = endAngle - startAngle > 180 ? 1 : 0;

    const d = [
      `M ${x1} ${y1}`,
      `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${x3} ${y3}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4} ${y4}`,
      'Z'
    ].join(' ');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    return path;
  }

  /**
   * Create heatmap for time-of-day data
   * @param {HTMLElement} container - Container element
   * @param {Array} hourData - Array of hour performance data
   */
  function renderHeatmap(container, hourData) {
    container.innerHTML = '';
    
    const maxRuns = Math.max(...hourData.map(h => h.runs), 1);
    
    hourData.forEach((hour, i) => {
      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';
      
      // Calculate intensity (0-4 levels)
      const intensity = hour.runs === 0 ? 0 : 
                       hour.runs <= maxRuns * 0.25 ? 1 :
                       hour.runs <= maxRuns * 0.5 ? 2 :
                       hour.runs <= maxRuns * 0.75 ? 3 : 4;
      
      cell.classList.add(`level-${intensity}`);
      cell.setAttribute('data-hour', hour.label);
      cell.setAttribute('data-runs', hour.runs);
      cell.setAttribute('data-accuracy', `${hour.accuracy}%`);
      cell.title = `${hour.label}: ${hour.runs} runs, ${hour.accuracy}% accuracy`;
      
      container.appendChild(cell);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  RENDERING FUNCTIONS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Render activity section
   */
  function renderActivitySection(analytics) {
    const { daily, runSubmitRatio } = analytics.activity;

    // Daily activity line chart
    const activityChart = document.getElementById('activity-chart');
    if (activityChart) {
      renderLineChart(activityChart, daily.map(d => d.total), {
        color: '#00ff41',
        fillOpacity: 0.15
      });
    }

    // 7-day rolling average
    const rollingAvgChart = document.getElementById('rolling-avg-chart');
    if (rollingAvgChart) {
      renderLineChart(rollingAvgChart, daily.map(d => d.rollingAvg), {
        color: '#00ccff',
        fillOpacity: 0.1
      });
    }

    // Run vs Submit ratio
    const ratioEl = document.getElementById('run-submit-ratio');
    if (ratioEl) {
      ratioEl.innerHTML = `
        <div class="stat-card">
          <div class="stat-label">Runs</div>
          <div class="stat-value">${runSubmitRatio.runs}</div>
          <div class="stat-pct">${runSubmitRatio.runPercentage}%</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Submits</div>
          <div class="stat-value">${runSubmitRatio.submits}</div>
          <div class="stat-pct">${runSubmitRatio.submitPercentage}%</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Ratio</div>
          <div class="stat-value">${runSubmitRatio.ratio}:1</div>
        </div>
      `;
    }
  }

  /**
   * Render performance section
   */
  function renderPerformanceSection(analytics) {
    const { overall, errorDistribution, attemptsBeforeAC, timeToSolve } = analytics.performance;

    // Overall accuracy
    const accuracyEl = document.getElementById('overall-accuracy');
    if (accuracyEl) {
      accuracyEl.innerHTML = `
        <div class="accuracy-display">
          <div class="accuracy-value">${overall.accuracy}%</div>
          <div class="accuracy-label">${overall.accuracyLabel}</div>
          <div class="accuracy-breakdown">
            ${overall.acCount} AC / ${overall.errorCount} Errors
          </div>
        </div>
      `;
    }

    // Error distribution donut chart
    const errorChart = document.getElementById('error-distribution-chart');
    if (errorChart) {
      const colors = {
        AC: '#00ff41',
        TLE: '#ffb700',
        RE: '#ff2244',
        CE: '#ff8800',
        WA: '#ff4466',
        Other: '#666'
      };

      const chartData = Object.entries(errorDistribution.counts)
        .filter(([, value]) => value > 0)
        .map(([label, value]) => ({
          label,
          value,
          color: colors[label] || '#666'
        }));

      renderDonutChart(errorChart, chartData);
    }

    // Error legend
    const errorLegend = document.getElementById('error-legend');
    if (errorLegend) {
      errorLegend.innerHTML = Object.entries(errorDistribution.counts)
        .filter(([, count]) => count > 0)
        .map(([status, count]) => `
          <div class="legend-item">
            <span class="pill pill-${status}">${status}</span>
            <span class="legend-count">${count}</span>
            <span class="legend-pct">${errorDistribution.percentages[status]}%</span>
          </div>
        `).join('');
    }

    // Attempts before AC
    const attemptsEl = document.getElementById('attempts-stats');
    if (attemptsEl) {
      attemptsEl.innerHTML = `
        <div class="stat-row">
          <span>Average Attempts:</span>
          <span class="stat-value">${attemptsBeforeAC.avgAttempts}</span>
        </div>
        <div class="stat-row">
          <span>First Try Success:</span>
          <span class="stat-value">${attemptsBeforeAC.firstTrySuccessRate}%</span>
        </div>
        <div class="attempts-distribution">
          <div class="dist-item">
            <div class="dist-label">1 attempt</div>
            <div class="dist-bar">
              <div class="dist-fill" style="width: ${attemptsBeforeAC.distribution.firstTry / attemptsBeforeAC.solvedCount * 100}%"></div>
            </div>
            <div class="dist-count">${attemptsBeforeAC.distribution.firstTry}</div>
          </div>
          <div class="dist-item">
            <div class="dist-label">2-3 attempts</div>
            <div class="dist-bar">
              <div class="dist-fill" style="width: ${attemptsBeforeAC.distribution.twoToThree / attemptsBeforeAC.solvedCount * 100}%"></div>
            </div>
            <div class="dist-count">${attemptsBeforeAC.distribution.twoToThree}</div>
          </div>
          <div class="dist-item">
            <div class="dist-label">4-5 attempts</div>
            <div class="dist-bar">
              <div class="dist-fill" style="width: ${attemptsBeforeAC.distribution.fourToFive / attemptsBeforeAC.solvedCount * 100}%"></div>
            </div>
            <div class="dist-count">${attemptsBeforeAC.distribution.fourToFive}</div>
          </div>
          <div class="dist-item">
            <div class="dist-label">5+ attempts</div>
            <div class="dist-bar">
              <div class="dist-fill" style="width: ${attemptsBeforeAC.distribution.moreThanFive / attemptsBeforeAC.solvedCount * 100}%"></div>
            </div>
            <div class="dist-count">${attemptsBeforeAC.distribution.moreThanFive}</div>
          </div>
        </div>
      `;
    }

    // Time to solve
    const timeEl = document.getElementById('time-to-solve');
    if (timeEl && timeToSolve.count > 0) {
      timeEl.innerHTML = `
        <div class="stat-row">
          <span>Average Time:</span>
          <span class="stat-value">${timeToSolve.avgTimeMinutes} min</span>
        </div>
        <div class="stat-row">
          <span>Median Time:</span>
          <span class="stat-value">${timeToSolve.medianTimeMinutes} min</span>
        </div>
      `;
    }
  }

  /**
   * Render difficulty section
   */
  function renderDifficultySection(difficultyData) {
    const container = document.getElementById('difficulty-breakdown');
    if (!container) return;

    const difficulties = ['Easy', 'Medium', 'Hard'];
    const colors = { Easy: '#00cc33', Medium: '#ffb700', Hard: '#ff2244' };

    container.innerHTML = difficulties.map(diff => {
      const data = difficultyData[diff];
      return `
        <div class="difficulty-card ${diff.toLowerCase()}">
          <div class="diff-header">
            <span class="diff-label">${diff}</span>
            <span class="diff-accuracy">${data.accuracy}%</span>
          </div>
          <div class="diff-stats">
            <div class="diff-stat">
              <span class="diff-stat-label">Questions</span>
              <span class="diff-stat-value">${data.questionCount}</span>
            </div>
            <div class="diff-stat">
              <span class="diff-stat-label">Solved</span>
              <span class="diff-stat-value">${data.solvedCount}</span>
            </div>
            <div class="diff-stat">
              <span class="diff-stat-label">Avg Attempts</span>
              <span class="diff-stat-value">${data.avgAttempts}</span>
            </div>
            <div class="diff-stat">
              <span class="diff-stat-label">Avg Time</span>
              <span class="diff-stat-value">${data.avgTimeToSolve} min</span>
            </div>
          </div>
          <div class="diff-progress-bar">
            <div class="diff-progress-fill" style="width: ${data.accuracy}%; background: ${colors[diff]}"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Render topic intelligence section
   */
  function renderTopicSection(topicsData) {
    const { all, errorProne, timeConsuming } = topicsData;

    // Main topic performance table
    const tableContainer = document.getElementById('topic-performance-table');
    if (tableContainer && all.length > 0) {
      tableContainer.innerHTML = `
        <table class="topic-table">
          <thead>
            <tr>
              <th>Topic</th>
              <th>Questions</th>
              <th>AC Rate</th>
              <th>Avg Attempts</th>
              <th>Avg Time</th>
            </tr>
          </thead>
          <tbody>
            ${all.slice(0, 15).map(t => `
              <tr>
                <td><span class="topic-name">${t.topic}</span></td>
                <td>${t.questionCount}</td>
                <td>
                  <div class="accuracy-bar-container">
                    <div class="accuracy-bar-fill" style="width: ${t.acRate}%"></div>
                    <span class="accuracy-bar-text">${t.acRate}%</span>
                  </div>
                </td>
                <td>${t.avgAttempts}</td>
                <td>${t.avgTimeToSolve > 0 ? t.avgTimeToSolve + ' min' : 'N/A'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    // Error-prone topics
    const errorProneEl = document.getElementById('error-prone-topics');
    if (errorProneEl && errorProne.length > 0) {
      errorProneEl.innerHTML = errorProne.map((t, i) => `
        <div class="topic-issue-item">
          <span class="topic-rank">#${i + 1}</span>
          <span class="topic-name">${t.topic}</span>
          <span class="topic-errors">${t.errorCount} errors</span>
        </div>
      `).join('');
    }

    // Time-consuming topics
    const timeConsumingEl = document.getElementById('time-consuming-topics');
    if (timeConsumingEl && timeConsuming.length > 0) {
      timeConsumingEl.innerHTML = timeConsuming.map((t, i) => `
        <div class="topic-issue-item">
          <span class="topic-rank">#${i + 1}</span>
          <span class="topic-name">${t.topic}</span>
          <span class="topic-time">${t.avgTimeToSolve} min</span>
        </div>
      `).join('');
    }
  }

  /**
   * Render behavioral patterns section
   */
  function renderBehavioralSection(behavioralData) {
    const { timeOfDay, productiveHours, weeklyTrend, hardestQuestions } = behavioralData;

    // Time of day heatmap
    const heatmapContainer = document.getElementById('time-heatmap');
    if (heatmapContainer) {
      renderHeatmap(heatmapContainer, timeOfDay);
    }

    // Most productive hours
    const productiveEl = document.getElementById('productive-hours');
    if (productiveEl) {
      productiveEl.innerHTML = `
        <div class="productive-section">
          <h4>Most Accurate</h4>
          ${productiveHours.mostAccurate.map(h => `
            <div class="hour-item">
              <span>${h.label}</span>
              <span class="hour-accuracy">${h.accuracy}%</span>
            </div>
          `).join('')}
        </div>
        <div class="productive-section">
          <h4>Most Active</h4>
          ${productiveHours.mostActive.map(h => `
            <div class="hour-item">
              <span>${h.label}</span>
              <span class="hour-volume">${h.volume} runs</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    // Weekly improvement trend
    const trendEl = document.getElementById('weekly-trend');
    if (trendEl) {
      const { thisWeek, lastWeek, changes } = weeklyTrend;
      const trendIcon = changes.accuracyTrend === 'improving' ? '📈' : 
                       changes.accuracyTrend === 'declining' ? '📉' : '➡️';
      
      trendEl.innerHTML = `
        <div class="trend-header">
          <span class="trend-icon">${trendIcon}</span>
          <span class="trend-label">${changes.accuracyTrend.toUpperCase()}</span>
        </div>
        <div class="trend-comparison">
          <div class="trend-week">
            <div class="week-label">This Week</div>
            <div class="week-stat">${thisWeek.total} attempts</div>
            <div class="week-stat">${thisWeek.accuracy}% accuracy</div>
          </div>
          <div class="trend-arrow">→</div>
          <div class="trend-week">
            <div class="week-label">Last Week</div>
            <div class="week-stat">${lastWeek.total} attempts</div>
            <div class="week-stat">${lastWeek.accuracy}% accuracy</div>
          </div>
        </div>
        <div class="trend-changes">
          <div class="change-item ${changes.activity > 0 ? 'positive' : 'negative'}">
            Activity: ${changes.activity > 0 ? '+' : ''}${changes.activity}
          </div>
          <div class="change-item ${changes.accuracy > 0 ? 'positive' : 'negative'}">
            Accuracy: ${changes.accuracy > 0 ? '+' : ''}${changes.accuracy}%
          </div>
        </div>
      `;
    }

    // Hardest questions
    const hardestEl = document.getElementById('hardest-questions');
    if (hardestEl && hardestQuestions.length > 0) {
      hardestEl.innerHTML = `
        <table class="hardest-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Question</th>
              <th>Difficulty</th>
              <th>Errors</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${hardestQuestions.map((q, i) => `
              <tr>
                <td>${i + 1}</td>
                <td class="question-id">${q.questionId}</td>
                <td><span class="pill pill-${q.difficulty.toLowerCase()}">${q.difficulty}</span></td>
                <td>${q.errorCount}</td>
                <td>${q.solved ? '<span class="status-solved">✓</span>' : '<span class="status-unsolved">○</span>'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }
  }

  /**
   * Render AI insights section
   */
  function renderAIInsights(insights) {
    const container = document.getElementById('ai-insights');
    if (!container || !insights || !insights.success) return;

    const { recommendations } = insights;

    container.innerHTML = `
      <div class="ai-section">
        <h3>💪 Strengths</h3>
        <ul class="insight-list">
          ${recommendations.strengths.map(s => `<li>${s}</li>`).join('')}
        </ul>
      </div>

      <div class="ai-section">
        <h3>🎯 Areas for Improvement</h3>
        <ul class="insight-list">
          ${recommendations.weaknesses.map(w => `<li>${w}</li>`).join('')}
        </ul>
      </div>

      <div class="ai-section">
        <h3>📋 Action Items</h3>
        <div class="action-items">
          ${recommendations.actionItems.map(item => `
            <div class="action-item">
              <div class="action-text">${item.action}</div>
              <div class="action-reason">${item.reason}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="ai-section motivation">
        <h3>✨ Keep Going!</h3>
        <p>${recommendations.motivation}</p>
      </div>

      <div class="ai-footer">
        <small>Generated ${new Date(insights.generatedAt).toLocaleString()} using ${insights.model}</small>
      </div>
    `;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  MAIN RENDER FUNCTION
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Render complete dashboard
   * @param {Object} rawData - Raw data from IndexedDB
   */
  async function render(rawData) {
    // Generate all analytics
    const analytics = Analytics.generateAllAnalytics(rawData);

    // Render each section
    renderActivitySection(analytics);
    renderPerformanceSection(analytics);
    renderDifficultySection(analytics.difficulty);
    renderTopicSection(analytics.topics);
    renderBehavioralSection(analytics.behavioral);

    // Update summary stats
    const summaryEl = document.getElementById('summary-stats');
    if (summaryEl) {
      summaryEl.innerHTML = `
        <div class="summary-card">
          <div class="summary-label">Total Runs</div>
          <div class="summary-value">${analytics.summary.totalRuns}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Questions</div>
          <div class="summary-value">${analytics.summary.solvedQuestions}/${analytics.summary.totalQuestions}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Accuracy</div>
          <div class="summary-value">${analytics.summary.overallAccuracy}%</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Avg Attempts</div>
          <div class="summary-value">${analytics.summary.avgAttempts}</div>
        </div>
      `;
    }

    return analytics;
  }

  /**
   * Generate weekly AI insights
   */
  async function generateAIInsights(rawData) {
    try {
      const insights = await WeeklySummary.generateWeeklyInsights(rawData);
      
      if (insights.success) {
        // Save to history
        await WeeklySummary.saveAnalysisToHistory(insights);
        
        // Render insights
        renderAIInsights(insights);
        
        return insights;
      } else {
        console.error('Failed to generate AI insights:', insights.error);
        return null;
      }
    } catch (error) {
      console.error('Error generating AI insights:', error);
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  PUBLIC API
  // ─────────────────────────────────────────────────────────────────────────────

  return {
    render,
    generateAIInsights,
    renderActivitySection,
    renderPerformanceSection,
    renderDifficultySection,
    renderTopicSection,
    renderBehavioralSection,
    renderAIInsights
  };
})();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Dashboard;
}
