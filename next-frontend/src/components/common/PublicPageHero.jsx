import IconGlyph from './IconGlyph';

/**
 * Standard top-of-page hero shared by header and footer pages:
 * bordered band, icon eyebrow, display title, intro, optional actions.
 */
export default function PublicPageHero({
  title,
  description,
  eyebrow,
  icon,
  iconColor = 'var(--icon-nature)',
  children,
}) {
  return (
    <section className="public-page-hero border-b py-5 sm:py-8" style={{ borderColor: 'var(--border)' }}>
      <div className="public-shell">
        <div className="public-content">
          {eyebrow && (
            <div className="public-eyebrow">
              {icon && <IconGlyph name={icon} className="h-4 w-4" style={{ color: iconColor }} />}
              <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                {eyebrow}
              </span>
            </div>
          )}
          <h1 className="public-page-title mb-4">{title}</h1>
          {description && <p className="public-page-intro">{description}</p>}
          {children && <div className="info-header-detail">{children}</div>}
        </div>
      </div>
    </section>
  );
}
