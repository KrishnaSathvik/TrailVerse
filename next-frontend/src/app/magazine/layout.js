export default function MagazineLayout({ children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
      {children}
    </div>
  );
}
