/**
 * Admin Performance Page
 * Wrapper for the Performance Dashboard with admin layout
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Zap } from '@components/icons';
import PerformanceDashboard from '../../components/admin/PerformanceDashboard';

const AdminPerformancePage = () => {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Header */}
      <div className="backdrop-blur-xl border-b sticky top-0 z-10"
        style={{
          backgroundColor: 'var(--surface)',
          borderColor: 'var(--border)'
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                to="/admin"
                className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full font-semibold transition shadow-lg hover:opacity-80 text-sm sm:text-base"
                style={{
                  backgroundColor: 'var(--surface-hover)',
                  borderWidth: '1px',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)'
                }}
              >
                <ArrowLeft className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Back to Dashboard</span>
                <span className="sm:hidden">Back</span>
              </Link>
              <div>
                <h1 className="text-3xl font-bold mb-1 flex items-center gap-3"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <Zap className="h-8 w-8 text-blue-500" />
                  Performance Monitor
                </h1>
                <p style={{ color: 'var(--text-secondary)' }}>
                  Monitor API usage, cache performance, and optimization opportunities
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Dashboard Content */}
      <PerformanceDashboard />
    </div>
  );
};

export default AdminPerformancePage;
