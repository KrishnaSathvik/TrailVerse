import React from 'react';
import { Sparkles, Brain, Check } from 'lucide-react';

const ProviderSelector = ({ selectedProvider, onProviderChange, providers = [] }) => {
  if (providers.length === 0) {
    return null;
  }

  const providerIcons = {
    claude: Sparkles,
    openai: Brain
  };

  return (
    <div className="mb-6">
      <label className="block text-sm font-medium mb-3 uppercase tracking-wider"
        style={{ color: 'var(--text-secondary)' }}
      >
        AI Provider
      </label>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {providers.map((provider) => {
          const Icon = providerIcons[provider.id] || Brain;
          const isSelected = selectedProvider === provider.id;
          
          return (
            <button
              key={provider.id}
              onClick={() => onProviderChange(provider.id)}
              disabled={!provider.available}
              className={`relative p-4 rounded-xl text-left transition ${
                isSelected
                  ? 'ring-2 ring-purple-500'
                  : 'hover:bg-white/5'
              } ${!provider.available ? 'opacity-50 cursor-not-allowed' : ''}`}
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)'
              }}
            >
              {isSelected && (
                <div className="absolute top-2 right-2">
                  <div className="h-6 w-6 rounded-full bg-purple-500 flex items-center justify-center">
                    <Check className="h-4 w-4 text-white" />
                  </div>
                </div>
              )}
              
              <div className="flex items-start gap-3">
                <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${
                  provider.id === 'claude' ? 'bg-gradient-to-br from-purple-500 to-pink-500' : 'bg-gradient-to-br from-green-500 to-blue-500'
                }`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {provider.name}
                    </h4>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-white/10"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      {provider.model}
                    </span>
                  </div>
                  <p className="text-xs"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {provider.description}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ProviderSelector;
