import React, { useState, useEffect } from 'react';
import { Mountain, Sun, Moon, Star, Sparkles, Compass } from '@components/icons';

const DailyFeedLoader = ({ isGenerating = false } = {}) => {
  const [loadingPhase, setLoadingPhase] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const phases = isGenerating ? [
      { phase: 0, message: "Finding your perfect park...", progress: 20 },
      { phase: 1, message: "Checking weather conditions...", progress: 40 },
      { phase: 2, message: "Analyzing stargazing opportunities...", progress: 60 },
      { phase: 3, message: "Generating personalized insights...", progress: 80 },
      { phase: 4, message: "Finalizing your daily adventure...", progress: 100 }
    ] : [
      { phase: 0, message: "Loading your daily adventure...", progress: 50 },
      { phase: 1, message: "Preparing your personalized feed...", progress: 100 }
    ];

    let currentPhase = 0;
    const interval = setInterval(() => {
      if (currentPhase < phases.length) {
        setLoadingPhase(phases[currentPhase].phase);
        setProgress(phases[currentPhase].progress);
        currentPhase++;
      } else {
        clearInterval(interval);
      }
    }, isGenerating ? 800 : 400);

    return () => clearInterval(interval);
  }, [isGenerating]);

  const getPhaseMessage = () => {
    const messages = [
      "Finding your perfect park...",
      "Checking weather conditions...",
      "Analyzing stargazing opportunities...",
      "Generating personalized insights...",
      "Finalizing your daily adventure..."
    ];
    return messages[loadingPhase] || "Preparing your adventure...";
  };

  const getPhaseIcon = () => {
    const icons = [
      <Mountain className="w-8 h-8 text-white" />,
      <Sun className="w-8 h-8 text-white" />,
      <Star className="w-8 h-8 text-white" />,
      <Sparkles className="w-8 h-8 text-white" />,
      <Compass className="w-8 h-8 text-white" />
    ];
    return icons[loadingPhase] || <Sparkles className="w-8 h-8 text-white" />;
  };

  const getPhaseColor = () => {
    const colors = [
      "from-green-400 to-blue-500",
      "from-yellow-400 to-orange-500", 
      "from-purple-400 to-indigo-500",
      "from-pink-400 to-rose-500",
      "from-emerald-400 to-teal-500"
    ];
    return colors[loadingPhase] || "from-blue-400 to-purple-500";
  };
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Header */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Animated Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className={`w-16 h-16 bg-gradient-to-br ${getPhaseColor()} rounded-full flex items-center justify-center animate-pulse`}>
              {getPhaseIcon()}
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Crafting Your Daily Adventure
            </h1>
          </div>
          <p className="text-lg text-gray-600 animate-pulse">
            {getPhaseMessage()}
          </p>
        </div>

        {/* Loading Steps */}
        <div className="max-w-4xl mx-auto mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Step 1: Park Selection */}
            <div className="text-center p-6 rounded-2xl" style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}>
              <div className="relative mb-4">
                <div className="w-16 h-16 mx-auto bg-gradient-to-br from-green-400 to-blue-500 rounded-full flex items-center justify-center animate-bounce">
                  <Mountain className="w-8 h-8 text-white" />
                </div>
                <div className="absolute -top-2 -right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                  <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
                </div>
              </div>
              <h3 className="font-semibold text-lg mb-2">Finding Your Park</h3>
              <p className="text-sm text-gray-600">Selecting the perfect national park for today</p>
              <div className="mt-3 flex justify-center">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-ping"></div>
              </div>
            </div>

            {/* Step 2: Weather Analysis */}
            <div className="text-center p-6 rounded-2xl" style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}>
              <div className="relative mb-4">
                <div className="w-16 h-16 mx-auto bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center animate-pulse">
                  <Sun className="w-8 h-8 text-white" />
                </div>
                <div className="absolute -top-2 -right-2 w-6 h-6 bg-yellow-500 rounded-full flex items-center justify-center">
                  <div className="w-3 h-3 bg-white rounded-full animate-spin"></div>
                </div>
              </div>
              <h3 className="font-semibold text-lg mb-2">Weather Check</h3>
              <p className="text-sm text-gray-600">Analyzing current conditions and forecasts</p>
              <div className="mt-3 flex justify-center">
                <div className="w-2 h-2 bg-yellow-500 rounded-full animate-ping"></div>
              </div>
            </div>

            {/* Step 3: Stargazing Guide */}
            <div className="text-center p-6 rounded-2xl" style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}>
              <div className="relative mb-4">
                <div className="w-16 h-16 mx-auto bg-gradient-to-br from-purple-400 to-indigo-500 rounded-full flex items-center justify-center animate-pulse">
                  <Star className="w-8 h-8 text-white" />
                </div>
                <div className="absolute -top-2 -right-2 w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center">
                  <div className="w-3 h-3 bg-white rounded-full animate-bounce"></div>
                </div>
              </div>
              <h3 className="font-semibold text-lg mb-2">Stargazing Guide</h3>
              <p className="text-sm text-gray-600">Preparing celestial insights and sky conditions</p>
              <div className="mt-3 flex justify-center">
                <div className="w-2 h-2 bg-purple-500 rounded-full animate-ping"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Park of Day Skeleton */}
          <div className="col-span-1 md:col-span-2 lg:col-span-2">
            <div className="rounded-2xl p-6" style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-gradient-to-br from-green-400 to-blue-500 rounded-full flex items-center justify-center animate-spin">
                  <Mountain className="w-5 h-5 text-white" />
                </div>
                <div className="h-6 bg-gray-200 rounded-lg w-48 animate-pulse"></div>
              </div>
              <div className="h-48 bg-gradient-to-r from-gray-200 to-gray-300 rounded-xl mb-4 animate-pulse relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent animate-shimmer"></div>
              </div>
              <div className="space-y-3">
                <div className="h-6 bg-gray-200 rounded-lg w-3/4 animate-pulse"></div>
                <div className="h-4 bg-gray-200 rounded-lg w-full animate-pulse"></div>
                <div className="h-4 bg-gray-200 rounded-lg w-5/6 animate-pulse"></div>
              </div>
              <div className="flex gap-3 mt-6">
                <div className="h-10 bg-gray-200 rounded-full w-24 animate-pulse"></div>
                <div className="h-10 bg-gray-200 rounded-full w-20 animate-pulse"></div>
              </div>
            </div>
          </div>
          
          {/* Weather Card Skeleton */}
          <div className="col-span-1">
            <div className="rounded-2xl p-6 h-64" style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center animate-pulse">
                  <Sun className="w-5 h-5 text-white" />
                </div>
                <div className="h-6 bg-gray-200 rounded-lg w-24 animate-pulse"></div>
              </div>
              <div className="space-y-3">
                <div className="h-8 bg-gray-200 rounded-lg w-16 animate-pulse"></div>
                <div className="h-4 bg-gray-200 rounded-lg w-full animate-pulse"></div>
                <div className="h-4 bg-gray-200 rounded-lg w-3/4 animate-pulse"></div>
                <div className="h-4 bg-gray-200 rounded-lg w-1/2 animate-pulse"></div>
              </div>
            </div>
          </div>

          {/* Stargazing Card Skeleton */}
          <div className="col-span-1">
            <div className="rounded-2xl p-6 h-64" style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-gradient-to-br from-purple-400 to-indigo-500 rounded-full flex items-center justify-center animate-pulse">
                  <Star className="w-5 h-5 text-white" />
                </div>
                <div className="h-6 bg-gray-200 rounded-lg w-32 animate-pulse"></div>
              </div>
              <div className="space-y-3">
                <div className="h-4 bg-gray-200 rounded-lg w-full animate-pulse"></div>
                <div className="h-4 bg-gray-200 rounded-lg w-5/6 animate-pulse"></div>
                <div className="h-4 bg-gray-200 rounded-lg w-3/4 animate-pulse"></div>
                <div className="h-4 bg-gray-200 rounded-lg w-2/3 animate-pulse"></div>
              </div>
            </div>
          </div>

          {/* Nature Fact Skeleton */}
          <div className="col-span-1">
            <div className="rounded-2xl p-6 h-64" style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full flex items-center justify-center animate-pulse">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div className="h-6 bg-gray-200 rounded-lg w-28 animate-pulse"></div>
              </div>
              <div className="space-y-3">
                <div className="h-4 bg-gray-200 rounded-lg w-full animate-pulse"></div>
                <div className="h-4 bg-gray-200 rounded-lg w-5/6 animate-pulse"></div>
                <div className="h-4 bg-gray-200 rounded-lg w-4/5 animate-pulse"></div>
                <div className="h-4 bg-gray-200 rounded-lg w-3/4 animate-pulse"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="max-w-2xl mx-auto mt-8">
          <div className="bg-gray-200 rounded-full h-3 overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-500 ease-out" 
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <p className="text-center text-sm text-gray-600 mt-2">
            {progress < 100 ? `${progress}% Complete` : 'Almost ready! Finalizing your adventure...'}
          </p>
        </div>
      </div>

      <style jsx>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
      `}</style>
    </div>
  );
};

export default DailyFeedLoader;
