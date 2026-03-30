/**
 * Static Map Fallback Component
 * Shows a static map image when interactive map fails to load
 */
export default function StaticMapFallback({ 
  center = { lat: 39.5, lng: -98.35 }, 
  marker, 
  reason 
}) {
  const markers = marker 
    ? `color:red|${marker.lat},${marker.lng}` 
    : undefined;
  
  const src = `/api/gmaps/static?center=${center.lat},${center.lng}&zoom=${marker ? 9 : 4}&w=1200&h=560${markers ? `&markers=${encodeURIComponent(markers)}` : ''}`;

  const getMessage = () => {
    if (reason === 'offline') {
      return 'You appear to be offline.';
    } else if (reason === 'quota') {
      return 'Map quota or key issue.';
    }
    return 'Map failed to load.';
  };

  return (
    <div className="relative">
      <img 
        src={src} 
        alt="Map preview" 
        className="w-full h-[560px] object-cover rounded-xl shadow" 
      />
      <div 
        className="absolute inset-x-4 bottom-4 rounded-xl p-4 shadow"
        style={{
          backgroundColor: 'var(--surface)',
          borderWidth: '1px',
          borderColor: 'var(--border)'
        }}
      >
        <div 
          className="text-sm font-medium mb-1"
          style={{ color: 'var(--text-primary)' }}
        >
          Interactive map unavailable
        </div>
        <div 
          className="text-xs mb-3"
          style={{ color: 'var(--text-secondary)' }}
        >
          {getMessage()} You can still open results in Google Maps below.
        </div>
        <div className="flex gap-2 flex-wrap">
          <a
            className="px-3 py-2 rounded-lg text-sm transition hover:opacity-90"
            style={{
              backgroundColor: 'var(--accent-green)',
              color: 'white'
            }}
            href="https://www.google.com/maps"
            target="_blank"
            rel="noreferrer"
          >
            Open Google Maps
          </a>
          {marker && (
            <a
              className="px-3 py-2 rounded-lg text-sm transition hover:opacity-90"
              style={{
                backgroundColor: 'var(--surface-hover)',
                color: 'var(--text-primary)'
              }}
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(marker.name || 'Selected')}&query_place_id=${marker.place_id || ''}`}
              target="_blank"
              rel="noreferrer"
            >
              Open Selected Place
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

