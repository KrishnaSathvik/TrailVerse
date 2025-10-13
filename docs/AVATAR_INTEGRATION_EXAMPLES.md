# Avatar System Integration Examples 🎨

Quick copy-paste examples for integrating the improved avatar system.

---

## 🎯 Basic Integration (No Changes Needed!)

### Profile Page - Random Generation
```jsx
import { generateRandomAvatar } from '../utils/avatarGenerator';

// Current implementation (still works perfectly!)
const handleGenerateAvatar = () => {
  const seed = user?.email || user?.firstName || 'traveler';
  const randomAvatar = generateRandomAvatar(seed);
  
  setProfileData(prev => ({ 
    ...prev, 
    avatar: randomAvatar 
  }));
};
```

### Chat/Comments - Display Avatar
```jsx
import { getBestAvatar } from '../../utils/avatarGenerator';

// Get user's avatar or generate default
const userAvatar = user?.avatar || getBestAvatar(user, {}, 'travel');

<img 
  src={userAvatar} 
  alt="User avatar"
  className="w-10 h-10 rounded-full"
/>
```

---

## ✨ Enhanced Integration (Recommended!)

### Replace Simple Button with Visual Grid

**Before:**
```jsx
import AvatarSelector from './components/profile/AvatarSelector';

<div className="space-y-4">
  <img src={profileData.avatar} alt="Avatar" className="w-24 h-24 rounded-full" />
  
  <AvatarSelector
    user={user}
    userStats={userStats}
    onAvatarChange={(avatar) => {
      setProfileData(prev => ({ ...prev, avatar }));
    }}
  />
</div>
```

**After:**
```jsx
import EnhancedAvatarSelector from './components/profile/EnhancedAvatarSelector';

<div className="space-y-4">
  {/* Current avatar preview */}
  <div className="flex justify-center">
    <img 
      src={profileData.avatar} 
      alt="Avatar" 
      className="w-32 h-32 rounded-full border-4 border-purple-500"
    />
  </div>
  
  {/* Enhanced selector with grid */}
  <EnhancedAvatarSelector
    user={user}
    userStats={userStats}
    currentAvatar={profileData.avatar}
    onAvatarChange={(avatar) => {
      setProfileData(prev => ({ ...prev, avatar }));
    }}
  />
</div>
```

**Benefits:**
- ✅ Shows 8 options instead of 1
- ✅ User can visually choose
- ✅ Better UX
- ✅ Still has random button

---

## 🎨 Advanced Use Cases

### 1. Avatar Preview Modal

```jsx
import { useState } from 'react';
import { generateAvatarCollection, generateRandomAvatar } from '../utils/avatarGenerator';

const AvatarPreviewModal = ({ user, onSave, onClose }) => {
  const [selectedAvatar, setSelectedAvatar] = useState(null);
  const [options, setOptions] = useState([]);
  
  useEffect(() => {
    // Generate initial options
    const avatars = generateAvatarCollection(user?.email || 'user', 12);
    setOptions(avatars);
    setSelectedAvatar(avatars[0].url);
  }, []);
  
  const handleRefresh = () => {
    const avatars = generateAvatarCollection(user?.email || 'user', 12);
    setOptions(avatars);
  };
  
  const handleRandom = () => {
    const random = generateRandomAvatar(user?.email || 'user');
    setSelectedAvatar(random);
  };
  
  return (
    <div className="modal">
      {/* Selected avatar preview */}
      <div className="text-center mb-4">
        <img 
          src={selectedAvatar} 
          alt="Selected" 
          className="w-32 h-32 rounded-full mx-auto"
        />
      </div>
      
      {/* Avatar grid */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {options.map((avatar, i) => (
          <button
            key={i}
            onClick={() => setSelectedAvatar(avatar.url)}
            className={`
              rounded-lg overflow-hidden
              ${selectedAvatar === avatar.url ? 'ring-4 ring-purple-500' : ''}
            `}
          >
            <img src={avatar.url} alt={`Option ${i}`} />
          </button>
        ))}
      </div>
      
      {/* Actions */}
      <div className="flex gap-2">
        <button onClick={handleRefresh}>🔄 Refresh</button>
        <button onClick={handleRandom}>🎲 Random</button>
        <button onClick={() => onSave(selectedAvatar)}>💾 Save</button>
        <button onClick={onClose}>❌ Cancel</button>
      </div>
    </div>
  );
};
```

