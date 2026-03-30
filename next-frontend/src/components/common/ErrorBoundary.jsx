import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
          <div className="text-center max-w-md px-4">
            <h1 className="text-6xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Oops!</h1>
            <p className="text-xl mb-6" style={{ color: 'var(--text-secondary)' }}>
              Something went wrong. Please refresh the page.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 rounded-lg font-semibold transition-colors"
              style={{ 
                backgroundColor: 'var(--accent-green)',
                color: '#ffffff'
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--accent-green-dark)'}
              onMouseLeave={(e) => e.target.style.backgroundColor = 'var(--accent-green)'}
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
