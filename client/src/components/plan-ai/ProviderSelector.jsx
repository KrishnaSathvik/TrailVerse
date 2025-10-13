import React, { useMemo, useCallback } from 'react';
import { Sparkles, Brain, Check, Info } from '@components/icons';

const ProviderSelector = ({ selectedProvider, onProviderChange, providers = [] }) => {
  const providerIcons = {
    claude: Sparkles,
    openai: Brain
  };

  const idxById = useMemo(() => {
    const map = new Map();
    providers.forEach((p, i) => map.set(p.id, i));
    return map;
  }, [providers]);

  const onKeyDown = useCallback((e) => {
    if (!providers.length) return;
    const currentIdx = idxById.get(selectedProvider) ?? 0;
    let nextIdx = currentIdx;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') nextIdx = (currentIdx + 1) % providers.length;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') nextIdx = (currentIdx - 1 + providers.length) % providers.length;
    if (nextIdx !== currentIdx) {
      e.preventDefault();
      const next = providers[nextIdx];
      if (next?.available) onProviderChange(next.id);
    }
  }, [providers, selectedProvider, idxById, onProviderChange]);

  if (!providers || providers.length === 0) return null;

  return (
    <div className="mb-6">
      <label
        className="block text-sm font-medium mb-3 uppercase tracking-wider"
        style={{ color: 'var(--text-secondary)' }}
      >
        AI Provider
      </label>

      <div
        role="radiogroup"
        aria-label="AI Provider"
        onKeyDown={onKeyDown}
        className="grid grid-cols-1 sm:grid-cols-2 gap-3"
      >
        {providers.map((provider) => {
          const Icon = providerIcons[provider.id] || Brain;
          const isSelected = selectedProvider === provider.id;
          const unavailable = provider.available === false;

          return (
            <button
              key={provider.id}
              role="radio"
              aria-checked={isSelected}
              aria-disabled={unavailable}
              onClick={() => {
                if (unavailable) return;
                onProviderChange(provider.id);
              }}
              disabled={unavailable}
              className={`relative p-4 rounded-xl text-left transition outline-none
                ${isSelected ? 'ring-2' : 'hover:bg-white/5'}
                ${unavailable ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}
                focus-visible:ring-2`}
              style={{
                backgroundColor: 'var(--surface)',
                borderWidth: '1px',
                borderColor: 'var(--border)',
                ...(isSelected && { 
                  ringColor: 'var(--accent-green)',
                  boxShadow: '0 0 0 2px var(--accent-green)'
                })
              }}
            >
              {isSelected && (
                <div className="absolute top-2 right-2">
                  <div 
                    className="h-6 w-6 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: 'var(--accent-green)' }}
                  >
                    <Check className="h-4 w-4 text-white" />
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3">
                <div
                  className={`h-12 w-12 rounded-xl flex items-center justify-center
                  ${provider.id === 'claude'
                    ? 'bg-gradient-to-br from-purple-500 to-pink-500'
                    : 'bg-gradient-to-br from-green-500 to-blue-500'}`}
                >
                  <Icon className="h-6 w-6 text-white" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {provider.name || provider.id}
                    </h4>
                    {provider.model && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full bg-white/10 truncate max-w-[12rem]"
                        style={{ color: 'var(--text-tertiary)' }}
                        title={provider.model}
                      >
                        {provider.model}
                      </span>
                    )}
                    {unavailable && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 inline-flex items-center gap-1"
                        title="Provider unavailable: missing API key or quota"
                      >
                        <Info className="h-3 w-3" /> unavailable
                      </span>
                    )}
                  </div>

                  <p className="text-xs line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                    {provider.description || 'Large language model provider'}
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