### 2. Avatar Type Selector

```jsx
import { getBestAvatar } from '../utils/avatarGenerator';

const AvatarTypeSelector = ({ user, onSelect }) => {
  const types = [
    { id: 'dicebear', label: '👤 Character', description: 'Fun character avatars' },
    { id: 'boring', label: '🎨 Geometric', description: 'Modern abstract designs' },
    { id: 'ui', label: '📝 Initials', description: 'Text-based avatar' },
  ];
  
  return (
    <div className="grid grid-cols-3 gap-4">
      {types.map(type => {
        const preview = getBestAvatar(user, {}, type.id);
        
        return (
          <button
            key={type.id}
            onClick={() => onSelect(preview)}
            className="p-4 rounded-lg border hover:border-purple-500"
          >
            <img src={preview} alt={type.label} className="w-20 h-20 mx-auto mb-2" />
            <div className="text-center">
              <div className="font-medium">{type.label}</div>
              <div className="text-xs text-gray-500">{type.description}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
};
```

### 3. Multi-Avatar Picker with Favorites

```jsx
import { useState } from 'react';
import { generateAvatarCollection } from '../utils/avatarGenerator';

const MultiAvatarPicker = ({ user, onSelect }) => {
  const [options, setOptions] = useState([]);
  const [favorites, setFavorites] = useState([]);
  
  useEffect(() => {
    refreshOptions();
  }, []);
  
  const refreshOptions = () => {
    const avatars = generateAvatarCollection(user?.email || 'user', 16);
    setOptions(avatars);
  };
  
  const toggleFavorite = (avatarUrl) => {
    if (favorites.includes(avatarUrl)) {
      setFavorites(favorites.filter(a => a !== avatarUrl));
    } else {
      setFavorites([...favorites, avatarUrl]);
    }
  };
  
  return (
    <div className="space-y-6">
      {/* Favorites Section */}
      {favorites.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3">⭐ Favorites ({favorites.length})</h3>
          <div className="grid grid-cols-4 gap-3">
            {favorites.map((avatar, i) => (
              <div key={i} className="relative">
                <img 
                  src={avatar} 
                  alt="Favorite"
                  className="w-full rounded-lg cursor-pointer hover:scale-105"
                  onClick={() => onSelect(avatar)}
                />
                <button
                  onClick={() => toggleFavorite(avatar)}
                  className="absolute top-1 right-1 text-yellow-500"
                >
                  ⭐
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* All Options */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold">All Options</h3>
          <button onClick={refreshOptions} className="text-sm">
            🔄 Refresh
          </button>
        </div>
        
        <div className="grid grid-cols-4 gap-3">
          {options.map((avatar, i) => (
            <div key={i} className="relative">
              <img 
                src={avatar.url} 
                alt={`Option ${i}`}
                className="w-full rounded-lg cursor-pointer hover:scale-105"
                onClick={() => onSelect(avatar.url)}
              />
              <button
                onClick={() => toggleFavorite(avatar.url)}
                className={`
                  absolute top-1 right-1
                  ${favorites.includes(avatar.url) ? 'text-yellow-500' : 'text-gray-300'}
                `}
              >
                {favorites.includes(avatar.url) ? '⭐' : '☆'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
```

### 4. Signup Flow Avatar Selection

