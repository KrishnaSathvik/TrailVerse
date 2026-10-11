export default function InfoPageHeader({ title, description, children }) {
  return (
    <section className="info-width">
      <div className="info-introduction">
        <h1 className="public-page-title">{title}</h1>
        <p className="public-page-intro">{description}</p>
        {children && <div className="info-header-detail">{children}</div>}
      </div>
    </section>
  );
}

export function InfoSectionLabel({ children }) {
  return <p className="info-label">{children}</p>;
}
