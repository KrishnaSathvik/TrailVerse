import Link from 'next/link';

function categoryHref(category) {
  return category.id === 'all' ? '/blog' : `/blog/category/${category.id}`;
}

export default function BlogCategoryNav({
  categories,
  activeId = null,
  sectionLabel = 'Browse by topic',
}) {
  if (!categories?.length) return null;

  return (
    <div>
      <p
        className="text-xs font-medium uppercase tracking-[0.2em] mb-3"
        style={{ color: 'var(--text-tertiary)' }}
      >
        {sectionLabel}
      </p>
      <div
        role="navigation"
        aria-label="Blog categories"
        className="public-selector lg:flex-wrap"
      >
        {categories.map((category) => {
          const isActive = category.id === activeId;
          const href = categoryHref(category);

          return (
            <Link
              key={category.id}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className="flex min-h-11 items-center justify-center whitespace-nowrap rounded-lg px-4 text-center text-sm font-medium leading-tight transition"
              style={{
                backgroundColor: isActive ? 'var(--text-primary)' : 'var(--surface-hover)',
                color: isActive ? 'var(--bg-primary)' : 'var(--text-secondary)',
                borderWidth: '1px',
                borderColor: isActive ? 'var(--text-primary)' : 'var(--border)',
              }}
            >
              <span className="px-1">
                {category.label}
                {typeof category.count === 'number' ? (
                  <span className={isActive ? 'opacity-80' : 'opacity-60'}> ({category.count})</span>
                ) : null}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
