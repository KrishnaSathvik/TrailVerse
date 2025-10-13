import React, { useState } from 'react';
import {
  generateRandomAvatar,
  generateAvatarCollection,
  getBestAvatar,
  getAvailableStyles,
  getAvailableThemes
} from '../../utils/avatarGenerator';

/**
 * Avatar Showcase - Demo component to preview all avatar options
 * Use this to test and showcase the new avatar system
 */
const AvatarShowcase = () => {
  const [randomAvatars, setRandomAvatars] = useState([]);
  const [selectedType, setSelectedType] = useState('random');
  const [isGenerating, setIsGenerating] = useState(false);

  const testUser = {
    email: 'test@trailverse.com',
    firstName: 'Trail',
    lastName: 'Explorer'
  };

  const generateShowcase = (type) => {
    setIsGenerating(true);
    setSelectedType(type);
    
    setTimeout(() => {
      let avatars = [];
      const seed = `showcase-${Date.now()}`;
      
      switch (type) {
        case 'random':
          // Generate 12 random avatars
          avatars = Array.from({ length: 12 }, (_, i) => ({
            url: generateRandomAvatar(`${seed}-${i}`),
            label: `Random ${i + 1}`
          }));
          break;
          
        case 'collection':
          // Use avatar collection
          const collection = generateAvatarCollection(seed, 12);
          avatars = collection.map((avatar, i) => ({
            url: avatar.url,
            label: `${avatar.type} - ${avatar.style}`
          }));
          break;
          
        case 'types':
          // Show different preference types
          const types = ['emoji', 'boring', 'travel', 'nature', 'adventure', 'dicebear'];
          avatars = types.map(type => ({
            url: getBestAvatar(testUser, {}, type),
            label: type.charAt(0).toUpperCase() + type.slice(1)
          }));
          break;
          
        case 'styles':
          // Show different DiceBear styles
          const styles = getAvailableStyles().slice(0, 12);
          avatars = styles.map(style => ({
            url: getBestAvatar(testUser, {}, 'dicebear'),
            label: style
          }));
          break;
          
        default:
          avatars = [];
      }
      
      setRandomAvatars(avatars);
      setIsGenerating(false);
    }, 500);
  };

  const availableThemes = getAvailableThemes();

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
          🎨 Avatar System Showcase
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Preview the improved avatar generation system
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 justify-center">
        <button
          onClick={() => generateShowcase('random')}
          disabled={isGenerating}
          className={`
            px-6 py-2.5 rounded-lg font-medium transition-all
            ${selectedType === 'random' ? 'ring-2 ring-purple-500' : ''}
          `}
          style={{
            backgroundColor: 'var(--accent)',
            color: 'white'
          }}
        >
          🎲 Random Mix
        </button>
        
        <button
          onClick={() => generateShowcase('collection')}
          disabled={isGenerating}
          className={`
            px-6 py-2.5 rounded-lg font-medium transition-all
            ${selectedType === 'collection' ? 'ring-2 ring-purple-500' : ''}
          `}
          style={{
            backgroundColor: 'var(--surface-hover)',
            color: 'var(--text-primary)',
            border: '2px solid var(--border)'
          }}
        >
          📦 Collection
        </button>
        
        <button
          onClick={() => generateShowcase('types')}
          disabled={isGenerating}
          className={`
            px-6 py-2.5 rounded-lg font-medium transition-all
            ${selectedType === 'types' ? 'ring-2 ring-purple-500' : ''}
          `}
          style={{
            backgroundColor: 'var(--surface-hover)',
            color: 'var(--text-primary)',
            border: '2px solid var(--border)'
          }}
        >
          🎯 Types
        </button>
        
        <button
          onClick={() => generateShowcase('styles')}
          disabled={isGenerating}
          className={`
            px-6 py-2.5 rounded-lg font-medium transition-all
            ${selectedType === 'styles' ? 'ring-2 ring-purple-500' : ''}
          `}
          style={{
            backgroundColor: 'var(--surface-hover)',
            color: 'var(--text-primary)',
            border: '2px solid var(--border)'
          }}
        >
          🎨 Styles
        </button>
      </div>

      {/* Avatar Grid */}
      {isGenerating ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
        </div>
      ) : randomAvatars.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {randomAvatars.map((avatar, index) => (
            <div
              key={index}
              className="flex flex-col items-center space-y-2 p-3 rounded-lg transition-all hover:scale-105"
              style={{
                backgroundColor: 'var(--surface)',
                border: '2px solid var(--border)'
              }}
            >
              <div
                className="w-full aspect-square rounded-lg overflow-hidden"
                style={{
                  backgroundColor: 'var(--surface-hover)'
                }}
              >
                <img
                  src={avatar.url}
                  alt={avatar.label}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
              <span
                className="text-xs font-medium text-center truncate w-full"
                style={{ color: 'var(--text-secondary)' }}
                title={avatar.label}
              >
                {avatar.label}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-20" style={{ color: 'var(--text-tertiary)' }}>
          <p className="text-lg mb-2">👆 Click a button above to generate avatars</p>
          <p className="text-sm">Choose from Random Mix, Collection, Types, or Styles</p>
        </div>
      )}

      {/* Info Cards */}
      <div className="grid md:grid-cols-3 gap-4 mt-8">
        {/* Styles Card */}
        <div
          className="p-4 rounded-lg"
          style={{
            backgroundColor: 'var(--surface)',
            border: '2px solid var(--border)'
          }}
        >
          <h3 className="font-semibold mb-2 flex items-center space-x-2">
            <span>🎨</span>
            <span style={{ color: 'var(--text-primary)' }}>Available Styles</span>
          </h3>
          <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
            DiceBear v9: {getAvailableStyles().length} styles
          </p>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Including avataaars, personas, lorelei, bottts, and more
          </p>
        </div>

        {/* Themes Card */}
        <div
          className="p-4 rounded-lg"
          style={{
            backgroundColor: 'var(--surface)',
            border: '2px solid var(--border)'
          }}
        >
          <h3 className="font-semibold mb-2 flex items-center space-x-2">
            <span>🌈</span>
            <span style={{ color: 'var(--text-primary)' }}>Color Palettes</span>
          </h3>
          <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
            {availableThemes.palettes.length} curated themes
          </p>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Ocean, Forest, Sunset, Mountain, and more
          </p>
        </div>

        {/* Variants Card */}
        <div
          className="p-4 rounded-lg"
          style={{
            backgroundColor: 'var(--surface)',
            border: '2px solid var(--border)'
          }}
        >
          <h3 className="font-semibold mb-2 flex items-center space-x-2">
            <span>✨</span>
            <span style={{ color: 'var(--text-primary)' }}>Boring Avatars</span>
          </h3>
          <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
            {availableThemes.boring.length} modern variants
          </p>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Marble, Beam, Pixel, Sunset, Ring, Bauhaus
          </p>
        </div>
      </div>

      {/* Footer Info */}
      <div
        className="text-center p-4 rounded-lg"
        style={{
          backgroundColor: 'var(--surface-hover)',
          border: '2px solid var(--border)'
        }}
      >
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          <strong>🎉 Upgraded from v7 to v9!</strong> Now with {getAvailableStyles().length} DiceBear styles,
          {' '}{availableThemes.boring.length} Boring Avatar variants, and {availableThemes.palettes.length} color palettes
          {' '}= <strong>Thousands of unique combinations</strong>
        </p>
      </div>
    </div>
  );
};

export default AvatarShowcase;

