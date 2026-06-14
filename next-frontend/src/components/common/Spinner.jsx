import DotSpinner from './DotSpinner';

/** Inline spinner — use inside buttons, inputs, and compact rows. */
export default function Spinner({ size = 16, className = '', label = 'Loading' }) {
  return <DotSpinner size={size} className={className} label={label} />;
}
