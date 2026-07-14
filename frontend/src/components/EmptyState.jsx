/**
 * EmptyState — standard empty-list component used wherever a list/grid has no data.
 *
 * Props:
 *   icon      - Lucide icon component
 *   title     - short heading
 *   message   - explanatory body text
 *   action    - optional { label, to, onClick } for a CTA button
 */
import { Link } from 'react-router-dom';

export default function EmptyState({ icon: Icon, title, message, action }) {
  return (
    <div className="empty-state">
      {Icon && (
        <div className="empty-state-icon">
          <Icon size={24} aria-hidden="true" />
        </div>
      )}
      {title && <p className="empty-state-title">{title}</p>}
      {message && <p className="empty-state-message">{message}</p>}
      {action && (
        action.to
          ? <Link to={action.to} className="btn btn-outline btn-sm mt-3">{action.label}</Link>
          : <button type="button" onClick={action.onClick} className="btn btn-outline btn-sm mt-3">{action.label}</button>
      )}
    </div>
  );
}
