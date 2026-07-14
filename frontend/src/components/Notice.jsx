import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Info,
} from 'lucide-react';

const ICONS = {
  info:    Info,
  warning: AlertTriangle,
  success: CheckCircle,
  danger:  AlertCircle,
};

/**
 * Notice — unified info/warning/success/danger banner.
 *
 * Props:
 *   variant   - 'info' | 'warning' | 'success' | 'danger'
 *   label     - bold headline text (optional)
 *   children  - body content
 *   className - extra class names
 */
export default function Notice({ variant = 'info', label, children, className = '' }) {
  const Icon = ICONS[variant] ?? Info;
  return (
    <div className={`notice notice-${variant} ${className}`}>
      <Icon size={16} className="notice-icon" aria-hidden="true" />
      <div className="notice-content">
        {label && <span className="notice-label">{label}</span>}
        {children && <div className="notice-body">{children}</div>}
      </div>
    </div>
  );
}
