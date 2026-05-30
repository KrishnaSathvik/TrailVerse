import { getNpsSymbolForActivity } from '@/lib/discoverActivityNpsSymbols';

export function getActivityIconSrc(iconKey) {
  const symbol = getNpsSymbolForActivity(iconKey);
  return `/discover/activity-icons/${symbol}.svg`;
}

export function ActivityIcon({ iconKey, className = 'h-7 w-7', style }) {
  const src = getActivityIconSrc(iconKey);

  return (
    <img
      src={src}
      alt=""
      aria-hidden
      className={`shrink-0 object-contain dark:invert ${className}`}
      style={style}
      width={28}
      height={28}
      decoding="async"
    />
  );
}
