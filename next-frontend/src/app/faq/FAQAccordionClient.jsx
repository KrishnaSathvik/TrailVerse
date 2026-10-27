"use client";

import React, { useState } from 'react';
import { ChevronDown, Sparkles, Mountain, Heart, Users, Shield } from '@components/icons';
import { logEvent } from '@/utils/analytics';
import { FAQ_CATEGORIES } from '@/data/faqContent';

const icons = { Sparkles, Mountain, Heart, Users, Shield };
const faqCategories = FAQ_CATEGORIES.map(category => ({ ...category, icon: icons[category.icon] }));

export default function FAQAccordionClient() {
  const [openFaqItems, setOpenFaqItems] = useState([]);

  const toggleFaqItem = (id) => {
    const isOpening = !openFaqItems.includes(id);
    if (isOpening) logEvent('FAQ', 'accordion_opened', id);
    setOpenFaqItems((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  return (
    <section className="info-section" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="public-content space-y-12">
        {faqCategories.map((category, categoryIndex) => (
          <div key={categoryIndex}>
            <div className="flex items-center gap-3 mb-6">
              <div className="info-icon">
                <category.icon className="h-5 w-5 text-current" />
              </div>
              <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                {category.category}
              </h2>
            </div>

            <div className="border-t border-[var(--border)]">
              {category.questions.map((item, questionIndex) => {
                const uniqueId = `${categoryIndex}-${questionIndex}`;
                const isOpen = openFaqItems.includes(uniqueId);

                return (
                  <div
                    key={uniqueId}
                    className="public-editorial-section"
                    style={{
                      borderColor: 'var(--border)'
                    }}
                  >
                    <button
                      onClick={() => toggleFaqItem(uniqueId)}
                      aria-expanded={isOpen}
                      aria-controls={`faq-answer-${uniqueId}`}
                      id={`faq-question-${uniqueId}`}
                      className="public-discovery-link w-full flex items-center justify-between py-5 transition text-left"
                    >
                      <span className="font-semibold text-lg pr-4" style={{ color: 'var(--text-primary)' }}>
                        {item.question}
                      </span>
                      <ChevronDown
                        className={`h-5 w-5 transition-transform duration-300 flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
                        style={{ color: 'var(--text-secondary)' }}
                      />
                    </button>

                    <div id={`faq-answer-${uniqueId}`} role="region" aria-labelledby={`faq-question-${uniqueId}`} hidden={!isOpen}>
                      <div className="public-content pb-6 pr-6 text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                        {item.answer}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
