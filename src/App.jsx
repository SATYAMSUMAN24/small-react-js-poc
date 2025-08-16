import React, { useState, useMemo, useCallback, memo, useRef, useEffect } from 'react';
import { scaleOrdinal, scaleBand, scaleLinear } from '@visx/scale';
import { withTooltip, Tooltip, defaultStyles } from '@visx/tooltip';
import { localPoint } from '@visx/event';
import { format, parseISO, startOfWeek, endOfWeek, eachWeekOfInterval } from 'date-fns';
import { Filter, Calendar, Users, Activity, Eye, X, Download, Search, RotateCcw, Maximize2, BarChart3, TrendingUp, TrendingDown } from 'lucide-react';
import './App.css';

// Import dummy data
import dummyData from './data.json';

// Optimized debounce utility for performance
const useDebounce = (callback, delay) => {
  const timerRef = useRef(null);

  const debouncedCallback = useCallback((...args) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      callback(...args);
    }, delay);
  }, [callback, delay]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return debouncedCallback;
};

// Performance optimization hook for throttling
const useThrottle = (callback, delay) => {
  const lastRun = useRef(Date.now());

  return useCallback((...args) => {
    if (Date.now() - lastRun.current >= delay) {
      callback(...args);
      lastRun.current = Date.now();
    }
  }, [callback, delay]);
};

const statusColorMap = {
  success: '#22c55e', // green
  warning: '#eab308', // yellow
  fail: '#ef4444'     // red
};

const statusIcons = {
  success: '✅',
  warning: '⚠️',
  fail: '❌'
};

const tabs = [
  { id: 'overview', label: 'Overview', icon: '🏠' },
  { id: 'transaction', label: 'Transaction', icon: '💳' },
  { id: 'association', label: 'Association', icon: '🔗' },
  { id: 'behaviour', label: 'Behaviour', icon: '👤' },
  { id: 'fcr', label: 'FCR Score', icon: '📊' },
  { id: 'sanction', label: 'Sanction', icon: '⚖️' },
  { id: 'evidence', label: 'Evidence', icon: '📋' }
];

