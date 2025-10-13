/**
 * Build animated pin for Google Maps AdvancedMarkerElement
 * @param {Object} options - Pin configuration
 * @param {string} options.color - Pin color ('green', 'blue', 'orange', 'red', 'gray')
 * @param {boolean} options.mini - Whether this is a mini pin (smaller)
 * @param {string} options.label - Tooltip label
 * @returns {HTMLElement} DOM element for pin
 */
export function buildPin({ color = 'gray', mini = false, label = '' } = {}) {
  const wrap = document.createElement('div');
  wrap.style.position = 'relative';

  const pin = document.createElement('div');
  pin.className = `tv-pin --${color}${mini ? ' --mini' : ''}`;
  if (label) {
    pin.title = label;
  }

  const pulse = document.createElement('div');
  pulse.className = 'tv-pulse';
  pin.appendChild(pulse);

  wrap.appendChild(pin);
  return wrap;
}

