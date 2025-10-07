import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const Accordion = ({ items, defaultOpen = null, allowMultiple = false }) => {
  const [openItems, setOpenItems] = useState(
    defaultOpen !== null ? (Array.isArray(defaultOpen) ? defaultOpen : [defaultOpen]) : []
  );

  const toggleItem = (index) => {
    if (allowMultiple) {
      setOpenItems(prev =>
        prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
      );
    } else {
      setOpenItems(prev => prev.includes(index) ? [] : [index]);
    }
  };

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div
          key={index}
          className="rounded-xl overflow-hidden backdrop-blur"
          style={{
            backgroundColor: 'var(--surface)',
            borderWidth: '1px',
            borderColor: 'var(--border)'
          }}
        >
          <button
            onClick={() => toggleItem(index)}
            className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition"
          >
            <span className="font-semibold text-left"
              style={{ color: 'var(--text-primary)' }}
            >
              {item.title}
            </span>
            <ChevronDown
              className={`h-5 w-5 transition-transform duration-300 ${
                openItems.includes(index) ? 'rotate-180' : ''
              }`}
              style={{ color: 'var(--text-secondary)' }}
            />
          </button>
          
          <div
            className={`overflow-hidden transition-all duration-300 ${
              openItems.includes(index) ? 'max-h-[500px]' : 'max-h-0'
            }`}
          >
            <div className="p-4 pt-0 text-sm"
              style={{ color: 'var(--text-secondary)' }}
            >
              {item.content}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default Accordion;
