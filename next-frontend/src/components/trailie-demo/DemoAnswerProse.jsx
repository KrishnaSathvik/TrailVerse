'use client';

import TrailieMarkdown from '@/components/trailie-response/TrailieMarkdown';

// Legacy demo call sites keep this name, but the rendering rules are now the
// exact shared Trailie Markdown rules used by live and restored responses.
export default function DemoAnswerProse({ text, className = '' }) {
  return <TrailieMarkdown text={text} className={className} />;
}
