import { getNpsSymbolForActivity } from '@/lib/discoverActivityNpsSymbols';
import { activityIconColor } from '@/lib/iconSemantics';

export function getActivityIconSrc(iconKey) {
  const symbol = getNpsSymbolForActivity(iconKey);
  return `/discover/activity-icons/${symbol}.svg`;
}

export function ActivityIcon({ iconKey, className = 'h-7 w-7', style }) {
  const src = getActivityIconSrc(iconKey);

  return (
    <span
      aria-hidden
      className={`activity-icon shrink-0 ${className}`}
      style={{
        backgroundColor: activityIconColor(iconKey),
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        maskMode: 'alpha',
        ...style,
      }}
    />
  );
}
