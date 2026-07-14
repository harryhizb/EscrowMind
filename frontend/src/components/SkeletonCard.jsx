/**
 * SkeletonCard — shimmer loading placeholder.
 *
 * Props:
 *   height    - CSS height string (default: '160px')
 *   lines     - number of text skeleton lines below the card
 *   className - extra class names
 */
export default function SkeletonCard({ height = '160px', lines = 2, className = '' }) {
  return (
    <div
      className={`card ${className}`}
      style={{ display: 'grid', gap: '12px', padding: '20px' }}
      aria-hidden="true"
    >
      <div className="skeleton" style={{ height }} />
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="skeleton skeleton-text"
          style={{ width: i === lines - 1 ? '60%' : '100%' }}
        />
      ))}
    </div>
  );
}
