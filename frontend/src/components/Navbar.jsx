import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useReadContract } from 'wagmi';
import {
  Briefcase, Download, LayoutDashboard, Menu, PackageCheck,
  PlusCircle, Shield, User, Users, X, Zap,
} from 'lucide-react';
import { CREDIT_MANAGER_ABI, getContractAddress } from '../contracts.js';
import CreditsModal from './CreditsModal.jsx';
import { useMode } from '../context/useMode.js';

export default function Navbar() {
  const location = useLocation();
  const { address, isConnected } = useAccount();
  const [showCreditsModal, setShowCreditsModal] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { mode, isClientMode, toggleMode } = useMode();

  const isActive = (path) =>
    location.pathname === path || location.pathname.startsWith(path + '/');
  const isLanding = location.pathname === '/';

  // Role-specific nav tabs
  const navItems = isClientMode
    ? [
        { to: '/post-job',     label: 'Post Job',         icon: PlusCircle    },
        { to: '/my-jobs',      label: 'My Jobs',          icon: LayoutDashboard },
        { to: '/review-bids',  label: 'Review Bids',      icon: Users         },
        { to: '/my-vaults',    label: 'Escrow Vaults',    icon: Shield        },
        { to: '/downloads',    label: 'Downloads',        icon: Download      },
      ]
    : [
        { to: '/browse-jobs',  label: 'Browse Jobs',      icon: Briefcase     },
        { to: '/my-bids',      label: 'My Bids',          icon: Users         },
        { to: '/my-vaults',    label: 'Escrow Vaults',    icon: Shield        },
        { to: '/delivery',     label: 'Delivery Upload',  icon: PackageCheck  },
        { to: '/downloads',    label: 'Downloads',        icon: Download      },
      ];

  // Real on-chain credit balance — polled every 8 s
  const { data: balance } = useReadContract({
    address: getContractAddress('CreditManager'),
    abi: CREDIT_MANAGER_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      refetchInterval: 8000,
      staleTime: 0,
    },
  });

  const displayBalance = balance !== undefined ? Number(balance) : '…';

  const closeDrawer = () => setDrawerOpen(false);

  if (isLanding) return null;

  return (
    <>
      <nav className="navbar" aria-label="Main navigation">
        {/* Logo */}
        <Link
          to={isConnected ? '/dashboard' : '/'}
          className="nav-logo"
          aria-label="EscrowMind home"
        >
          <Shield size={20} className="nav-logo-icon" aria-hidden="true" />
          <span className="nav-logo-text">EscrowMind</span>
        </Link>

        {/* Desktop tabs */}
        {!isLanding && isConnected && (
          <div className="nav-tabs" role="tablist">
            {navItems.map(({ to, label, icon: Icon }) => (
              <Link
                key={`${mode}-${to}`}
                to={to}
                role="tab"
                aria-selected={isActive(to)}
                className={`nav-tab ${isActive(to) ? 'active' : ''}`}
              >
                <Icon size={14} aria-hidden="true" />
                {label}
              </Link>
            ))}
            {address && (
              <Link
                to={`/profile/${address}`}
                role="tab"
                aria-selected={isActive('/profile')}
                className={`nav-tab ${isActive('/profile') ? 'active' : ''}`}
              >
                <User size={14} aria-hidden="true" />
                Profile
              </Link>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="nav-actions" style={{ marginLeft: (!isLanding && isConnected) ? undefined : 'auto' }}>
          {/* Mode segmented control */}
          {!isLanding && isConnected && (
            <div
              className="mode-segmented"
              role="group"
              aria-label="Switch role mode"
            >
              <button
                type="button"
                className={`mode-seg-btn ${isClientMode ? 'active' : ''}`}
                onClick={() => !isClientMode && toggleMode()}
                aria-pressed={isClientMode}
              >
                Client
              </button>
              <button
                type="button"
                className={`mode-seg-btn ${!isClientMode ? 'active' : ''}`}
                onClick={() => isClientMode && toggleMode()}
                aria-pressed={!isClientMode}
              >
                Freelancer
              </button>
            </div>
          )}

          {/* Credits pill */}
          {isConnected && (
            <button
              type="button"
              className="credits-pill"
              onClick={() => setShowCreditsModal(true)}
              aria-label={`Credits balance: ${displayBalance}`}
            >
              <Zap size={13} aria-hidden="true" />
              {displayBalance}
            </button>
          )}

          {/* Wallet connect button */}
          <ConnectButton chainStatus="icon" showBalance={false} />

          {/* Mobile drawer toggle */}
          {!isLanding && isConnected && (
            <button
              type="button"
              className="mobile-nav-toggle"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={drawerOpen}
            >
              <Menu size={18} />
            </button>
          )}
        </div>
      </nav>

      {/* Mobile slide-in drawer */}
      {!isLanding && isConnected && (
        <div
          className={`mobile-drawer ${drawerOpen ? 'open' : ''}`}
          aria-hidden={!drawerOpen}
        >
          <div
            className="mobile-drawer-backdrop"
            onClick={closeDrawer}
            aria-hidden="true"
          />
          <div className="mobile-drawer-panel" role="dialog" aria-label="Navigation menu">
            <div className="flex items-center justify-between mb-4">
              <span className="nav-logo">
                <Shield size={18} className="nav-logo-icon" />
                EscrowMind
              </span>
              <button
                type="button"
                className="modal-close"
                onClick={closeDrawer}
                aria-label="Close navigation menu"
              >
                <X size={18} />
              </button>
            </div>

            {navItems.map(({ to, label, icon: Icon }) => (
              <Link
                key={`drawer-${to}`}
                to={to}
                onClick={closeDrawer}
                className={`mobile-drawer-tab ${isActive(to) ? 'active' : ''}`}
              >
                <Icon size={16} aria-hidden="true" />
                {label}
              </Link>
            ))}
            {address && (
              <Link
                to={`/profile/${address}`}
                onClick={closeDrawer}
                className={`mobile-drawer-tab ${isActive('/profile') ? 'active' : ''}`}
              >
                <User size={16} aria-hidden="true" />
                Profile
              </Link>
            )}

            {/* Mobile Mode Switch */}
            <div className="mobile-drawer-mode" style={{ borderTop: '1px solid var(--border-muted)', marginTop: '1.5rem', paddingTop: '1.25rem' }}>
              <span className="text-secondary text-xs uppercase font-semibold tracking-wider block mb-3" style={{ opacity: 0.65, fontSize: '0.75rem' }}>Role Mode</span>
              <div className="mode-segmented w-full flex" style={{ display: 'flex', width: '100%' }}>
                <button
                  type="button"
                  className={`mode-seg-btn flex-grow justify-center ${isClientMode ? 'active' : ''}`}
                  onClick={() => { !isClientMode && toggleMode(); closeDrawer(); }}
                  style={{ flex: 1, display: 'inline-flex', justifyContent: 'center' }}
                >
                  Client
                </button>
                <button
                  type="button"
                  className={`mode-seg-btn flex-grow justify-center ${!isClientMode ? 'active' : ''}`}
                  onClick={() => { isClientMode && toggleMode(); closeDrawer(); }}
                  style={{ flex: 1, display: 'inline-flex', justifyContent: 'center' }}
                >
                  Freelancer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Credits modal */}
      {showCreditsModal && (
        <CreditsModal onClose={() => setShowCreditsModal(false)} />
      )}
    </>
  );
}
