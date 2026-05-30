import React from 'react';

/** Tailwind size pairs → pixel size (matches default spacing scale). */
const TAILWIND_ICON_PX = [
  ['h-12', 'w-12', 48],
  ['h-11', 'w-11', 44],
  ['h-10', 'w-10', 40],
  ['h-9', 'w-9', 36],
  ['h-8', 'w-8', 32],
  ['h-7', 'w-7', 28],
  ['h-6', 'w-6', 24],
  ['h-5', 'w-5', 20],
  ['h-4', 'w-4', 16],
  ['h-3.5', 'w-3.5', 16],
  ['h-3', 'w-3', 16],
];

const MIN_ICON_PX = 16;

/**
 * Infer display size from Tailwind h-/w- classes so Phosphor renders at native
 * resolution instead of scaling down from 1em (blurry on retina).
 */
export function inferIconPixelSize(className = '') {
  if (!className) return undefined;

  for (const [h, w, px] of TAILWIND_ICON_PX) {
    if (className.includes(h) && className.includes(w)) return px;
  }

  const hMatch = className.match(/\bh-(\d+(?:\.\d+)?)\b/);
  if (hMatch) {
    const n = Number(hMatch[1]);
    if (!Number.isNaN(n)) return Math.max(MIN_ICON_PX, Math.round(n * 4));
  }

  return undefined;
}

/** Drop h-/w-/size- utilities so only the Phosphor `size` prop sets dimensions (avoids rem vs px blur). */
export function stripIconSizeClasses(className = '') {
  return className
    .split(/\s+/)
    .filter(
      (token) =>
        token &&
        !/^h-/.test(token) &&
        !/^w-/.test(token) &&
        !/^size-/.test(token) &&
        !/^min-h-/.test(token) &&
        !/^min-w-/.test(token) &&
        !/^max-h-/.test(token) &&
        !/^max-w-/.test(token)
    )
    .join(' ');
}

/** Heavier strokes below 24px; larger icons stay regular unless overridden. */
export function resolveIconWeight(weight, pixelSize) {
  if (weight) return weight;
  if (pixelSize && pixelSize < 24) return 'bold';
  return 'regular';
}

export function createAppIcon(PhosphorIcon) {
  const AppIcon = React.forwardRef(function AppIcon(
    { size, className = '', weight, style, ...props },
    ref
  ) {
    const pixelSize = Math.max(
      MIN_ICON_PX,
      Math.round(Number(size ?? inferIconPixelSize(className) ?? 20))
    );
    const resolvedWeight = resolveIconWeight(weight, pixelSize);
    const layoutClassName = stripIconSizeClasses(className);

    return (
      <PhosphorIcon
        ref={ref}
        size={pixelSize}
        weight={resolvedWeight}
        className={layoutClassName}
        style={{
          width: pixelSize,
          height: pixelSize,
          minWidth: pixelSize,
          minHeight: pixelSize,
          flexShrink: 0,
          ...style,
        }}
        {...props}
      />
    );
  });

  AppIcon.displayName =
    PhosphorIcon.displayName || PhosphorIcon.name || 'AppIcon';

  return AppIcon;
}
