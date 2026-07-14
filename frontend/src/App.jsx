import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAccount } from 'wagmi';
import Navbar from './components/Navbar.jsx';
import LandingPage from './pages/LandingPage.jsx';
import Dashboard from './pages/Dashboard.jsx';
import PostJob from './pages/PostJob.jsx';
import BrowseJobs from './pages/BrowseJobs.jsx';
import MyJobs from './pages/MyJobs.jsx';
import MyBids from './pages/MyBids.jsx';
import ReviewBids from './pages/ReviewBids.jsx';
import ReviewBidsQueue from './pages/ReviewBidsQueue.jsx';
import MyVaults from './pages/MyVaults.jsx';
import DeliveryQueue from './pages/DeliveryQueue.jsx';
import EscrowView from './pages/EscrowView.jsx';
import ReputationProfile from './pages/ReputationProfile.jsx';
import Downloads from './pages/Downloads.jsx';
import JobDetail from './pages/JobDetail.jsx';
import ProposalPage from './pages/ProposalPage.jsx';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Wallet } from 'lucide-react';
import WrongNetworkGuard from './components/WrongNetworkGuard.jsx';
import { ModeProvider } from './context/ModeContext.jsx';

function ScrollBackgroundLogo() {
  const [scrollRatio, setScrollRatio] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = document.documentElement.clientHeight;
      const totalScrollable = scrollHeight - clientHeight;
      const ratio = totalScrollable > 0 ? window.scrollY / totalScrollable : 0;
      setScrollRatio(ratio);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div 
      className="global-bg-logo"
      style={{
        '--scroll-ratio': scrollRatio,
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
        <polygon points="12,3 22,21 2,21" />
        <polygon points="12,21 17,12 7,12" />
        <line x1="9" y1="16" x2="15" y2="16" />
      </svg>
    </div>
  );
}

function RequireWallet({ children }) {
  const { isConnected } = useAccount();

  if (isConnected) return children;

  return (
    <div className="page-wrapper fade-in" style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card text-center" style={{ maxWidth: 460, padding: '3rem', margin: '2rem auto' }}>
        <div style={{ display: 'inline-flex', padding: '1rem', background: 'rgba(14, 165, 165, 0.08)', borderRadius: '50%', color: 'var(--accent-primary)', marginBottom: '1.5rem' }}>
          <Wallet size={36} />
        </div>
        <h1 className="page-title mb-2">Connect Wallet</h1>
        <p className="text-secondary mb-6" style={{ lineHeight: 1.6 }}>
          You must connect your Web3 wallet to access this page. Please authenticate using the button below.
        </p>
        <div className="flex justify-center">
          <ConnectButton />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ModeProvider>
        <div className="app-container">
          <ScrollBackgroundLogo />
          <WrongNetworkGuard />
          <Navbar />
          <main className="main-content">
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/dashboard" element={<RequireWallet><Dashboard /></RequireWallet>} />
              <Route path="/browse-jobs" element={<RequireWallet><BrowseJobs /></RequireWallet>} />
              <Route path="/post-job" element={<RequireWallet><PostJob /></RequireWallet>} />
              <Route path="/my-jobs" element={<RequireWallet><MyJobs /></RequireWallet>} />
              <Route path="/my-jobs/:jobId/bids" element={<RequireWallet><ReviewBids /></RequireWallet>} />
              <Route path="/review-bids" element={<RequireWallet><ReviewBidsQueue /></RequireWallet>} />
              <Route path="/my-bids" element={<RequireWallet><MyBids /></RequireWallet>} />
              <Route path="/my-vaults" element={<RequireWallet><MyVaults /></RequireWallet>} />
              <Route path="/delivery" element={<RequireWallet><DeliveryQueue /></RequireWallet>} />
              <Route path="/downloads" element={<RequireWallet><Downloads /></RequireWallet>} />
              <Route path="/jobs/:jobId" element={<RequireWallet><JobDetail /></RequireWallet>} />
              <Route path="/jobs/:jobId/propose" element={<RequireWallet><ProposalPage /></RequireWallet>} />
              <Route path="/jobs/:jobId/bids" element={<RequireWallet><ReviewBids /></RequireWallet>} />
              <Route path="/review-bids/:jobId" element={<RequireWallet><ReviewBids /></RequireWallet>} />
              <Route path="/escrow/:vaultAddress" element={<RequireWallet><EscrowView /></RequireWallet>} />
              <Route path="/profile/:address" element={<RequireWallet><ReputationProfile /></RequireWallet>} />
              <Route path="/profile" element={<RequireWallet><ReputationProfile /></RequireWallet>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </ModeProvider>
    </BrowserRouter>
  );
}