```jsx
import { useState } from 'react';
import { generateAvatarCollection } from '../utils/avatarGenerator';

const SignupAvatarStep = ({ email, onContinue }) => {
  const [selectedAvatar, setSelectedAvatar] = useState(null);
  const [options, setOptions] = useState([]);
  
  useEffect(() => {
    const avatars = generateAvatarCollection(email || 'new-user', 6);
    setOptions(avatars);
    setSelectedAvatar(avatars[0].url); // Pre-select first one
  }, [email]);
  
  return (
    <div className="max-w-md mx-auto space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">Choose Your Avatar</h2>
        <p className="text-gray-600">Pick one to get started (you can change it later)</p>
      </div>
      
      {/* Selected preview */}
      <div className="flex justify-center">
        <img 
          src={selectedAvatar} 
          alt="Selected avatar"
          className="w-32 h-32 rounded-full border-4 border-purple-500"
        />
      </div>
      
      {/* Options grid */}
      <div className="grid grid-cols-3 gap-4">
        {options.map((avatar, i) => (
          <button
            key={i}
            onClick={() => setSelectedAvatar(avatar.url)}
            className={`
              rounded-lg overflow-hidden transition-all
              ${selectedAvatar === avatar.url 
                ? 'ring-4 ring-purple-500 scale-105' 
                : 'opacity-60 hover:opacity-100'
              }
            `}
          >
            <img src={avatar.url} alt={`Option ${i + 1}`} />
          </button>
        ))}
      </div>
      
      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={() => {
            const avatars = generateAvatarCollection(email || 'new-user', 6);
            setOptions(avatars);
          }}
          className="flex-1 py-2 px-4 rounded-lg border hover:bg-gray-50"
        >
          🔄 Show Different
        </button>
        
        <button
          onClick={() => onContinue(selectedAvatar)}
          className="flex-1 py-2 px-4 rounded-lg bg-purple-600 text-white hover:bg-purple-700"
        >
          Continue →
        </button>
      </div>
    </div>
  );
};
```

### 5. Quick Avatar Switcher (Dropdown)

```jsx
import { useState, useRef, useEffect } from 'react';
import { generateAvatarCollection } from '../utils/avatarGenerator';

const QuickAvatarSwitcher = ({ currentAvatar, user, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState([]);
  const dropdownRef = useRef(null);
  
  useEffect(() => {
    if (isOpen && options.length === 0) {
      const avatars = generateAvatarCollection(user?.email || 'user', 8);
      setOptions(avatars);
    }
  }, [isOpen]);
  
  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  return (
    <div className="relative" ref={dropdownRef}>
      {/* Current avatar - clickable */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative group"
      >
        <img 
          src={currentAvatar} 
          alt="Your avatar"
          className="w-10 h-10 rounded-full border-2 border-gray-200 hover:border-purple-500"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 group-hover:bg-opacity-30 rounded-full transition-all">
          <span className="text-white opacity-0 group-hover:opacity-100 text-xs">
            ✏️
          </span>
        </div>
      </button>
      
      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-12 right-0 bg-white rounded-lg shadow-xl p-4 z-50 w-64">
          <div className="text-sm font-medium mb-3">Change Avatar</div>
          
          <div className="grid grid-cols-4 gap-2 mb-3">
            {options.map((avatar, i) => (
              <button
                key={i}
                onClick={() => {
                  onChange(avatar.url);
                  setIsOpen(false);
                }}
                className={`
                  rounded-lg overflow-hidden hover:ring-2 hover:ring-purple-500
                  ${currentAvatar === avatar.url ? 'ring-2 ring-purple-500' : ''}
                `}
              >
                <img src={avatar.url} alt={`Option ${i + 1}`} />
              </button>
            ))}
          </div>
          
          <button
            onClick={() => {
              const avatars = generateAvatarCollection(user?.email || 'user', 8);
              setOptions(avatars);
            }}
            className="w-full py-2 px-3 text-sm rounded bg-gray-100 hover:bg-gray-200"
          >
            🔄 More Options
          </button>
        </div>
      )}
    </div>
  );
};
```

---

## 🧪 Testing Examples

### Test All Avatar Types
```jsx
import { 
  generateRandomAvatar,
  getBestAvatar,
  generateAvatarCollection 
} from '../utils/avatarGenerator';

const TestAvatars = () => {
  const testUser = {
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User'
  };
  
  // Test 1: Random avatars
  console.log('Random 1:', generateRandomAvatar('test1'));
  console.log('Random 2:', generateRandomAvatar('test2'));
  console.log('Random 3:', generateRandomAvatar('test3'));
  
  // Test 2: Different types
  console.log('Boring:', getBestAvatar(testUser, {}, 'boring'));
  console.log('DiceBear:', getBestAvatar(testUser, {}, 'dicebear'));
  console.log('UI Avatar:', getBestAvatar(testUser, {}, 'ui'));
  
  // Test 3: Collection
  const collection = generateAvatarCollection('test', 8);
  console.log('Collection:', collection);
  
  return <div>Check console for test results</div>;
};
```

