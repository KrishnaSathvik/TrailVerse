function StarRating({ rating }) {
  const value = Math.min(5, Math.max(0, Number(rating) || 0));
  const stars = '★★★★★'.slice(0, value) + '☆☆☆☆☆'.slice(0, 5 - value);
  return (
    <div
      className="text-sm tracking-wide text-yellow-500"
      aria-label={`${value} out of 5 stars`}
    >
      {stars}
    </div>
  );
}

function TestimonialStaticCard({ testimonial }) {
  return (
    <article
      className="flex h-full flex-col border-t py-6"
      style={{
        borderColor: 'var(--border)',
      }}
    >
      <StarRating rating={testimonial.rating} />
      <blockquote
        className="mb-6 mt-4 flex-1 text-sm leading-relaxed"
        style={{ color: 'var(--text-secondary)' }}
      >
        &quot;{testimonial.content}&quot;
      </blockquote>
      <footer className="mt-auto">
        <cite className="not-italic">
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {testimonial.name}
          </span>
          {testimonial.role && testimonial.role !== 'Park Explorer' ? (
            <span className="block text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {testimonial.role}
            </span>
          ) : null}
        </cite>
        {testimonial.parkName ? (
          <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {testimonial.parkName}
          </p>
        ) : null}
      </footer>
    </article>
  );
}

/**
 * Crawler-visible testimonial grid (server-rendered).
 */
export default function TestimonialsServerList({ testimonials = [], error = false }) {
  if (!testimonials.length) {
    return (
      <section className="py-8" aria-labelledby="testimonials-empty">
        <div className="public-shell">
          <p
            id="testimonials-empty"
            className="text-center text-base"
            style={{ color: 'var(--text-secondary)' }}
          >
            {error ? 'Traveler stories are temporarily unavailable. Please try again later.' : 'No approved traveler stories have been published yet. Check back for stories from the community.'}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="py-8 sm:py-12" aria-labelledby="testimonials-list-heading">
      <div className="public-shell">
        <h2 id="testimonials-list-heading" className="sr-only">
          Published traveler reviews
        </h2>
        <ul className="grid list-none gap-8 p-0 md:grid-cols-2 lg:grid-cols-3">
          {testimonials.map((testimonial) => (
            <li key={testimonial._id}>
              <TestimonialStaticCard testimonial={testimonial} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
