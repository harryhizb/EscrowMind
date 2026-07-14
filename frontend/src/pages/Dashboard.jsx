import { Link } from 'react-router-dom';
import { useAccount, useReadContract } from 'wagmi';
import {
  Briefcase, ChartNoAxesColumnIncreasing, LayoutDashboard,
  PlusCircle, Shield, Sparkles, Users, Zap
} from 'lucide-react';
import { CREDIT_MANAGER_ABI, JOB_BOARD_ABI, getContractAddress } from '../contracts.js';
import { useMode } from '../context/useMode.js';
import AddressDisplay from '../components/AddressDisplay.jsx';

export default function Dashboard() {
  const { address } = useAccount();
  const { isClientMode } = useMode();

  const { data: credits } = useReadContract({
    address: getContractAddress('CreditManager'),
    abi: CREDIT_MANAGER_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 8000 },
  });

  const { data: jobCounter } = useReadContract({
    address: getContractAddress('JobBoard'),
    abi: JOB_BOARD_ABI,
    functionName: 'jobCounter',
    query: { enabled: true, refetchInterval: 12000 },
  });

  const primaryLink = isClientMode
    ? { to: '/post-job', label: 'Post Job', icon: PlusCircle }
    : { to: '/browse-jobs', label: 'Browse Jobs', icon: Briefcase };
  const secondaryLink = isClientMode
    ? { to: '/my-jobs', label: 'My Posted Jobs', icon: LayoutDashboard }
    : { to: '/my-bids', label: 'My Bids', icon: Users };
  const PrimaryIcon = primaryLink.icon;
  const SecondaryIcon = secondaryLink.icon;

  return (
    <div className="dashboard-page page-wrapper">

      {/* Hero */}
      <header className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <span className="eyebrow">{isClientMode ? 'Client Mode' : 'Freelancer Mode'}</span>
          <h1 className="page-title">Welcome back to EscrowMind</h1>
          <p className="page-subtitle">
            Track credits, jobs, bids, and escrow vaults from one post-login home.
          </p>
        </div>

        {address && (
          <div className="dashboard-wallet-card">
            <span className="dashboard-wallet-label">Connected wallet</span>
            <div className="dashboard-wallet-address">
              <AddressDisplay address={address} />
            </div>
          </div>
        )}
      </header>

      {/* Stats */}
      <section className="stats-grid">
        <div className="card stat-card">
          <div className="stat-card-icon">
            <Zap size={20} />
          </div>
          <div className="stat-card-value">
            {credits !== undefined ? Number(credits) : '—'}
          </div>
          <div className="stat-card-label">Credit Balance</div>
        </div>

        <div className="card stat-card">
          <div className="stat-card-icon">
            <Briefcase size={20} />
          </div>
          <div className="stat-card-value">
            {jobCounter !== undefined ? Number(jobCounter) : '—'}
          </div>
          <div className="stat-card-label">Total Jobs</div>
        </div>

        <div className="card stat-card">
          <div className="stat-card-icon">
            <ChartNoAxesColumnIncreasing size={20} />
          </div>
          <div className="stat-card-value">On-chain</div>
          <div className="stat-card-label">Reputation</div>
        </div>

        <div className="card stat-card">
          <div className="stat-card-icon">
            <Shield size={20} />
          </div>
          <div className="stat-card-value">Live</div>
          <div className="stat-card-label">Escrow Vaults</div>
        </div>
      </section>

      {/* Quick actions */}
      <section className="quick-actions">
        <Link className="card card-hover quick-action primary" to={primaryLink.to}>
          <div className="quick-action-icon">
            <PrimaryIcon size={22} />
          </div>
          <div className="quick-action-body">
            <div className="quick-action-title">{primaryLink.label}</div>
            <div className="quick-action-desc">
              {isClientMode
                ? 'Create a structured job and lock in verification criteria.'
                : 'Find open jobs and submit a proposal.'}
            </div>
          </div>
        </Link>

        <Link className="card card-hover quick-action" to={secondaryLink.to}>
          <div className="quick-action-icon">
            <SecondaryIcon size={22} />
          </div>
          <div className="quick-action-body">
            <div className="quick-action-title">{secondaryLink.label}</div>
            <div className="quick-action-desc">
              {isClientMode
                ? 'Review your listings, bids, and client-side vaults.'
                : 'Track submitted proposals and freelancer-side vaults.'}
            </div>
          </div>
        </Link>

        <Link
          className="card card-hover quick-action"
          to={address ? `/profile/${address}` : '/profile'}
        >
          <div className="quick-action-icon">
            <Sparkles size={22} />
          </div>
          <div className="quick-action-body">
            <div className="quick-action-title">Reputation Profile</div>
            <div className="quick-action-desc">
              View portable work history and reputation signals.
            </div>
          </div>
        </Link>
      </section>

    </div>
  );
}
