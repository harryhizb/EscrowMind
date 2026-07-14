import {
  AlertTriangle,
  CheckCircle,
  CircleDollarSign,
  Clock,
  Eye,
  HelpCircle,
  PackageCheck,
  RotateCcw,
} from 'lucide-react';

/**
 * StatusBadge — maps on-chain MilestoneState uint8 to a styled badge.
 * Uses the design system semantic status colours (defined in index.css).
 * Used consistently across ALL pages — never re-defined per-page.
 *
 * State values:
 *   0 Pending | 1 Funded | 2 Delivered | 3 Needs Review | 4 Auto-Releasing
 *   5 Disputed | 6 Released | 7 Refunded
 */
const STATE_MAP = {
  0: { label: 'Pending',          cls: 'badge-pending',   Icon: Clock         },
  1: { label: 'Funded',           cls: 'badge-funded',    Icon: CircleDollarSign },
  2: { label: 'Delivered',        cls: 'badge-delivered', Icon: PackageCheck  },
  3: { label: 'Needs Review',     cls: 'badge-review',    Icon: Eye           },
  4: { label: 'Auto-Releasing…',  cls: 'badge-releasing pulse', Icon: Clock   },
  5: { label: 'Disputed',         cls: 'badge-disputed',  Icon: AlertTriangle },
  6: { label: 'Released',         cls: 'badge-released',  Icon: CheckCircle   },
  7: { label: 'Refunded',         cls: 'badge-refunded',  Icon: RotateCcw     },
};

export default function StatusBadge({ state }) {
  const s = STATE_MAP[Number(state)] ?? { label: 'Unknown', cls: 'badge-pending', Icon: HelpCircle };
  const { label, cls, Icon } = s;

  return (
    <span className={`badge ${cls}`} role="status" aria-label={label}>
      <Icon size={11} aria-hidden="true" />
      {label}
    </span>
  );
}
