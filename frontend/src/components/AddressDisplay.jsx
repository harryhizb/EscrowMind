/**
 * AddressDisplay — renders a wallet address in JetBrains Mono with teal color.
 *
 * Props:
 *   address  - full wallet address string
 *   full     - if true, show full address; default: truncated (0x1234…abcd)
 *   label    - optional prefix label e.g. "Client:"
 *   className - extra class names
 */
export default function AddressDisplay({ address, full = false, label, className = '' }) {
  if (!address) return null;

  const display = full
    ? address
    : `${address.slice(0, 6)}…${address.slice(-4)}`;

  return (
    <span className={`flex items-center gap-2 ${className}`} style={{ flexWrap: 'wrap' }}>
      {label && (
        <span className="text-xs text-dim font-600" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </span>
      )}
      <span className="address font-mono text-teal" title={address}>
        {display}
      </span>
    </span>
  );
}
