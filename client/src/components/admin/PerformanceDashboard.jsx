/**
 * Performance Dashboard Component
 * Displays cache performance, API usage, and optimization insights
 */

import React, { useState, useEffect } from 'react';
import { 
  BarChart3, TrendingUp, Clock, Database, 
  Zap, AlertTriangle, CheckCircle, RefreshCw,
  Activity, Target, Lightbulb
} from 'lucide-react';
import { usePerformanceMonitor } from '../../hooks/useSmartPrefetch';
import globalCacheManager from '../../services/globalCacheManager';
import performanceMonitor from '../../services/performanceMonitor';

const PerformanceDashboard = () => {
  const { getMetrics, getInsights, getRecommendations, resetMetrics } = usePerformanceMonitor();
  const [metrics, setMetrics] = useState(null);
  const [insights, setInsights] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [cacheStats, setCacheStats] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);

  const refreshData = async () => {
    console.log('🔄 Refresh button clicked - starting refresh...');
    setIsRefreshing(true);
    
    // Add a small delay to show the loading state
    await new Promise(resolve => setTimeout(resolve, 100));
    try {
      console.log('📊 Fetching new metrics...');
      
      // Check if performance monitor functions are available
      if (typeof getMetrics !== 'function') {
        console.error('❌ getMetrics function not available');
        throw new Error('Performance monitor not properly initialized');
      }
      
      // Force performance monitor to update its metrics
      performanceMonitor.reportMetrics();
      
      const newMetrics = getMetrics();
      const newInsights = getInsights();
      const newRecommendations = getRecommendations();
      const newCacheStats = globalCacheManager.getStats();
      
      console.log('📈 New metrics:', newMetrics);
      console.log('💡 New insights:', newInsights);
      console.log('🎯 New recommendations:', newRecommendations);
      console.log('🗄️ New cache stats:', newCacheStats);
      
      // Validate data before setting state
      if (newMetrics && newCacheStats) {
        setMetrics(newMetrics);
        setInsights(newInsights || []);
        setRecommendations(newRecommendations || []);
        setCacheStats(newCacheStats);
        setLastRefresh(new Date());
        console.log('✅ Refresh completed successfully');
      } else {
        console.warn('⚠️ Incomplete data received, keeping existing state');
      }
    } catch (error) {
      console.error('❌ Failed to refresh performance data:', error);
      // Show user-friendly error message
      alert('Failed to refresh performance data. Please try again.');
    } finally {
      setIsRefreshing(false);
      console.log('🏁 Refresh process finished');
    }
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, []);

  if (!metrics || !cacheStats) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <Activity className="h-8 w-8 animate-pulse mx-auto mb-2 text-forest-500" />
          <p className="text-sm text-gray-600">Loading performance data...</p>
        </div>
      </div>
    );
  }

  const formatNumber = (num) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const formatBytes = (bytes) => {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  };

  return (
    <div className="p-6 space-y-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Performance Dashboard
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Monitor API usage, cache performance, and optimization opportunities
            {lastRefresh && (
              <span className="ml-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                • Last updated: {lastRefresh.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={refreshData}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-full font-semibold transition shadow-lg hover:opacity-80 disabled:opacity-50"
            style={{
              backgroundColor: isRefreshing ? 'var(--accent-blue)' : 'var(--surface)',
              borderWidth: '1px',
              borderColor: 'var(--border)',
              color: isRefreshing ? 'white' : 'var(--text-primary)'
            }}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            onClick={resetMetrics}
            className="px-4 py-2 rounded-full font-semibold transition shadow-lg hover:opacity-80"
            style={{
              backgroundColor: 'var(--error-red)',
              color: 'white'
            }}
          >
            Reset Metrics
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Cache Hit Rate */}
        <div className="rounded-xl p-6" style={{
          backgroundColor: 'var(--surface)',
          borderWidth: '1px',
          borderColor: 'var(--border)'
        }}>
          <div className="flex items-center justify-between mb-2">
            <Database className="h-5 w-5 text-blue-500" />
            <span className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {cacheStats.hitRate?.toFixed(1) || 0}%
            </span>
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            Cache Hit Rate
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
            {cacheStats.hits || 0} hits / {cacheStats.misses || 0} misses
          </p>
        </div>

        {/* API Calls */}
        <div className="rounded-xl p-6" style={{
          backgroundColor: 'var(--surface)',
          borderWidth: '1px',
          borderColor: 'var(--border)'
        }}>
          <div className="flex items-center justify-between mb-2">
            <BarChart3 className="h-5 w-5 text-green-500" />
            <span className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {formatNumber(metrics.apiCalls?.total || 0)}
            </span>
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            Total API Calls
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
            {formatNumber(metrics.apiCalls?.network || 0)} network, {formatNumber(metrics.apiCalls?.cached || 0)} cached
          </p>
        </div>

        {/* Response Time */}
        <div className="rounded-xl p-6" style={{
          backgroundColor: 'var(--surface)',
          borderWidth: '1px',
          borderColor: 'var(--border)'
        }}>
          <div className="flex items-center justify-between mb-2">
            <Clock className="h-5 w-5 text-orange-500" />
            <span className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {metrics.performance?.averageResponseTime?.toFixed(0) || 0}ms
            </span>
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            Avg Response Time
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
            {metrics.performance?.slowestRequests?.length || 0} slow requests tracked
          </p>
        </div>

        {/* Cache Size */}
        <div className="rounded-xl p-6" style={{
          backgroundColor: 'var(--surface)',
          borderWidth: '1px',
          borderColor: 'var(--border)'
        }}>
          <div className="flex items-center justify-between mb-2">
            <Zap className="h-5 w-5 text-purple-500" />
            <span className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {formatBytes(cacheStats.storage?.size || 0)}
            </span>
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            Cache Size
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
            {cacheStats.storage?.usage || 0}% of limit
          </p>
        </div>
      </div>

      {/* Insights and Recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Performance Insights */}
        <div className="rounded-xl p-6" style={{
          backgroundColor: 'var(--surface)',
          borderWidth: '1px',
          borderColor: 'var(--border)'
        }}>
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              Performance Insights
            </h3>
          </div>
          <div className="space-y-3">
            {insights.length > 0 ? (
              insights.map((insight, index) => (
                <div key={index} className="flex items-start gap-3 p-3 rounded-xl" style={{
                  backgroundColor: insight.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 
                                 insight.type === 'warning' ? 'rgba(245, 158, 11, 0.1)' : 
                                 'rgba(34, 197, 94, 0.1)'
                }}>
                  <div className={`w-2 h-2 rounded-full mt-2 ${
                    insight.type === 'error' ? 'bg-red-500' : 
                    insight.type === 'warning' ? 'bg-yellow-500' : 
                    'bg-green-500'
                  }`} />
                  <div className="flex-1">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {insight.message}
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                      {insight.metric}: {insight.value}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex items-center gap-2 p-3 rounded-xl" style={{
                backgroundColor: 'rgba(34, 197, 94, 0.1)'
              }}>
                <CheckCircle className="h-4 w-4 text-green-500" />
                <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                  No performance issues detected
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Optimization Recommendations */}
        <div className="rounded-xl p-6" style={{
          backgroundColor: 'var(--surface)',
          borderWidth: '1px',
          borderColor: 'var(--border)'
        }}>
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="h-5 w-5 text-blue-500" />
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              Optimization Recommendations
            </h3>
          </div>
          <div className="space-y-3">
            {recommendations.length > 0 ? (
              recommendations.map((rec, index) => (
                <div key={index} className="p-3 rounded-xl" style={{
                  backgroundColor: rec.priority === 'high' ? 'rgba(239, 68, 68, 0.1)' : 
                                 rec.priority === 'medium' ? 'rgba(245, 158, 11, 0.1)' : 
                                 'rgba(34, 197, 94, 0.1)'
                }}>
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {rec.title}
                    </h4>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      rec.priority === 'high' ? 'bg-red-500 text-white' : 
                      rec.priority === 'medium' ? 'bg-yellow-500 text-white' : 
                      'bg-green-500 text-white'
                    }`}>
                      {rec.priority}
                    </span>
                  </div>
                  <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                    {rec.description}
                  </p>
                  <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                    Impact: {rec.impact}
                  </p>
                </div>
              ))
            ) : (
              <div className="flex items-center gap-2 p-3 rounded-xl" style={{
                backgroundColor: 'rgba(34, 197, 94, 0.1)'
              }}>
                <CheckCircle className="h-4 w-4 text-green-500" />
                <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                  No optimization recommendations at this time
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* API Usage by Type */}
      <div className="rounded-xl p-6" style={{
        backgroundColor: 'var(--surface)',
        borderWidth: '1px',
        borderColor: 'var(--border)'
      }}>
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-5 w-5 text-green-500" />
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            API Usage by Type
          </h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(metrics.apiCalls?.byType || {}).map(([type, stats]) => (
            <div key={type} className="p-4 rounded-xl" style={{
              backgroundColor: 'var(--surface-hover)',
              borderWidth: '1px',
              borderColor: 'var(--border)'
            }}>
              <h4 className="text-sm font-semibold capitalize mb-2" style={{ color: 'var(--text-primary)' }}>
                {type}
              </h4>
              <div className="space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <p>Total: {formatNumber(stats.total)}</p>
                <p>Network: {formatNumber(stats.network)}</p>
                <p>Cached: {formatNumber(stats.cached)}</p>
                <p>Failed: {formatNumber(stats.failed)}</p>
                <p>Avg Time: {stats.averageTime?.toFixed(0) || 0}ms</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cache Statistics */}
      <div className="rounded-xl p-6" style={{
        backgroundColor: 'var(--surface)',
        borderWidth: '1px',
        borderColor: 'var(--border)'
      }}>
        <div className="flex items-center gap-2 mb-4">
          <Target className="h-5 w-5 text-purple-500" />
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Cache Statistics
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Memory Cache */}
          <div>
            <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
              Memory Cache
            </h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--text-secondary)' }}>Entries:</span>
                <span style={{ color: 'var(--text-primary)' }}>{cacheStats.memory?.total || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--text-secondary)' }}>Usage:</span>
                <span style={{ color: 'var(--text-primary)' }}>{cacheStats.memory?.usage || 0}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--text-secondary)' }}>Max:</span>
                <span style={{ color: 'var(--text-primary)' }}>{cacheStats.memory?.max || 0}</span>
              </div>
            </div>
          </div>

          {/* Storage Cache */}
          <div>
            <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
              Storage Cache
            </h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--text-secondary)' }}>Entries:</span>
                <span style={{ color: 'var(--text-primary)' }}>{cacheStats.storage?.total || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--text-secondary)' }}>Size:</span>
                <span style={{ color: 'var(--text-primary)' }}>{formatBytes(cacheStats.storage?.size || 0)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--text-secondary)' }}>Usage:</span>
                <span style={{ color: 'var(--text-primary)' }}>{cacheStats.storage?.usage || 0}%</span>
              </div>
            </div>
          </div>

          {/* Cache Types */}
          <div>
            <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
              Cache Types
            </h4>
            <div className="space-y-2">
              {Object.entries(cacheStats.types || {}).map(([type, count]) => (
                <div key={type} className="flex justify-between text-sm">
                  <span className="capitalize" style={{ color: 'var(--text-secondary)' }}>{type}:</span>
                  <span style={{ color: 'var(--text-primary)' }}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PerformanceDashboard;