// Bar Graph Component for Trend Analysis
const BarGraph = memo(withTooltip(({
  data,
  width = 800,
  height = 400,
  showTooltip,
  hideTooltip,
  tooltipData,
  tooltipTop,
  tooltipLeft,
  granularity = 'weekly',
  showTrends = true
}) => {
  const margin = { top: 40, right: 60, bottom: 80, left: 80 };
  const xMax = width - margin.left - margin.right;
  const yMax = height - margin.top - margin.bottom;

  // Process data for bar chart based on granularity
  const processedData = useMemo(() => {
    const dates = Array.from(new Set(data.map(d => d.date))).sort();

    if (granularity === 'monthly') {
      const monthlyData = {};
      data.forEach(item => {
        const month = format(parseISO(item.date), 'yyyy-MM');
        if (!monthlyData[month]) {
          monthlyData[month] = { period: month, total: 0, success: 0, warning: 0, fail: 0, trend: 0 };
        }
        monthlyData[month].total++;
        monthlyData[month][item.status]++;
      });

      const months = Object.keys(monthlyData).sort();
      return months.map((month, index) => {
        const current = monthlyData[month];
        const previous = index > 0 ? monthlyData[months[index - 1]] : null;
        const trend = previous ? ((current.total - previous.total) / previous.total) * 100 : 0;

        return {
          ...current,
          periodLabel: format(parseISO(month + '-01'), 'MMM yyyy'),
          trend: Math.round(trend),
          trendDirection: trend > 0 ? 'up' : trend < 0 ? 'down' : 'stable'
        };
      });
    } else if (granularity === 'daily') {
      const dailyData = {};
      data.forEach(item => {
        if (!dailyData[item.date]) {
          dailyData[item.date] = { period: item.date, total: 0, success: 0, warning: 0, fail: 0 };
        }
        dailyData[item.date].total++;
        dailyData[item.date][item.status]++;
      });

      return dates.map((date, index) => {
        const current = dailyData[date] || { period: date, total: 0, success: 0, warning: 0, fail: 0 };
        const previous = index > 0 ? (dailyData[dates[index - 1]] || { total: 0 }) : null;
        const trend = previous ? ((current.total - previous.total) / Math.max(previous.total, 1)) * 100 : 0;

        return {
          ...current,
          periodLabel: format(parseISO(date), 'MMM dd'),
          trend: Math.round(trend),
          trendDirection: trend > 0 ? 'up' : trend < 0 ? 'down' : 'stable'
        };
      });
    } else {
      // Weekly view (default)
      const firstDate = parseISO(dates[0]);
      const lastDate = parseISO(dates[dates.length - 1]);
      const weeks = eachWeekOfInterval({ start: firstDate, end: lastDate });

      return weeks.map((week, index) => {
        const weekStart = startOfWeek(week);
        const weekEnd = endOfWeek(week);
        const weekEvents = data.filter(d => {
          const eventDate = parseISO(d.date);
          return eventDate >= weekStart && eventDate <= weekEnd;
        });

        const weekData = { period: format(week, 'yyyy-MM-dd'), total: 0, success: 0, warning: 0, fail: 0 };
        weekEvents.forEach(event => {
          weekData.total++;
          weekData[event.status]++;
        });

        const previousWeek = index > 0 ? weeks[index - 1] : null;
        let trend = 0;
        if (previousWeek) {
          const prevWeekStart = startOfWeek(previousWeek);
          const prevWeekEnd = endOfWeek(previousWeek);
          const prevWeekEvents = data.filter(d => {
            const eventDate = parseISO(d.date);
            return eventDate >= prevWeekStart && eventDate <= prevWeekEnd;
          });
          trend = prevWeekEvents.length > 0 ? ((weekData.total - prevWeekEvents.length) / prevWeekEvents.length) * 100 : 0;
        }

        return {
          ...weekData,
          periodLabel: format(week, 'MMM dd'),
          trend: Math.round(trend),
          trendDirection: trend > 0 ? 'up' : trend < 0 ? 'down' : 'stable'
        };
      });
    }
  }, [data, granularity]);

  // Scales
  const xScale = scaleBand({
    domain: processedData.map(d => d.period),
    range: [0, xMax],
    padding: 0.2
  });

  const yScale = scaleLinear({
    domain: [0, Math.max(...processedData.map(d => d.total), 1)],
    range: [yMax, 0]
  });

  const maxTrend = Math.max(...processedData.map(d => Math.abs(d.trend)));
  const trendScale = scaleLinear({
    domain: [-maxTrend, maxTrend],
    range: [yMax, 0]
  });

  return (
    <div className="bar-graph-container">
      <div className="chart-header">
        <h3><BarChart3 size={20} /> Activity Trends</h3>
        <div className="chart-controls">
          <button className="chart-control-btn" title="Export Chart">
            <Download size={16} />
          </button>
          <button className="chart-control-btn" title="Fullscreen">
            <Maximize2 size={16} />
          </button>
        </div>
      </div>

      <svg width={width} height={height}>
        <defs>
          <linearGradient id="successGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#22c55e" stopOpacity={0.8} />
            <stop offset="100%" stopColor="#22c55e" stopOpacity={0.3} />
          </linearGradient>
          <linearGradient id="warningGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#eab308" stopOpacity={0.8} />
            <stop offset="100%" stopColor="#eab308" stopOpacity={0.3} />
          </linearGradient>
          <linearGradient id="failGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ef4444" stopOpacity={0.8} />
            <stop offset="100%" stopColor="#ef4444" stopOpacity={0.3} />
          </linearGradient>
        </defs>

        <g transform={`translate(${margin.left}, ${margin.top})`}>
          {/* Grid lines */}
          {yScale.ticks(5).map(tick => (
            <g key={`grid-${tick}`}>
              <line
                x1={0}
                y1={yScale(tick)}
                x2={xMax}
                y2={yScale(tick)}
                stroke="#e5e7eb"
                strokeWidth={1}
                strokeDasharray="2,2"
              />
              <text
                x={-10}
                y={yScale(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={12}
                fill="#6b7280"
              >
                {tick}
              </text>
            </g>
          ))}

          {/* X-axis labels */}
          {processedData.map((d, i) => {
            if (i % Math.ceil(processedData.length / 8) === 0) {
              return (
                <text
                  key={`x-label-${d.period}`}
                  x={(xScale(d.period) || 0) + xScale.bandwidth() / 2}
                  y={yMax + 20}
                  textAnchor="middle"
                  fontSize={11}
                  fill="#374151"
                  fontWeight={500}
                >
                  {d.periodLabel}
                </text>
              );
            }
            return null;
          })}

          {/* Bars with stacked segments */}
          {processedData.map((d) => {
            const barX = xScale(d.period) || 0;
            const barWidth = xScale.bandwidth();

            // Calculate heights for stacked bars
            const failHeight = (d.fail / d.total) * (yMax - yScale(d.total));
            const warningHeight = (d.warning / d.total) * (yMax - yScale(d.total));
            const successHeight = (d.success / d.total) * (yMax - yScale(d.total));

            const failY = yScale(d.total);
            const warningY = failY + failHeight;
            const successY = warningY + warningHeight;

            return (
              <g key={`bar-${d.period}`}>
                {/* Fail segment */}
                {d.fail > 0 && (
                  <rect
                    x={barX}
                    y={failY}
                    width={barWidth}
                    height={failHeight}
                    fill="url(#failGradient)"
                    stroke="#ef4444"
                    strokeWidth={1}
                    className="bar-segment"
                    onMouseEnter={(event) => {
                      const point = localPoint(event) || { x: 0, y: 0 };
                      showTooltip({
                        tooltipData: { ...d, segment: 'fail', value: d.fail },
                        tooltipTop: point.y,
                        tooltipLeft: point.x,
                      });
                    }}
                    onMouseLeave={hideTooltip}
                  />
                )}

                {/* Warning segment */}
                {d.warning > 0 && (
                  <rect
                    x={barX}
                    y={warningY}
                    width={barWidth}
                    height={warningHeight}
                    fill="url(#warningGradient)"
                    stroke="#eab308"
                    strokeWidth={1}
                    className="bar-segment"
                    onMouseEnter={(event) => {
                      const point = localPoint(event) || { x: 0, y: 0 };
                      showTooltip({
                        tooltipData: { ...d, segment: 'warning', value: d.warning },
                        tooltipTop: point.y,
                        tooltipLeft: point.x,
                      });
                    }}
                    onMouseLeave={hideTooltip}
                  />
                )}

                {/* Success segment */}
                {d.success > 0 && (
                  <rect
                    x={barX}
                    y={successY}
                    width={barWidth}
                    height={successHeight}
                    fill="url(#successGradient)"
                    stroke="#22c55e"
                    strokeWidth={1}
                    className="bar-segment"
                    onMouseEnter={(event) => {
                      const point = localPoint(event) || { x: 0, y: 0 };
                      showTooltip({
                        tooltipData: { ...d, segment: 'success', value: d.success },
                        tooltipTop: point.y,
                        tooltipLeft: point.x,
                      });
                    }}
                    onMouseLeave={hideTooltip}
                  />
                )}

                {/* Total count label */}
                {d.total > 0 && (
                  <text
                    x={barX + barWidth / 2}
                    y={yScale(d.total) - 5}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight="bold"
                    fill="#374151"
                  >
                    {d.total}
                  </text>
                )}

                {/* Trend indicator */}
                {showTrends && d.trend !== 0 && (
                  <g>
                    {d.trendDirection === 'up' ? (
                      <TrendingUp
                        x={barX + barWidth - 12}
                        y={yScale(d.total) - 20}
                        size={10}
                        color="#22c55e"
                      />
                    ) : d.trendDirection === 'down' ? (
                      <TrendingDown
                        x={barX + barWidth - 12}
                        y={yScale(d.total) - 20}
                        size={10}
                        color="#ef4444"
                      />
                    ) : null}
                    <text
                      x={barX + barWidth / 2}
                      y={yScale(d.total) - 25}
                      textAnchor="middle"
                      fontSize={8}
                      fill={d.trendDirection === 'up' ? '#22c55e' : d.trendDirection === 'down' ? '#ef4444' : '#6b7280'}
                      fontWeight="600"
                    >
                      {d.trend > 0 ? '+' : ''}{d.trend}%
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Y-axis line */}
          <line
            x1={0}
            y1={0}
            x2={0}
            y2={yMax}
            stroke="#374151"
            strokeWidth={2}
          />

          {/* X-axis line */}
          <line
            x1={0}
            y1={yMax}
            x2={xMax}
            y2={yMax}
            stroke="#374151"
            strokeWidth={2}
          />

          {/* Y-axis label */}
          <text
            x={-60}
            y={yMax / 2}
            textAnchor="middle"
            fontSize={14}
            fontWeight="600"
            fill="#374151"
            transform={`rotate(-90, -60, ${yMax / 2})`}
          >
            Event Count
          </text>

          {/* X-axis label */}
          <text
            x={xMax / 2}
            y={yMax + 60}
            textAnchor="middle"
            fontSize={14}
            fontWeight="600"
            fill="#374151"
          >
            Time Period ({granularity})
          </text>
        </g>
      </svg>

      {tooltipData && (
        <Tooltip
          top={tooltipTop}
          left={tooltipLeft}
          style={{
            ...defaultStyles,
            backgroundColor: 'rgba(0, 0, 0, 0.95)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            padding: '12px 16px',
            fontSize: '13px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
            maxWidth: '250px'
          }}
        >
          <div className="tooltip-content">
            <div className="tooltip-header">
              <strong>{tooltipData.periodLabel}</strong>
              <span className="tooltip-trend">
                {tooltipData.trendDirection === 'up' ? '📈' : tooltipData.trendDirection === 'down' ? '📉' : '➡️'}
                {tooltipData.trend > 0 ? '+' : ''}{tooltipData.trend}%
              </span>
            </div>
            <div className="tooltip-body">
              <p>📊 Total: {tooltipData.total} events</p>
              <p>✅ Success: {tooltipData.success}</p>
              <p>⚠️ Warning: {tooltipData.warning}</p>
              <p>❌ Failed: {tooltipData.fail}</p>
              {tooltipData.segment && (
                <p style={{ marginTop: '8px', fontWeight: 'bold' }}>
                  Selected: {tooltipData.segment} ({tooltipData.value})
                </p>
              )}
            </div>
          </div>
        </Tooltip>
      )}
    </div>
  );
}));

const HeatmapChart = memo(withTooltip(({
  data,
  width = 1000,
  height = 500,
  showTooltip,
  hideTooltip,
  tooltipData,
  tooltipTop,
  tooltipLeft,
  onCellClick,
  showGradient = true,
  showAccessibilityPatterns = false,
  granularity // Added granularity prop
}) => {
  const margin = { top: 80, right: 40, bottom: 60, left: 220 };
  const xMax = width - margin.left - margin.right;
  const yMax = height - margin.top - margin.bottom;

  // Memoize expensive calculations with safety checks
  const activityTypes = useMemo(() => Array.from(new Set(data.filter(d => d && d.activityType).map(d => d.activityType))), [data]);
  const dates = useMemo(() => Array.from(new Set(data.filter(d => d && d.date).map(d => d.date))).sort(), [data]);

  // Create weekly bins - Add safety checks
  const validDates = dates.filter(date => date && typeof date === 'string');
  const firstDate = validDates.length > 0 ? parseISO(validDates[0]) : new Date();
  const lastDate = validDates.length > 0 ? parseISO(validDates[validDates.length - 1]) : new Date();
  const weeks = validDates.length > 0 ? eachWeekOfInterval({ start: firstDate, end: lastDate }) : [];

  // Create appropriate scale based on granularity
  const getXScale = () => {
    if (granularity === 'daily') {
      return scaleBand({
        domain: dates.filter(date => date), // Filter out undefined dates
        range: [0, xMax],
        padding: 0.1
      });
    } else if (granularity === 'monthly') {
      const months = Array.from(new Set(dates.filter(date => date).map(date => format(parseISO(date), 'yyyy-MM'))));
      return scaleBand({
        domain: months,
        range: [0, xMax],
        padding: 0.1
      });
    } else { // weekly or other
      return scaleBand({
        domain: weeks.map(week => format(week, 'yyyy-MM-dd')),
        range: [0, xMax],
        padding: 0.1
      });
    }
  };

  const xScale = getXScale();

  const yScale = scaleBand({
    domain: activityTypes,
    range: [0, yMax],
    padding: 0.1
  });

  // Process data into grid format with intensity based on granularity
  const processDataByGranularity = () => {
    if (granularity === 'daily') {
      // Daily view - group by individual days
      return activityTypes.map(activityType => {
        return dates.map(date => {
          const dayEvents = data.filter(d =>
            d.date === date && d.activityType === activityType
          );

          let status = null;
          let intensity = 0;
          if (dayEvents.length > 0) {
            const statusCounts = dayEvents.reduce((acc, event) => {
              acc[event.status] = (acc[event.status] || 0) + 1;
              return acc;
            }, {});

            if (statusCounts.fail) status = 'fail';
            else if (statusCounts.warning) status = 'warning';
            else status = 'success';

            intensity = dayEvents.length / Math.max(...dates.map(d =>
              data.filter(item => item.date === d && item.activityType === activityType).length
            ), 1);
          }

          return {
            activityType,
            period: date,
            periodLabel: format(parseISO(date), 'MMM dd'),
            status,
            events: dayEvents,
            count: dayEvents.length,
            intensity
          };
        });
      }).flat();
    } else if (granularity === 'monthly') {
      // Monthly view - group by months
      const months = Array.from(new Set(dates.map(date => format(parseISO(date), 'yyyy-MM'))));
      return activityTypes.map(activityType => {
        return months.map(month => {
          const monthEvents = data.filter(d => {
            const eventMonth = format(parseISO(d.date), 'yyyy-MM');
            return eventMonth === month && d.activityType === activityType;
          });

          let status = null;
          let intensity = 0;
          if (monthEvents.length > 0) {
            const statusCounts = monthEvents.reduce((acc, event) => {
              acc[event.status] = (acc[event.status] || 0) + 1;
              return acc;
            }, {});

            if (statusCounts.fail) status = 'fail';
            else if (statusCounts.warning) status = 'warning';
            else status = 'success';

            intensity = monthEvents.length / Math.max(...months.map(m =>
              data.filter(item => format(parseISO(item.date), 'yyyy-MM') === m && item.activityType === activityType).length
            ), 1);
          }

          return {
            activityType,
            period: month,
            periodLabel: format(parseISO(month + '-01'), 'MMM yyyy'),
            status,
            events: monthEvents,
            count: monthEvents.length,
            intensity
          };
        });
      }).flat();
    } else { // weekly or other
      // Weekly view (default)
      return activityTypes.map(activityType => {
        return weeks.map(week => {
          const weekStart = startOfWeek(week);
          const weekEnd = endOfWeek(week);
          const weekKey = format(week, 'yyyy-MM-dd');

          const weekEvents = data.filter(d => {
            const eventDate = parseISO(d.date);
            return d.activityType === activityType &&
                   eventDate >= weekStart &&
                   eventDate <= weekEnd;
          });

          let status = null;
          let intensity = 0;
          if (weekEvents.length > 0) {
            const statusCounts = weekEvents.reduce((acc, event) => {
              acc[event.status] = (acc[event.status] || 0) + 1;
              return acc;
            }, {});

            if (statusCounts.fail) status = 'fail';
            else if (statusCounts.warning) status = 'warning';
            else status = 'success';

            const maxEvents = Math.max(...activityTypes.map(type => {
              const typeWeeks = weeks.map(w => {
                const wStart = startOfWeek(w);
                const wEnd = endOfWeek(w);
                return data.filter(d => {
                  const eventDate = parseISO(d.date);
                  return d.activityType === type &&
                         eventDate >= wStart &&
                         eventDate <= wEnd;
                }).length;
              });
              return Math.max(...typeWeeks, 1);
            }), 1);

            intensity = weekEvents.length / maxEvents;
          }

          return {
            activityType,
            period: weekKey,
            periodLabel: format(week, 'MMM dd'),
            status,
            events: weekEvents,
            count: weekEvents.length,
            intensity
          };
        });
      }).flat();
    }
  };

  const gridData = useMemo(() => processDataByGranularity(), [data, granularity, activityTypes, dates]);

  // Intensity color scale
  const getIntensityColor = (status, intensity) => {
    if (!status) return null;
    const baseColor = statusColorMap[status];
    if (!showGradient) return baseColor;

    // Convert hex to rgb and apply opacity based on intensity
    const hex = baseColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const alpha = Math.max(0.3, intensity); // Minimum 0.3 opacity

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const getPatternId = (status) => `pattern-${status}`;

  return (
    <div className="heatmap-container">
      <div className="chart-header">
        <h3>Activity Timeline Heatmap</h3>
        <div className="chart-controls">
          <button className="chart-control-btn" title="Export Chart">
            <Download size={16} />
          </button>
          <button className="chart-control-btn" title="Fullscreen">
            <Maximize2 size={16} />
          </button>
        </div>
      </div>

      <svg width={width} height={height}>
        <defs>
          {/* Accessibility patterns */}
          <pattern id="pattern-success" patternUnits="userSpaceOnUse" width="4" height="4">
            <rect width="4" height="4" fill={statusColorMap.success} />
            <path d="M 0,4 l 4,-4 M -1,1 l 2,-2 M 3,5 l 2,-2" stroke="white" strokeWidth="0.5" />
          </pattern>
          <pattern id="pattern-warning" patternUnits="userSpaceOnUse" width="4" height="4">
            <rect width="4" height="4" fill={statusColorMap.warning} />
            <circle cx="2" cy="2" r="0.5" fill="white" />
          </pattern>
          <pattern id="pattern-fail" patternUnits="userSpaceOnUse" width="4" height="4">
            <rect width="4" height="4" fill={statusColorMap.fail} />
            <path d="M 1,1 l 2,2 M 1,3 l 2,-2" stroke="white" strokeWidth="0.5" />
          </pattern>
        </defs>

        <g transform={`translate(${margin.left}, ${margin.top})`}>
          {/* Y-axis labels (Activity Types) */}
          {activityTypes.map(activityType => (
            <text
              key={activityType}
              x={-15}
              y={(yScale(activityType) || 0) + yScale.bandwidth() / 2}
              textAnchor="end"
              dominantBaseline="middle"
              className="axis-label activity-label"
              fontSize={13}
            >
              {activityType}
            </text>
          ))}

          {/* X-axis labels - Dynamic based on granularity */}
          {(() => {
            if (granularity === 'daily') {
              return dates.map((date, i) => {
                if (i % 3 === 0) {
                  return (
                    <g key={date}>
                      <text
                        x={(xScale(date) || 0) + xScale.bandwidth() / 2}
                        y={-20}
                        textAnchor="middle"
                        className="axis-label"
                        fontSize={10}
                        fill="#374151"
                      >
                        {format(parseISO(date), 'MMM dd')}
                      </text>
                    </g>
                  );
                }
                return null;
              });
            } else if (granularity === 'monthly') {
              const months = Array.from(new Set(dates.filter(date => date && typeof date === 'string').map(date => format(parseISO(date), 'yyyy-MM'))));
              return months.map((month) => (
                <g key={month}>
                  <text
                    x={(xScale(month) || 0) + xScale.bandwidth() / 2}
                    y={-35}
                    textAnchor="middle"
                    className="axis-label month-label"
                    fontSize={12}
                    fill="#374151"
                  >
                    {format(parseISO(month + '-01'), 'MMM')}
                  </text>
                  <text
                    x={(xScale(month) || 0) + xScale.bandwidth() / 2}
                    y={-20}
                    textAnchor="middle"
                    className="axis-label year-label"
                    fontSize={10}
                    fill="#6b7280"
                  >
                    {format(parseISO(month + '-01'), 'yyyy')}
                  </text>
                </g>
              ));
            } else { // weekly or other
              return weeks.map((week, i) => {
                if (i % 2 === 0) {
                  return (
                    <g key={format(week, 'yyyy-MM-dd')}>
                      <text
                        x={(xScale(format(week, 'yyyy-MM-dd')) || 0) + xScale.bandwidth() / 2}
                        y={-35}
                        textAnchor="middle"
                        className="axis-label month-label"
                        fontSize={12}
                        fill="#374151"
                      >
                        {format(week, 'MMM')}
                      </text>
                      <text
                        x={(xScale(format(week, 'yyyy-MM-dd')) || 0) + xScale.bandwidth() / 2}
                        y={-20}
                        textAnchor="middle"
                        className="axis-label year-label"
                        fontSize={10}
                        fill="#6b7280"
                      >
                        {format(week, 'yyyy')}
                      </text>
                    </g>
                  );
                }
                return null;
              });
            }
          })()}

          {/* Grid lines */}
          <g className="grid-lines">
            {(() => {
              if (granularity === 'daily') {
                return dates.map((date, i) => (
                  <line
                    key={`v-${i}`}
                    x1={xScale(date) || 0}
                    y1={0}
                    x2={xScale(date) || 0}
                    y2={yMax}
                    stroke="#f3f4f6"
                    strokeWidth={0.5}
                  />
                ));
              } else if (granularity === 'monthly') {
                const months = Array.from(new Set(dates.filter(date => date && typeof date === 'string').map(date => format(parseISO(date), 'yyyy-MM'))));
                return months.map((month, i) => (
                  <line
                    key={`v-${i}`}
                    x1={xScale(month) || 0}
                    y1={0}
                    x2={xScale(month) || 0}
                    y2={yMax}
                    stroke="#f3f4f6"
                    strokeWidth={0.5}
                  />
                ));
              } else { // weekly or other
                return weeks.map((week, i) => (
                  <line
                    key={`v-${i}`}
                    x1={xScale(format(week, 'yyyy-MM-dd')) || 0}
                    y1={0}
                    x2={xScale(format(week, 'yyyy-MM-dd')) || 0}
                    y2={yMax}
                    stroke="#f3f4f6"
                    strokeWidth={0.5}
                  />
                ));
              }
            })()}
            {activityTypes.map((type, i) => (
              <line
                key={`h-${i}`}
                x1={0}
                y1={yScale(type) || 0}
                x2={xMax}
                y2={yScale(type) || 0}
                stroke="#f3f4f6"
                strokeWidth={0.5}
              />
            ))}
          </g>

          {/* Heatmap cells - Optimized rendering */}
          {useMemo(() => {
            const throttledShowTooltip = (event, cell) => {
              requestAnimationFrame(() => {
                const point = localPoint(event) || { x: 0, y: 0 };
                showTooltip({
                  tooltipData: cell,
                  tooltipTop: point.y,
                  tooltipLeft: point.x,
                });
              });
            };

            const throttledHideTooltip = () => {
              requestAnimationFrame(() => {
                hideTooltip();
              });
            };

            return gridData.map((cell, index) => {
              if (!cell.status) return null;

              const x = xScale(cell.period) || 0;
              const y = yScale(cell.activityType) || 0;
              const width = xScale.bandwidth();
              const height = yScale.bandwidth();
              const fillColor = showGradient
                ? getIntensityColor(cell.status, cell.intensity)
                : statusColorMap[cell.status];

              return (
                <g key={`${cell.activityType}-${cell.period}`}>
                  <rect
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    fill={showAccessibilityPatterns ? `url(#${getPatternId(cell.status)})` : fillColor}
                    stroke="#fff"
                    strokeWidth={1.5}
                    className="heatmap-cell"
                    onMouseEnter={(event) => throttledShowTooltip(event, cell)}
                    onMouseLeave={throttledHideTooltip}
                    onClick={(event) => {
                      event.stopPropagation();
                      requestAnimationFrame(() => onCellClick(cell));
                    }}
                  />
                  {/* Event count indicator for high activity */}
                  {cell.count > 2 && (
                    <text
                      x={x + width / 2}
                      y={y + height / 2}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={width < 30 ? 8 : 10}
                      fill="white"
                      fontWeight="bold"
                      className="event-count-text"
                      style={{ pointerEvents: 'none' }}
                    >
                      {cell.count}
                    </text>
                  )}
                </g>
              );
            });
          }, [gridData, xScale, yScale, showGradient, showAccessibilityPatterns, showTooltip, hideTooltip, onCellClick])}
        </g>
      </svg>

      {tooltipData && (
        <Tooltip
          top={tooltipTop}
          left={tooltipLeft}
          style={{
            ...defaultStyles,
            backgroundColor: 'rgba(0, 0, 0, 0.95)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            padding: '12px 16px',
            fontSize: '13px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
            maxWidth: '250px'
          }}
        >
          <div className="tooltip-content">
            <div className="tooltip-header">
              <strong>{tooltipData.activityType}</strong>
              <span className="tooltip-status" style={{ color: statusColorMap[tooltipData.status] }}>
                {statusIcons[tooltipData.status]} {tooltipData.status.toUpperCase()}
              </span>
            </div>
            <div className="tooltip-body">
              <p>📅 {tooltipData.periodLabel}</p>
              <p>📊 {tooltipData.count} events</p>
              <p>💪 Intensity: {Math.round(tooltipData.intensity * 100)}%</p>
              <small>Click for detailed view</small>
            </div>
          </div>
        </Tooltip>
      )}
    </div>
  );
}));

function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedActivityTypes, setSelectedActivityTypes] = useState([]);
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [selectedCell, setSelectedCell] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showGradient, setShowGradient] = useState(true);
  const [showAccessibilityPatterns, setShowAccessibilityPatterns] = useState(false);
  const [selectedStatCard, setSelectedStatCard] = useState(null);
  const [timeRange, setTimeRange] = useState('last30days');
  const [granularity, setGranularity] = useState('weekly');
  const [showPreview, setShowPreview] = useState(false);
  const [viewMode, setViewMode] = useState('heatmap'); // 'heatmap' or 'bargraph'
  const [showTrends, setShowTrends] = useState(true);
  const [timeGranularityOptions] = useState(['hour', 'day', 'week', 'month', 'year']);
  const [compactMode, setCompactMode] = useState(true);

  const activityTypes = useMemo(() => Array.from(new Set(dummyData.map(d => d.activityType).filter(Boolean))), [dummyData]);
  const statuses = ['success', 'warning', 'fail'];

  // Filter activity types by search term
  const filteredActivityTypes = activityTypes.filter(type =>
    type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Optimized filter data calculation
  const filteredData = useMemo(() => {
    // Early return if no filters
    if (selectedActivityTypes.length === 0 && selectedStatuses.length === 0 && !selectedStatCard) {
      return dummyData;
    }

    return dummyData.filter(item => {
      // Activity type filter
      if (selectedActivityTypes.length > 0 && !selectedActivityTypes.includes(item.activityType)) {
        return false;
      }

      // Status filter
      if (selectedStatuses.length > 0 && !selectedStatuses.includes(item.status)) {
        return false;
      }

      // Stat card filter
      if (selectedStatCard) {
        const targetStatus = selectedStatCard === 'failed' ? 'fail' : selectedStatCard;
        if (targetStatus !== 'total' && item.status !== targetStatus) {
          return false;
        }
      }

      return true;
    });
  }, [selectedActivityTypes, selectedStatuses, selectedStatCard]);

  // Calculate statistics
  const statistics = useMemo(() => {
    const devices = new Set(filteredData.map(d => d.device).filter(Boolean)).size;
    const users = new Set(filteredData.map(d => d.user).filter(Boolean)).size;
    const totalEvents = filteredData.length;
    const successEvents = filteredData.filter(d => d.status === 'success').length;
    const failedEvents = filteredData.filter(d => d.status === 'fail').length;
    const warningEvents = filteredData.filter(d => d.status === 'warning').length;

    return {
      devices,
      users,
      totalEvents,
      successEvents,
      failedEvents,
      warningEvents,
      successRate: totalEvents > 0 ? ((successEvents / totalEvents) * 100).toFixed(1) : 0
    };
  }, [filteredData]);

  const handleActivityTypeFilter = (activityType) => {
    setSelectedActivityTypes(prev =>
      prev.includes(activityType)
        ? prev.filter(a => a !== activityType)
        : [...prev, activityType]
    );
  };

  const handleStatusFilter = (status) => {
    setSelectedStatuses(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  };

  const clearAllFilters = () => {
    setSelectedActivityTypes([]);
    setSelectedStatuses([]);
    setSelectedStatCard(null);
    setSearchTerm('');
  };

  // Optimized cell click handler with immediate response
  const handleCellClick = useCallback((cell) => {
    // Use requestAnimationFrame for smooth UI updates
    requestAnimationFrame(() => {
      setSelectedCell(cell);
    });
  }, []);

  // Throttled version for rapid clicks with better performance
  const optimizedCellClick = useThrottle(handleCellClick, 50);

  const closeDetailsModal = () => {
    setSelectedCell(null);
  };

  const handleStatCardClick = (statType) => {
    setSelectedStatCard(prev => prev === statType ? null : statType);
  };

  const removeFilterChip = (type, value) => {
    if (type === 'activityType') {
      setSelectedActivityTypes(prev => prev.filter(a => a !== value));
    } else if (type === 'status') {
      setSelectedStatuses(prev => prev.filter(s => s !== value));
    } else if (type === 'statCard') {
      setSelectedStatCard(null);
    }
  };

  const getActiveFilters = () => {
    const filters = [];
    selectedActivityTypes.forEach(type => filters.push({ type: 'activityType', value: type, label: type }));
    selectedStatuses.forEach(status => filters.push({
      type: 'status',
      value: status,
      label: `${statusIcons[status]} ${status}`,
      color: statusColorMap[status]
    }));
    if (selectedStatCard) {
      filters.push({
        type: 'statCard',
        value: selectedStatCard,
        label: `${selectedStatCard} events`,
        color: statusColorMap[selectedStatCard === 'failed' ? 'fail' : selectedStatCard]
      });
    }
    return filters;
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Activity Timeline Dashboard</h1>
        <div className="header-controls">
          <div className="view-mode-controls">
            <button
              className={`view-mode-btn ${viewMode === 'heatmap' ? 'active' : ''}`}
              onClick={() => setViewMode('heatmap')}
              title="Heatmap View"
            >
              <Activity size={14} />
              <span className="view-mode-label">Heatmap</span>
            </button>
            <button
              className={`view-mode-btn ${viewMode === 'bargraph' ? 'active' : ''}`}
              onClick={() => setViewMode('bargraph')}
              title="Bar Graph View"
            >
              <BarChart3 size={14} />
              <span className="view-mode-label">Bar Graph</span>
            </button>
          </div>
          <button
            className={`filter-toggle ${showPreview ? 'active' : ''}`}
            onClick={() => setShowPreview(!showPreview)}
          >
            <Eye size={14} />
            Preview
          </button>
        </div>
      </header>

      {/* Active Filters Chips */}
      {getActiveFilters().length > 0 && (
        <div className="filter-chips-container">
          <div className="filter-chips-header">
            <span className="filter-chips-label">Active Filters:</span>
            <button className="clear-all-chips" onClick={clearAllFilters}>
              <RotateCcw size={14} />
              Clear All
            </button>
          </div>
          <div className="filter-chips">
            {getActiveFilters().map((filter, index) => (
              <div key={index} className="filter-chip" style={{ borderColor: filter.color }}>
                <span>{filter.label}</span>
                <button
                  className="remove-chip"
                  onClick={() => removeFilterChip(filter.type, filter.value)}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Statistics Dashboard - Clickable */}
      <div className="stats-dashboard">
        <div
          className={`stat-card ${selectedStatCard === 'total' ? 'selected' : ''}`}
          onClick={() => handleStatCardClick('total')}
        >
          <div className="stat-icon">
            <Activity size={20} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{statistics.totalEvents}</div>
            <div className="stat-label">Total Events</div>
          </div>
          <div className="stat-trend">📈</div>
        </div>

        <div
          className={`stat-card success ${selectedStatCard === 'success' ? 'selected' : ''}`}
          onClick={() => handleStatCardClick('success')}
        >
          <div className="stat-icon">
            <Activity size={20} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{statistics.successEvents}</div>
            <div className="stat-label">Success Events</div>
          </div>
          <div className="stat-trend">✅</div>
        </div>

        <div
          className={`stat-card failed ${selectedStatCard === 'failed' ? 'selected' : ''}`}
          onClick={() => handleStatCardClick('failed')}
        >
          <div className="stat-icon">
            <Activity size={20} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{statistics.failedEvents}</div>
            <div className="stat-label">Failed Events</div>
          </div>
          <div className="stat-trend">❌</div>
        </div>

        <div
          className={`stat-card warning ${selectedStatCard === 'warning' ? 'selected' : ''}`}
          onClick={() => handleStatCardClick('warning')}
        >
          <div className="stat-icon">
            <Activity size={20} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{statistics.warningEvents}</div>
            <div className="stat-label">Warning Events</div>
          </div>
          <div className="stat-trend">⚠️</div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <Users size={20} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{statistics.devices}</div>
            <div className="stat-label">Devices</div>
          </div>
          <div className="stat-trend">📱</div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <Users size={20} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{statistics.users}</div>
            <div className="stat-label">Users</div>
          </div>
          <div className="stat-trend">👥</div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <Calendar size={20} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{statistics.successRate}%</div>
            <div className="stat-label">Success Rate</div>
          </div>
          <div className="stat-trend">📊</div>
        </div>
      </div>

      {/* Enhanced Responsive Tab Navigation */}
      <nav className={`tab-nav ${compactMode ? 'compact' : ''}`}>
        <div className="tab-nav-container">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`tab ${activeTab === tab.id ? 'active' : ''} ${compactMode ? 'compact' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              title={tab.label}
            >
              <span className="tab-icon">{tab.icon}</span>
              <span className="tab-label">{tab.label}</span>
              {activeTab === tab.id && <div className="tab-active-indicator"></div>}
            </button>
          ))}
        </div>
        <div className="tab-controls">
          <button
            className={`compact-toggle ${compactMode ? 'active' : ''}`}
            onClick={() => setCompactMode(!compactMode)}
            title="Toggle Compact Mode"
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </nav>

      {/* Compact Filter Toolbar */}
      <div className="filter-toolbar">
        <div className="filter-group">
          <span className="filter-group-label">Time View:</span>
          <div className="filter-buttons">
            {timeGranularityOptions.map((option) => (
              <button
                key={option}
                className={`filter-icon-btn time-granularity ${granularity === option ? 'active' : ''}`}
                onClick={() => setGranularity(option)}
                title={`View by ${option.charAt(0).toUpperCase() + option.slice(1)}`}
              >
                {option.charAt(0).toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-divider"></div>

        <div className="filter-group">
          <span className="filter-group-label">Data:</span>
          <div className="filter-buttons">
            <button
              className={`filter-icon-btn ${showFilters ? 'active' : ''}`}
              onClick={() => {
                setShowFilters(!showFilters);
                setShowCustomize(false);
              }}
              title="Toggle Filters"
            >
              <Filter size={16} />
              {(selectedActivityTypes.length > 0 || selectedStatuses.length > 0) && (
                <span className="filter-badge">{selectedActivityTypes.length + selectedStatuses.length}</span>
              )}
            </button>
            <button
              className={`filter-icon-btn ${showCustomize ? 'active' : ''}`}
              onClick={() => {
                setShowCustomize(!showCustomize);
                setShowFilters(false);
              }}
              title="Chart Settings"
            >
              <Activity size={16} />
            </button>
            <button
              className="filter-icon-btn"
              onClick={clearAllFilters}
              title="Clear All Filters"
            >
              <RotateCcw size={16} />
            </button>
            <button
              className="filter-icon-btn"
              onClick={() => window.location.reload()}
              title="Refresh Data"
            >
              <Search size={16} />
            </button>
          </div>
        </div>

        <div className="filter-divider"></div>

        <div className="filter-group">
          <span className="filter-group-label">Export:</span>
          <div className="filter-buttons">
            <button
              className="filter-icon-btn"
              title="Export Chart"
            >
              <Download size={16} />
            </button>
            <button
              className="filter-icon-btn"
              title="Fullscreen View"
            >
              <Maximize2 size={16} />
            </button>
          </div>
        </div>

        {/* Mobile menu button */}
        <div className="mobile-filter-menu">
          <button
            className="filter-icon-btn mobile-menu-btn"
            onClick={() => setShowFilters(!showFilters)}
            title="Filter Menu"
          >
            <Filter size={16} />
            <span className="mobile-menu-text">Menu</span>
          </button>
        </div>
      </div>

      {/* Floating Customize Popover */}
      {showCustomize && (
        <>
          <div className="filter-overlay" onClick={() => setShowCustomize(false)} />
          <div className="customize-popover">
            <div className="filter-popover-header">
              <h3><Activity size={16} /> Chart Settings</h3>
              <button className="close-popover" onClick={() => setShowCustomize(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="filter-popover-content">
              <div className="filter-section compact">
                <h4><Calendar size={12} /> Time Range</h4>
                <div className="customize-options compact">
                  <label className="customize-option compact">
                    <span>Time Period</span>
                    <select
                      value={timeRange}
                      onChange={(e) => setTimeRange(e.target.value)}
                      className="time-select compact"
                    >
                      <option value="last24hours">Last 24 Hours</option>
                      <option value="last7days">Last 7 Days</option>
                      <option value="last30days">Last 30 Days</option>
                      <option value="last90days">Last 90 Days</option>
                      <option value="custom">Custom Range</option>
                    </select>
                  </label>
                  <label className="customize-option compact">
                    <span>View Granularity</span>
                    <div className="granularity-controls compact">
                      {['hourly', 'daily', 'weekly', 'monthly'].map(gran => (
                        <button
                          key={gran}
                          className={`granularity-btn compact ${granularity === gran ? 'active' : ''}`}
                          onClick={() => setGranularity(gran)}
                        >
                          {gran.charAt(0).toUpperCase() + gran.slice(1)}
                        </button>
                      ))}
                    </div>
                  </label>
                </div>
              </div>

              <div className="filter-section compact">
                <h4><Eye size={12} /> Chart Options</h4>
                <div className="customize-options compact">
                  <label className="customize-option compact checkbox">
                    <input
                      type="checkbox"
                      checked={showGradient}
                      onChange={(e) => setShowGradient(e.target.checked)}
                    />
                    <span>Gradient Intensity</span>
                  </label>
                  <label className="customize-option compact checkbox">
                    <input
                      type="checkbox"
                      checked={showAccessibilityPatterns}
                      onChange={(e) => setShowAccessibilityPatterns(e.target.checked)}
                    />
                    <span>Accessibility Patterns</span>
                  </label>
                  <label className="customize-option compact checkbox">
                    <input type="checkbox" defaultChecked />
                    <span>Show Event Counts</span>
                  </label>
                  <label className="customize-option compact checkbox">
                    <input type="checkbox" defaultChecked />
                    <span>Grid Lines</span>
                  </label>
                  {viewMode === 'bargraph' && (
                    <label className="customize-option compact checkbox">
                      <input
                        type="checkbox"
                        checked={showTrends}
                        onChange={(e) => setShowTrends(e.target.checked)}
                      />
                      <span>Show Trend Indicators</span>
                    </label>
                  )}
                </div>
              </div>

              <div className="filter-actions compact">
                <button className="apply-filters compact" onClick={() => setShowCustomize(false)}>
                  <Activity size={12} />
                  Apply & Close
                </button>
                <button className="clear-filters compact" onClick={() => {
                  setShowGradient(true);
                  setShowAccessibilityPatterns(false);
                  setGranularity('weekly');
                  setTimeRange('last30days');
                }}>
                  <RotateCcw size={12} />
                  Reset
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Floating Filter Popover */}
      {showFilters && (
        <>
          <div className="filter-overlay" onClick={() => setShowFilters(false)} />
          <div className="filter-popover">
            <div className="filter-popover-header">
              <h3><Filter size={16} /> Filters</h3>
              <button className="close-popover" onClick={() => setShowFilters(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="filter-popover-content">
              <div className="filter-section compact">
                <h4><Activity size={12} /> Activity Types</h4>
                <div className="search-container compact">
                  <Search size={12} />
                  <input
                    type="text"
                    placeholder="Search activities..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="search-input compact"
                  />
                </div>
                <div className="filter-options compact scrollable">
                  <label className="filter-option compact select-all">
                    <input
                      type="checkbox"
                      checked={selectedActivityTypes.length === activityTypes.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedActivityTypes([...activityTypes]);
                        } else {
                          setSelectedActivityTypes([]);
                        }
                      }}
                    />
                    <strong>Select All ({activityTypes.length})</strong>
                  </label>
                  {filteredActivityTypes.slice(0, 8).map(type => (
                    <label key={type} className="filter-option compact">
                      <input
                        type="checkbox"
                        checked={selectedActivityTypes.includes(type)}
                        onChange={() => handleActivityTypeFilter(type)}
                      />
                      <span className="activity-name">{type}</span>
                      <span className="activity-count">
                        {dummyData.filter(d => d.activityType === type).length}
                      </span>
                    </label>
                  ))}
                  {filteredActivityTypes.length > 8 && (
                    <div className="more-items">
                      +{filteredActivityTypes.length - 8} more items
                    </div>
                  )}
                </div>
              </div>

              <div className="filter-section compact">
                <h4><Eye size={12} /> Status</h4>
                <div className="filter-options compact">
                  {statuses.map(status => (
                    <label key={status} className="filter-option compact enhanced">
                      <input
                        type="checkbox"
                        checked={selectedStatuses.includes(status)}
                        onChange={() => handleStatusFilter(status)}
                      />
                      <span className="status-indicator compact" style={{ backgroundColor: statusColorMap[status] }}>
                        {statusIcons[status]}
                      </span>
                      <span className="status-name">{status.charAt(0).toUpperCase() + status.slice(1)}</span>
                      <span className="status-count">
                        {dummyData.filter(d => d.status === status).length}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="filter-actions compact">
                <button className="apply-filters compact" onClick={() => setShowFilters(false)}>
                  <Activity size={12} />
                  Apply & Close
                </button>
                <button className="clear-filters compact" onClick={clearAllFilters}>
                  <RotateCcw size={12} />
                  Clear All
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Live Preview Panel */}
      {showPreview && (
        <div className="preview-panel">
          <div className="preview-header">
            <h3><Eye size={16} /> Live Preview</h3>
            <div className="preview-stats">
              <span className="preview-stat">
                <strong>{statistics.totalEvents}</strong> events
              </span>
              <span className="preview-stat">
                <strong>{statistics.successRate}%</strong> success rate
              </span>
              <span className="preview-stat">
                <strong>{getActiveFilters().length}</strong> filters active
              </span>
            </div>
          </div>
          <div className="preview-content">
            <div className="mini-chart">
              {viewMode === 'heatmap' ? (
                <HeatmapChart
                  data={filteredData.slice(0, 20)}
                  width={Math.min(600, window.innerWidth - 100)}
                  height={200}
                  onCellClick={optimizedCellClick}
                  showGradient={showGradient}
                  showAccessibilityPatterns={showAccessibilityPatterns}
                  granularity={granularity}
                />
              ) : (
                <div className="preview-bargraph">
                  <div className="bargraph-container">
                    {filteredData.slice(0, 10).map((item, index) => (
                      <div key={index} className="bar-item">
                        <div className={`bar bar-${item.status}`}
                             style={{height: `${Math.random() * 100 + 20}px`}}>
                        </div>
                        <span className="bar-label">{item.activityType.slice(0, 6)}...</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="preview-time-selector">
              <label>Time Range:</label>
              <select value={granularity} onChange={(e) => setGranularity(e.target.value)}>
                {timeGranularityOptions.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Legend */}
      <div className="legend">
        <div className="legend-section">
          <h4>Status Legend:</h4>
          <div className="legend-items">
            {Object.entries(statusColorMap).map(([status, color]) => (
              <div key={status} className="legend-item">
                <div className="legend-color" style={{ backgroundColor: color }}>
                  {statusIcons[status]}
                </div>
                <span>{status.charAt(0).toUpperCase() + status.slice(1)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="legend-section">
          <h4>View: {granularity} • Range: {timeRange.replace(/([A-Z])/g, ' $1').toLowerCase()}</h4>
          <div className="intensity-scale">
            <span>Low</span>
            <div className="intensity-gradient"></div>
            <span>High</span>
          </div>
        </div>

        <div className="legend-section">
          <small>💡 Click cells for details • Use preview for live changes • Click stats to filter</small>
        </div>
      </div>

      {/* Tab-Specific Content */}
      <div className={`content-container ${compactMode ? 'compact' : ''}`}>
        {activeTab === 'overview' ? (
          <div className="chart-container" style={{ willChange: 'transform' }}>
            {filteredData.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-content">
                  <Activity size={48} className="empty-icon" />
                  <h3>No data to display</h3>
                  <p>Try adjusting your filters or check back later for new events.</p>
                  <button className="clear-filters" onClick={clearAllFilters}>
                    Clear All Filters
                  </button>
                </div>
              </div>
            ) : viewMode === 'heatmap' ? (
              <HeatmapChart
                data={filteredData}
                width={1200}
                height={600}
                onCellClick={optimizedCellClick}
                showGradient={showGradient}
                showAccessibilityPatterns={showAccessibilityPatterns}
                granularity={granularity}
              />
            ) : (
              <BarGraph
                data={filteredData}
                width={1200}
                height={600}
                granularity={granularity}
                showTrends={showTrends}
              />
            )}
          </div>
        ) : (
          <div className="tab-specific-content">
            <div className="tab-header">
              <h2>
                {tabs.find(tab => tab.id === activeTab)?.icon} {tabs.find(tab => tab.id === activeTab)?.label}
              </h2>
              <div className="tab-specific-controls">
                <div className="granularity-selector">
                  <span className="selector-label">Time View:</span>
                  {timeGranularityOptions.map((option) => (
                    <button
                      key={option}
                      className={`granularity-option ${granularity === option ? 'active' : ''}`}
                      onClick={() => setGranularity(option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="tab-content-grid">
              {/* Filtered Chart for specific tab */}
              <div className="tab-chart-section">
                {(() => {
                  // Filter data based on tab context
                  const getTabFilteredData = () => {
                    const sampleDataForTab = filteredData.slice(0, Math.min(20, filteredData.length));

                    switch (activeTab) {
                      case 'transaction':
                        const transactionData = filteredData.filter(d =>
                          d && d.activityType && (
                            d.activityType.toLowerCase().includes('transaction') ||
                            d.activityType.toLowerCase().includes('payment') ||
                            d.activityType.toLowerCase().includes('transfer') ||
                            d.activityType.toLowerCase().includes('purchase')
                          )
                        );
                        return transactionData.length > 0 ? transactionData : sampleDataForTab;

                      case 'association':
                        const associationData = filteredData.filter(d =>
                          d && d.activityType && (
                            d.activityType.toLowerCase().includes('association') ||
                            d.activityType.toLowerCase().includes('link') ||
                            d.activityType.toLowerCase().includes('relationship') ||
                            d.activityType.toLowerCase().includes('connection')
                          )
                        );
                        return associationData.length > 0 ? associationData : sampleDataForTab;

                      case 'behaviour':
                        const behaviourData = filteredData.filter(d =>
                          d && d.activityType && (
                            d.activityType.toLowerCase().includes('behavior') ||
                            d.activityType.toLowerCase().includes('behaviour') ||
                            d.activityType.toLowerCase().includes('activity') ||
                            d.activityType.toLowerCase().includes('action')
                          )
                        );
                        return behaviourData.length > 0 ? behaviourData : sampleDataForTab;

                      case 'fcr':
                        const fcrData = filteredData.filter(d =>
                          d && d.activityType && (
                            d.activityType.toLowerCase().includes('fcr') ||
                            d.activityType.toLowerCase().includes('score') ||
                            d.activityType.toLowerCase().includes('rating') ||
                            d.activityType.toLowerCase().includes('risk')
                          )
                        );
                        return fcrData.length > 0 ? fcrData : sampleDataForTab;

                      case 'sanction':
                        const sanctionData = filteredData.filter(d =>
                          d && d.activityType && (
                            d.activityType.toLowerCase().includes('sanction') ||
                            d.activityType.toLowerCase().includes('compliance') ||
                            d.activityType.toLowerCase().includes('violation') ||
                            d.activityType.toLowerCase().includes('penalty')
                          )
                        );
                        return sanctionData.length > 0 ? sanctionData : sampleDataForTab;

                      case 'evidence':
                        const evidenceData = filteredData.filter(d =>
                          d && d.activityType && (
                            d.activityType.toLowerCase().includes('evidence') ||
                            d.activityType.toLowerCase().includes('document') ||
                            d.activityType.toLowerCase().includes('proof') ||
                            d.activityType.toLowerCase().includes('verification')
                          )
                        );
                        return evidenceData.length > 0 ? evidenceData : sampleDataForTab;

                      default:
                        return filteredData;
                    }
                  };

                  const tabSpecificData = getTabFilteredData();

                  return viewMode === 'heatmap' ? (
                    <HeatmapChart
                      data={tabSpecificData}
                      width={800}
                      height={400}
                      onCellClick={optimizedCellClick}
                      showGradient={showGradient}
                      showAccessibilityPatterns={showAccessibilityPatterns}
                      granularity={granularity}
                    />
                  ) : (
                    <BarGraph
                      data={tabSpecificData}
                      width={800}
                      height={400}
                      granularity={granularity}
                      showTrends={showTrends}
                    />
                  );
                })()}
              </div>

              {/* Tab-specific metrics and details */}
              <div className="tab-metrics-section">
                <div className="tab-specific-details">
                  <h3>
                    {tabs.find(tab => tab.id === activeTab)?.icon}
                    {tabs.find(tab => tab.id === activeTab)?.label} Details
                  </h3>

                  {/* Tab-specific information */}
                  <div className="tab-info-cards">
                    {(() => {
                      // Filter data based on tab context
                      const getTabSpecificData = () => {
                        const sampleDataForTab = filteredData.slice(0, Math.min(20, filteredData.length));

                        switch (activeTab) {
                          case 'transaction':
                            const transactionData = filteredData.filter(d =>
                              d && d.activityType && (
                                d.activityType.toLowerCase().includes('transaction') ||
                                d.activityType.toLowerCase().includes('payment') ||
                                d.activityType.toLowerCase().includes('transfer') ||
                                d.activityType.toLowerCase().includes('purchase')
                              )
                            );
                            return transactionData.length > 0 ? transactionData : sampleDataForTab;

                          case 'association':
                            const associationData = filteredData.filter(d =>
                              d && d.activityType && (
                                d.activityType.toLowerCase().includes('association') ||
                                d.activityType.toLowerCase().includes('link') ||
                                d.activityType.toLowerCase().includes('relationship') ||
                                d.activityType.toLowerCase().includes('connection')
                              )
                            );
                            return associationData.length > 0 ? associationData : sampleDataForTab;

                          case 'behaviour':
                            const behaviourData = filteredData.filter(d =>
                              d && d.activityType && (
                                d.activityType.toLowerCase().includes('behavior') ||
                                d.activityType.toLowerCase().includes('behaviour') ||
                                d.activityType.toLowerCase().includes('activity') ||
                                d.activityType.toLowerCase().includes('action')
                              )
                            );
                            return behaviourData.length > 0 ? behaviourData : sampleDataForTab;

                          case 'fcr':
                            const fcrData = filteredData.filter(d =>
                              d && d.activityType && (
                                d.activityType.toLowerCase().includes('fcr') ||
                                d.activityType.toLowerCase().includes('score') ||
                                d.activityType.toLowerCase().includes('rating') ||
                                d.activityType.toLowerCase().includes('risk')
                              )
                            );
                            return fcrData.length > 0 ? fcrData : sampleDataForTab;

                          case 'sanction':
                            const sanctionData = filteredData.filter(d =>
                              d && d.activityType && (
                                d.activityType.toLowerCase().includes('sanction') ||
                                d.activityType.toLowerCase().includes('compliance') ||
                                d.activityType.toLowerCase().includes('violation') ||
                                d.activityType.toLowerCase().includes('penalty')
                              )
                            );
                            return sanctionData.length > 0 ? sanctionData : sampleDataForTab;

                          case 'evidence':
                            const evidenceData = filteredData.filter(d =>
                              d && d.activityType && (
                                d.activityType.toLowerCase().includes('evidence') ||
                                d.activityType.toLowerCase().includes('document') ||
                                d.activityType.toLowerCase().includes('proof') ||
                                d.activityType.toLowerCase().includes('verification')
                              )
                            );
                            return evidenceData.length > 0 ? evidenceData : sampleDataForTab;

                          default:
                            return filteredData;
                        }
                      };

                      const tabSpecificData = getTabSpecificData();

                      if (activeTab === 'transaction') {
                        return (
                          <div className="info-card">
                            <h4>💳 Transaction Analytics</h4>
                            <p>Monitor payment flows, transaction volumes, and financial activity patterns across all user transactions.</p>
                            <div className="quick-stats">
                              <div className="quick-stat">
                                <span className="stat-number">{tabSpecificData.length}</span>
                                <span className="stat-label">Total Events</span>
                              </div>
                              <div className="quick-stat">
                                <span className="stat-number">{tabSpecificData.filter(d => d && d.status === 'success').length}</span>
                                <span className="stat-label">Successful</span>
                              </div>
                            </div>
                            <div className="tab-specific-metrics">
                              <p><strong>Failure Rate:</strong> {tabSpecificData.length > 0 ? Math.round((tabSpecificData.filter(d => d && d.status === 'fail').length / tabSpecificData.length) * 100) : 0}%</p>
                              <p><strong>Active Users:</strong> {new Set(tabSpecificData.filter(d => d && d.user).map(d => d.user)).size}</p>
                            </div>
                          </div>
                        );
                      }

                      if (activeTab === 'association') {
                        return (
                          <div className="info-card">
                            <h4>🔗 Association Analysis</h4>
                            <p>Track relationships and connections between entities, users, and activities.</p>
                            <div className="quick-stats">
                              <div className="quick-stat">
                                <span className="stat-number">{new Set(tabSpecificData.filter(d => d && d.user).map(d => d.user)).size}</span>
                                <span className="stat-label">Connected Users</span>
                              </div>
                              <div className="quick-stat">
                                <span className="stat-number">{new Set(tabSpecificData.filter(d => d && d.device).map(d => d.device)).size}</span>
                                <span className="stat-label">Linked Devices</span>
                              </div>
                            </div>
                            <div className="tab-specific-metrics">
                              <p><strong>Network Density:</strong> {Math.round(Math.random() * 100)}%</p>
                              <p><strong>Active Connections:</strong> {tabSpecificData.length}</p>
                            </div>
                          </div>
                        );
                      }

                      if (activeTab === 'behaviour') {
                        return (
                          <div className="info-card">
                            <h4>👤 Behavior Patterns</h4>
                            <p>Analyze user behavior, activity patterns, and behavioral anomalies.</p>
                            <div className="quick-stats">
                              <div className="quick-stat">
                                <span className="stat-number">{tabSpecificData.length}</span>
                                <span className="stat-label">Behavior Events</span>
                              </div>
                              <div className="quick-stat">
                                <span className="stat-number">{tabSpecificData.length > 0 ? Math.round((tabSpecificData.filter(d => d && d.status === 'warning').length / tabSpecificData.length) * 100) : 0}%</span>
                                <span className="stat-label">Anomaly Rate</span>
                              </div>
                            </div>
                            <div className="tab-specific-metrics">
                              <p><strong>Patterns Detected:</strong> {Math.floor(Math.random() * 50) + 10}</p>
                              <p><strong>Risk Level:</strong> {tabSpecificData.filter(d => d && d.status === 'fail').length > 0 ? 'High' : 'Low'}</p>
                            </div>
                          </div>
                        );
                      }

                      if (activeTab === 'fcr') {
                        return (
                          <div className="info-card">
                            <h4>📊 FCR Score Analysis</h4>
                            <p>Financial Crime Risk scoring and risk assessment metrics.</p>
                            <div className="quick-stats">
                              <div className="quick-stat">
                                <span className="stat-number">{Math.round(Math.random() * 100)}</span>
                                <span className="stat-label">Avg FCR Score</span>
                              </div>
                              <div className="quick-stat">
                                <span className="stat-number">{tabSpecificData.filter(d => d && d.status === 'fail').length}</span>
                                <span className="stat-label">High Risk Events</span>
                              </div>
                            </div>
                            <div className="tab-specific-metrics">
                              <p><strong>Risk Distribution:</strong> {Math.round((tabSpecificData.filter(d => d && d.status === 'fail').length / Math.max(tabSpecificData.length, 1)) * 100)}% High Risk</p>
                              <p><strong>Score Trend:</strong> {Math.random() > 0.5 ? '📈 Improving' : '📉 Declining'}</p>
                            </div>
                          </div>
                        );
                      }

                      if (activeTab === 'sanction') {
                        return (
                          <div className="info-card">
                            <h4>⚖️ Sanction Monitoring</h4>
                            <p>Track compliance violations, sanctions screening, and regulatory issues.</p>
                            <div className="quick-stats">
                              <div className="quick-stat">
                                <span className="stat-number">{tabSpecificData.filter(d => d && d.status === 'fail').length}</span>
                                <span className="stat-label">Violations</span>
                              </div>
                              <div className="quick-stat">
                                <span className="stat-number">{tabSpecificData.filter(d => d && d.status === 'warning').length}</span>
                                <span className="stat-label">Warnings</span>
                              </div>
                            </div>
                            <div className="tab-specific-metrics">
                              <p><strong>Compliance Rate:</strong> {Math.round((tabSpecificData.filter(d => d && d.status === 'success').length / Math.max(tabSpecificData.length, 1)) * 100)}%</p>
                              <p><strong>Critical Issues:</strong> {tabSpecificData.filter(d => d && d.status === 'fail').length}</p>
                            </div>
                          </div>
                        );
                      }

                      if (activeTab === 'evidence') {
                        return (
                          <div className="info-card">
                            <h4>📋 Evidence Management</h4>
                            <p>Document trails, evidence collection, and verification processes.</p>
                            <div className="quick-stats">
                              <div className="quick-stat">
                                <span className="stat-number">{tabSpecificData.length}</span>
                                <span className="stat-label">Evidence Items</span>
                              </div>
                              <div className="quick-stat">
                                <span className="stat-number">{tabSpecificData.filter(d => d && d.status === 'success').length}</span>
                                <span className="stat-label">Verified Items</span>
                              </div>
                            </div>
                            <div className="tab-specific-metrics">
                              <p><strong>Verification Rate:</strong> {Math.round((tabSpecificData.filter(d => d && d.status === 'success').length / Math.max(tabSpecificData.length, 1)) * 100)}%</p>
                              <p><strong>Pending Review:</strong> {tabSpecificData.filter(d => d && d.status === 'warning').length}</p>
                            </div>
                          </div>
                        );
                      }

                      return null;
                    })()}
                  </div>
                </div>

                <div className="metrics-grid">
                  <div className="metric-card">
                    <div className="metric-value">{filteredData.length}</div>
                    <div className="metric-label">Total Events</div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-value">{statistics.successRate}%</div>
                    <div className="metric-label">Success Rate</div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-value">{new Set(filteredData.map(d => d.user).filter(Boolean)).size}</div>
                    <div className="metric-label">Unique Users</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Enhanced Details Modal */}
      {selectedCell && (
        <div className="modal-overlay" onClick={closeDetailsModal}>
          <div className="modal-content enhanced" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-section">
                <h3>{selectedCell.activityType}</h3>
                <span className="modal-subtitle">
                  {selectedCell.periodLabel}
                </span>
              </div>
              <button className="close-button" onClick={closeDetailsModal}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="detail-summary">
                <div className="summary-stats">
                  <div className="summary-stat">
                    <div className="summary-value">{selectedCell.events.length}</div>
                    <div className="summary-label">Total Events</div>
                  </div>
                  <div className="summary-stat">
                    <div className="summary-value" style={{ color: statusColorMap[selectedCell.status] }}>
                      {statusIcons[selectedCell.status]} {selectedCell.status.toUpperCase()}
                    </div>
                    <div className="summary-label">Dominant Status</div>
                  </div>
                  <div className="summary-stat">
                    <div className="summary-value">{Math.round(selectedCell.intensity * 100)}%</div>
                    <div className="summary-label">Intensity</div>
                  </div>
                  <div className="summary-stat">
                    <div className="summary-value">{new Set(selectedCell.events.map(e => e.user).filter(Boolean)).size}</div>
                    <div className="summary-label">Unique Users</div>
                  </div>
                </div>
              </div>

              {selectedCell.events.length > 0 && (
                <div className="events-section">
                  <h4>Event Details ({selectedCell.events.length})</h4>
                  <div className="events-grid">
                    {selectedCell.events.map((event, index) => (
                      <div key={index} className="event-card enhanced">
                        <div className="event-header">
                          <span className="event-date">
                            {format(parseISO(event.date), 'MMM dd, yyyy HH:mm')}
                          </span>
                          <span
                            className="event-status"
                            style={{ backgroundColor: statusColorMap[event.status] }}
                          >
                            {statusIcons[event.status]} {event.status}
                          </span>
                        </div>
                        <div className="event-details">
                          <div className="event-detail-row">
                            <Users size={14} />
                            <span><strong>User:</strong> {event.user}</span>
                          </div>
                          <div className="event-detail-row">
                            <Activity size={14} />
                            <span><strong>Device:</strong> {event.device}</span>
                          </div>
                          <div className="event-detail-row">
                            <span><strong>Activity:</strong> {event.activityType}</span>
                          </div>
                          <div className="event-detail-row">
                            <span><strong>Status:</strong> <span style={{color: statusColorMap[event.status]}}>{statusIcons[event.status]} {event.status.toUpperCase()}</span></span>
                          </div>
                          <div className="event-detail-row">
                            <span><strong>Date:</strong> {format(parseISO(event.date), 'PPp')}</span>
                          </div>
                          <div className="event-detail-row">
                            <span><strong>IP:</strong> 192.168.{Math.floor(Math.random() * 255)}.{Math.floor(Math.random() * 255)}</span>
                          </div>
                          <div className="event-detail-row">
                            <span><strong>Session:</strong> sess_{Math.random().toString(36).substr(2, 9)}</span>
                          </div>
                          <div className="event-detail-row">
                            <span><strong>Duration:</strong> {Math.floor(Math.random() * 300) + 10}s</span>
                          </div>
                          <div className="event-detail-row">
                            <span><strong>Location:</strong> {['New York', 'London', 'Tokyo', 'Sydney', 'Berlin'][Math.floor(Math.random() * 5)]}</span>
                          </div>
                          <div className="event-detail-row">
                            <span><strong>Risk Score:</strong> <span style={{color: event.status === 'fail' ? '#ef4444' : event.status === 'warning' ? '#eab308' : '#22c55e'}}>{Math.floor(Math.random() * 100)}/100</span></span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;