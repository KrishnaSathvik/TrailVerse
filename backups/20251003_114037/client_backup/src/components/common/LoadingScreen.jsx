import React from 'react';
import { Mountain } from 'lucide-react';

const LoadingScreen = ({ message = 'Loading...' }) => {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      {/* Logo */}
      <div className="mb-8">
        <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-forest-400 to-forest-600 flex items-center justify-center animate-pulse">
          <Mountain className="h-10 w-10 text-white" />
        </div>
      </div>

      {/* Loading Bar */}
      <div className="w-64 h-1 rounded-full overflow-hidden"
        style={{ backgroundColor: 'var(--surface)' }}
      >
        <div className="h-full bg-gradient-to-r from-forest-400 to-forest-600 animate-[loading_1.5s_ease-in-out_infinite]" />
      </div>

      {/* Message */}
      {message && (
        <p className="mt-4 text-sm font-medium"
          style={{ color: 'var(--text-secondary)' }}
        >
          {message}
        </p>
      )}

      <style jsx>{`
        @keyframes loading {
          0% {
            width: 0%;
            margin-left: 0%;
          }
          50% {
            width: 75%;
            margin-left: 0%;
          }
          100% {
            width: 0%;
            margin-left: 100%;
          }
        }
      `}</style>
    </div>
  );
};

export default LoadingScreen;
