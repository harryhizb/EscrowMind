import { formatEther } from 'viem';

/**
 * AmountDisplay — renders an AVAX amount in amber JetBrains Mono.
 *
 * Props:
 *   wei       - BigInt | string | number of wei
 *   decimals  - decimal places to show (default: 3)
 *   chip      - if true, wraps in an amber chip pill
 *   size      - 'sm' | 'md' | 'lg' (controls font size)
 *   className - extra class names
 */
export default function AmountDisplay({ wei, decimals = 3, chip = false, size = 'md', className = '' }) {
  if (wei === undefined || wei === null) return <span className="text-dim">—</span>;

  let formatted;
  try {
    const val = parseFloat(formatEther(BigInt(wei)));
    formatted = val.toFixed(decimals);
  } catch {
    formatted = '?';
  }

  const sizeMap = {
    sm: '0.85rem',
    md: '1rem',
    lg: '1.5rem',
  };

  const inner = (
    <span
      className={`font-mono font-600 text-amber ${className}`}
      style={{ fontSize: sizeMap[size] ?? sizeMap.md }}
    >
      {formatted}
      <span
        className="text-dim"
        style={{ fontSize: '0.7em', fontFamily: 'Inter, sans-serif', marginLeft: '4px', fontWeight: 400 }}
      >
        AVAX
      </span>
    </span>
  );

  if (chip) {
    return (
      <span
        className="chip chip-amber"
        style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}
      >
        {inner}
      </span>
    );
  }

  return inner;
}
