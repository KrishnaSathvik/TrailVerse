export default function LegalSections({ sections }) {
  return (
    <div className="info-legal-content py-8">
      <div className="min-w-0">
        {sections.map((section, index) => (
          <section key={section.id} id={section.id} className="scroll-mt-24 border-t border-[var(--border)] py-8 first:pt-5">
            <h2 className="mb-5 text-xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-2xl">{index + 1}. {section.title}</h2>
            <div className="break-words text-base leading-7 text-[var(--text-secondary)]">{section.content}</div>
          </section>
        ))}
      </div>
    </div>
  );
}