### Visual Test Grid
```jsx
import { useState } from 'react';
import { generateRandomAvatar } from '../utils/avatarGenerator';

const AvatarTestGrid = () => {
  const [avatars, setAvatars] = useState([]);
  
  const generateMany = () => {
    const generated = Array.from({ length: 20 }, (_, i) => 
      generateRandomAvatar(`test-${i}-${Date.now()}`)
    );
    setAvatars(generated);
  };
  
  return (
    <div className="p-8">
      <button 
        onClick={generateMany}
        className="mb-4 px-6 py-2 bg-purple-600 text-white rounded-lg"
      >
        Generate 20 Random Avatars
      </button>
      
      <div className="grid grid-cols-5 gap-4">
        {avatars.map((avatar, i) => (
          <div key={i} className="space-y-2">
            <img src={avatar} alt={`Avatar ${i + 1}`} className="w-full rounded-lg" />
            <div className="text-xs text-center text-gray-500">#{i + 1}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
```

---

## 📱 Responsive Patterns

### Mobile-Optimized Grid
```jsx
<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
  {avatars.map((avatar, i) => (
    <button
      key={i}
      onClick={() => selectAvatar(avatar.url)}
      className="aspect-square rounded-lg overflow-hidden"
    >
      <img src={avatar.url} alt={`Avatar ${i + 1}`} className="w-full h-full" />
    </button>
  ))}
</div>
```

### Touch-Friendly Buttons
```jsx
<button
  onClick={handleGenerate}
  className="
    w-full sm:w-auto
    px-6 py-3
    text-base sm:text-sm
    rounded-lg
    active:scale-95
    touch-manipulation
  "
>
  🎲 Generate Avatar
</button>
```

---

## 🎨 Styling Tips

### Avatar with Status Badge
```jsx
<div className="relative inline-block">
  <img 
    src={avatar} 
    alt="Avatar"
    className="w-12 h-12 rounded-full"
  />
  <span className="absolute bottom-0 right-0 block h-3 w-3 rounded-full ring-2 ring-white bg-green-400" />
</div>
```

### Avatar with Border & Shadow
```jsx
<img 
  src={avatar}
  alt="Avatar"
  className="
    w-16 h-16 rounded-full
    border-4 border-white
    shadow-lg
    ring-2 ring-purple-500
  "
/>
```

### Hover Effects
```jsx
<img 
  src={avatar}
  alt="Avatar"
  className="
    w-20 h-20 rounded-full
    transition-all duration-300
    hover:scale-110
    hover:shadow-2xl
    hover:ring-4 hover:ring-purple-500
    cursor-pointer
  "
/>
```

---

## 💡 Best Practices

### 1. Always Provide Fallback
```jsx
const avatar = user?.avatar || getBestAvatar(user, {}, 'travel');
```

### 2. Use Unique Seeds
```jsx
// ✅ Good - unique per user
generateRandomAvatar(user.email)

// ❌ Bad - same for everyone
generateRandomAvatar('default')
```

### 3. Loading States
```jsx
const [isGenerating, setIsGenerating] = useState(false);

const generate = async () => {
  setIsGenerating(true);
  await new Promise(r => setTimeout(r, 500)); // UX delay
  const avatar = generateRandomAvatar(user.email);
  setAvatar(avatar);
  setIsGenerating(false);
};
```

### 4. Error Handling
```jsx
try {
  const avatar = generateRandomAvatar(user?.email);
  setAvatar(avatar);
} catch (error) {
  console.error('Avatar generation failed:', error);
  // Fallback to simple emoji
  setAvatar('🧗');
}
```

---

## 🎉 Summary

All examples are:
- ✅ Copy-paste ready
- ✅ Responsive by default
- ✅ Using improved system
- ✅ Production-ready
- ✅ Accessible

Pick the pattern that fits your use case and customize as needed!

