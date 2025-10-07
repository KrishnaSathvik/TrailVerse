import React from 'react';

const CategoryFilter = ({ categories, selected, onSelect }) => {
  const defaultCategories = [
    { id: 'all', label: 'All', count: 0 },
    { id: 'trip-planning', label: 'Trip Planning', count: 0 },
    { id: 'park-guides', label: 'Park Guides', count: 0 },
    { id: 'wildlife', label: 'Wildlife', count: 0 },
    { id: 'photography', label: 'Photography', count: 0 },
    { id: 'hiking', label: 'Hiking', count: 0 },
    { id: 'camping', label: 'Camping', count: 0 },
    { id: 'news', label: 'News', count: 0 },
    { id: 'tips', label: 'Tips', count: 0 }
  ];

  const categoriesToShow = categories || defaultCategories;

  return (
    <div className="flex flex-wrap gap-2">
      {categoriesToShow.map((category) => (
        <button
          key={category.id}
          onClick={() => onSelect(category.id)}
          className={`px-6 py-3 rounded-xl font-semibold whitespace-nowrap transition ${
            selected === category.id
              ? 'ring-1'
              : 'ring-1 hover:bg-white/5'
          }`}
          style={
            selected === category.id
              ? {
                  backgroundColor: 'var(--accent-green)',
                  borderColor: 'var(--accent-green)',
                  color: 'white'
                }
              : {
                  backgroundColor: 'var(--surface)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-secondary)'
                }
          }
        >
          <span className="text-sm">{category.label}</span>
          {category.count !== undefined && (
            <span className="ml-2 text-xs opacity-75">({category.count})</span>
          )}
        </button>
      ))}
    </div>
  );
};

export default CategoryFilter;
