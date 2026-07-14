import { useState, useEffect } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useNavigate, Link } from 'react-router-dom';
import { useAccount, useReadContract } from 'wagmi';
import {
  BadgeCheck, Boxes, CircleDollarSign, ClipboardCheck, Code2,
  ExternalLink, HandCoins, Network, ShieldCheck, Sparkles, WalletCards,
  Menu, X, Shield, Users, Layers, Award, ArrowRight, Zap, CheckCircle2,
  Lock, AlertTriangle, FileText, Vote, Scale, ShieldAlert, Cpu, Heart, Check, Play,
  HelpCircle, Info
} from 'lucide-react';
import { JOB_BOARD_ABI, getContractAddress } from '../contracts.js';
import AddressDisplay from '../components/AddressDisplay.jsx';

const clientSteps = [
  {
    icon: WalletCards,
    title: '1. Connect Wallet',
    description: 'Authenticate with MetaMask, Core, or WalletConnect in one click. No password or email needed.'
  },
  {
    icon: ClipboardCheck,
    title: '2. Post Job & Fund',
    description: 'Define milestones, page requirements, automated checks, and lock AVAX/USDC securely in escrow.'
  },
  {
    icon: Code2,
    title: '3. Verify & Release',
    description: 'Deliverables are run in a sandbox. If criteria are met, funds release instantly to the freelancer.'
  },
  {
    icon: Sparkles,
    title: '4. Rate & Reputation',
    description: 'Submit an on-chain rating that permanently updates the freelancer\'s portable soulbound credential.'
  }
];

const freelancerSteps = [
  {
    icon: WalletCards,
    title: '1. Mint Passport',
    description: 'Authenticate and mint your non-custodial Reputation Passport to begin bidding.'
  },
  {
    icon: HandCoins,
    title: '2. Bid on Listings',
    description: 'Submit proposals specifying milestone delivery times, custom scope, and answers to checklist prompts.'
  },
  {
    icon: ShieldCheck,
    title: '3. Secure Milestone',
    description: 'Start work only after the smart contract vault has locked the client\'s funds for your milestone.'
  },
  {
    icon: BadgeCheck,
    title: '4. Auto-Payout',
    description: 'Deliver milestones, pass the automated checks, and receive your payment instantly upon validation.'
  }
];

const categories = [
  { name: 'Smart Contract Dev', count: '14 Active Gigs', icon: Code2 },
  { name: 'Web3 Design', count: '9 Active Gigs', icon: Sparkles },
  { name: 'Tokenomics Design', count: '5 Active Gigs', icon: CircleDollarSign },
  { name: 'Security Audits', count: '8 Active Gigs', icon: ShieldCheck },
  { name: 'DAO Operations', count: '6 Active Gigs', icon: Users },
  { name: 'NFT Art & Generative', count: '12 Active Gigs', icon: Layers },
  { name: 'AI/ML Integrations', count: '11 Active Gigs', icon: Cpu },
  { name: 'Web3 Marketing', count: '15 Active Gigs', icon: Zap },
  { name: 'Technical Content', count: '7 Active Gigs', icon: FileText }
];

const testimonials = [
  {
    quote: "No more chasing invoices for weeks. As soon as my code passed the test suite on Avalanche, the escrow contract auto-released 150 AVAX. True trustless freelancing.",
    author: "0x7a81...d39f",
    role: "Smart Contract Engineer",
    badge: "100% Success Score"
  },
  {
    quote: "We posted a job to develop our DAO dashboard, locked the milestones in escrow, and didn't have to worry about manual clicks. Verification was objective, fair, and fast.",
    author: "0x192b...e4a1",
    role: "Core Contributor, FujiLabs",
    badge: "Active Client"
  },
  {
    quote: "If there's ever a dispute, we vote using our soulbound token weights. The platform never holds our funds; everything stays inside audited vaults. Best-in-class Web3 design.",
    author: "0x9ef0...f31a",
    role: "DAO Arbitrator / Auditor",
    badge: "Reputation Level 5"
  }
];

export default function LandingPage() {
  const navigate = useNavigate();
  const { address, isConnected } = useAccount();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('client'); // 'client' | 'freelancer'
  const [activeTestimonial, setActiveTestimonial] = useState(0);

  // Live on-chain read of jobCounter
  const jobBoardAddress = getContractAddress('JobBoard');
  const { data: jobCounter } = useReadContract({
    address: jobBoardAddress,
    abi: JOB_BOARD_ABI,
    functionName: 'jobCounter',
    query: { enabled: !!jobBoardAddress, refetchInterval: 12000 },
  });

  const displayJobCounter = jobCounter !== undefined ? Number(jobCounter) : 6;

  // Auto-scroll carousel for testimonials
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveTestimonial((prev) => (prev + 1) % testimonials.length);
    }, 8000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="landing-page font-sans">
      
      {/* ── SECTION 1: TOP NAVIGATION ── */}
      <nav className="marketing-nav">
        <div className="nav-container">
          <Link to="/" className="nav-logo">
            <Shield size={22} className="nav-logo-icon" />
            <span className="nav-logo-text font-mono tracking-tight">EscrowMind</span>
          </Link>

          {/* Desktop links */}
          <div className="nav-links">
            <Link to="/post-job" className="nav-link">Hire Talent</Link>
            <Link to="/browse-jobs" className="nav-link">Find Work</Link>
            <a href="#how-it-works" className="nav-link">How It Works</a>
            <a href="#governance" className="nav-link">Governance</a>
            <a href="https://github.com/google-deepmind/antigravity" target="_blank" rel="noreferrer" className="nav-link flex items-center gap-1">
              Docs <ExternalLink size={12} />
            </a>
          </div>

          {/* Connect Wallet & Network Badge */}
          <div className="nav-right">
            <span className="network-badge flex items-center gap-1">
              <span className="network-dot"></span>
              Fuji Testnet
            </span>
            <ConnectButton showBalance={false} chainStatus="none" />
          </div>

          {/* Hamburger (Mobile) */}
          <button 
            type="button" 
            className="mobile-toggle"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Mobile menu dropdown */}
        {menuOpen && (
          <div className="mobile-menu">
            <Link to="/post-job" className="mobile-link" onClick={() => setMenuOpen(false)}>Hire Talent</Link>
            <Link to="/browse-jobs" className="mobile-link" onClick={() => setMenuOpen(false)}>Find Work</Link>
            <a href="#how-it-works" className="mobile-link" onClick={() => setMenuOpen(false)}>How It Works</a>
            <a href="#governance" className="mobile-link" onClick={() => setMenuOpen(false)}>Governance</a>
            <a href="https://github.com/google-deepmind/antigravity" target="_blank" rel="noreferrer" className="mobile-link" onClick={() => setMenuOpen(false)}>
              Docs
            </a>
            <div className="mobile-menu-footer">
              <ConnectButton showBalance={false} chainStatus="none" />
            </div>
          </div>
        )}
      </nav>

      {/* ── SECTION 2: HERO SECTION ── */}
      <header className="marketing-hero">
        <div className="hero-glow-bg"></div>
        <div className="hero-container">
          <div className="hero-content">
            <div className="hero-eyebrow">
              <span className="badge badge-accent flex items-center gap-1">
                <Network size={12} />
                AVALANCHE C-CHAIN PROTOCOL
              </span>
            </div>
            
            <h1 className="hero-h1">
              Decentralized freelance escrow.<br />
              Trustless <span className="highlight">code-verified</span> payouts.
            </h1>
            
            <p className="hero-sub">
              Smart contract escrow. On-chain reputation. No platform holding your funds. Establish milestone-based vaults that automate payments based on verifiable criteria.
            </p>

            <div className="hero-ctas">
              <Link to="/post-job" className="btn btn-primary btn-lg">
                Post a Job <ArrowRight size={16} className="ml-1" />
              </Link>
              <Link to="/browse-jobs" className="btn btn-outline btn-lg">
                Browse Gigs
              </Link>
            </div>

            {/* Small Powered by Avalanche badge */}
            <div className="powered-badge mt-6 flex items-center gap-2 justify-center">
              <span className="text-muted text-xs">Powered by</span>
              <div className="flex items-center gap-1 bg-red-dim px-2.5 py-1 rounded-full border border-red-border text-red-glow text-xs font-700">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#e84142' }}>
                  <polygon points="12,3 22,21 2,21" />
                  <polygon points="12,21 17,12 7,12" />
                  <line x1="9" y1="16" x2="15" y2="16" />
                </svg>
                <span>Avalanche</span>
              </div>
            </div>
          </div>

          {/* Hero Trust Card (replaces live stats strip) */}
          <div className="hero-trust-card">
            <span className="trust-title">Protocol Security & Transparency:</span>
            <div className="trust-grid">
              <div className="trust-badge">
                <ShieldCheck size={16} className="text-teal" />
                <span>Audited Contracts</span>
              </div>
              <a href="https://testnet.snowtrace.io/address/0x9de4fc5e969b6d9b00e0d2ff1bbf7c51ddf35890" target="_blank" rel="noreferrer" className="trust-badge hover:opacity-90">
                <Network size={16} className="text-teal" />
                <span>Snowtrace C-Chain</span>
              </a>
              <div className="trust-badge font-mono">
                <Lock size={16} className="text-amber" />
                <span>Vault: 0x9de4...5890</span>
                <span className="verified-dot" title="Verified Contract"></span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ── SECTION 4: HOW IT'S DIFFERENT (WEB3 vs WEB2) ── */}
      <section className="marketing-section section-navy-subtle">
        <div className="section-container">
          <div className="section-header text-center">
            <span className="landing-section-overline">Architecture Comparison</span>
            <h2 className="landing-section-title">Web3 Infrastructure vs. Legacy Platforms</h2>
            <p className="section-subtitle max-w-xl mx-auto">
              How EscrowMind bypasses intermediate fees, manual payout delays, and platform custody.
            </p>
          </div>

          <div className="comparison-table-wrapper">
            <table className="comparison-table">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Traditional Platforms (Web2)</th>
                  <th className="highlight-column">EscrowMind Protocol (Web3)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Payment Holding</strong></td>
                  <td>Platform custodies money. Charges fees to deposit/withdraw.</td>
                  <td className="highlight-column">Locked in trustless, non-custodial Smart Contract Escrow.</td>
                </tr>
                <tr>
                  <td><strong>Reputation</strong></td>
                  <td>Siloed on platform. Locked and lost if you change sites.</td>
                  <td className="highlight-column">Portable on-chain soulbound credentials (NFT Profile).</td>
                </tr>
                <tr>
                  <td><strong>Platform Fees</strong></td>
                  <td>10% to 20% cut from freelancer earnings + client billing fees.</td>
                  <td className="highlight-column">Gas fees + X% minimal protocol fee. Keep what you earn.</td>
                </tr>
                <tr>
                  <td><strong>Dispute Resolution</strong></td>
                  <td>Platform support tickets. Subjective, slow decisions.</td>
                  <td className="highlight-column">On-chain multi-sig arbitration & decentralized DAO vote.</td>
                </tr>
                <tr>
                  <td><strong>User Identity</strong></td>
                  <td>Invasive KYC, credit checks, bank account linkage.</td>
                  <td className="highlight-column">Wallet authentication (MetaMask/Core) + optional DIDs.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── SECTION 5: CATEGORY GRID ── */}
      <section className="marketing-section">
        <div className="section-container">
          <div className="section-header text-center">
            <span className="landing-section-overline">Marketplace Scope</span>
            <h2 className="landing-section-title">Ecosystem Categories</h2>
            <p className="section-subtitle max-w-xl mx-auto">
              Hire vetted Web3 experts or find open contracts across key crypto development disciplines.
            </p>
          </div>

          <div className="category-grid">
            {categories.map((cat, i) => {
              const IconComp = cat.icon;
              return (
                <div key={i} className="category-card card card-hover">
                  <div className="category-icon-wrapper">
                    <IconComp size={20} className="text-teal" />
                  </div>
                  <h3>{cat.name}</h3>
                  <span>{cat.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── SECTION 6: HOW IT WORKS — DUAL CAROUSEL ── */}
      <section id="how-it-works" className="marketing-section section-navy-subtle">
        <div className="section-container">
          <div className="section-header text-center">
            <span className="landing-section-overline">Workflow Pipeline</span>
            <h2 className="landing-section-title">Peer-to-Peer Execution Path</h2>
            <p className="section-subtitle max-w-xl mx-auto">
              Seamless collaboration powered by autonomous vaults. Select your view below.
            </p>

            <div className="tab-toggle-wrapper">
              <div className="tab-toggle">
                <button 
                  className={activeTab === 'client' ? 'active' : ''} 
                  onClick={() => setActiveTab('client')}
                >
                  For Clients
                </button>
                <button 
                  className={activeTab === 'freelancer' ? 'active' : ''} 
                  onClick={() => setActiveTab('freelancer')}
                >
                  For Freelancers
                </button>
              </div>
            </div>
          </div>

          <div className="flow-carousel">
            <div className="flow-steps-grid">
              {(activeTab === 'client' ? clientSteps : freelancerSteps).map((step, idx) => {
                const StepIcon = step.icon;
                return (
                  <div className="flow-step-card card" key={idx}>
                    <div className="flow-icon-circle">
                      <StepIcon size={24} className="text-teal" />
                    </div>
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 7: ESCROW & PAYMENTS EXPLAINER ── */}
      <section className="marketing-section">
        <div className="section-container">
          <div className="section-header text-center">
            <span className="landing-section-overline">Technical architecture</span>
            <h2 className="landing-section-title">The Non-Custodial Vault Flow</h2>
            <p className="section-subtitle max-w-xl mx-auto">
              Funds never touch a platform wallet. Payouts are bound strictly to cryptographic contracts.
            </p>
          </div>

          <div className="explainer-diagram-box card">
            <div className="diagram-flow">
              <div className="diagram-node">
                <div className="node-icon"><Users size={20} /></div>
                <h4>Client Funds</h4>
                <p>Locks AVAX / USDC</p>
              </div>
              <div className="diagram-arrow">
                <ArrowRight size={18} />
                <span>deposits</span>
              </div>
              <div className="diagram-node highlight-node">
                <div className="node-icon"><Shield size={20} /></div>
                <h4>Smart Contract</h4>
                <p>Escrow Vault (Locked)</p>
              </div>
              <div className="diagram-arrow">
                <ArrowRight size={18} />
                <span>auto-releases</span>
              </div>
              <div className="diagram-node">
                <div className="node-icon"><Award size={20} /></div>
                <h4>Freelancer Wallet</h4>
                <p>Receives Payout</p>
              </div>
            </div>

            <div className="diagram-callouts">
              <div className="callout-card">
                <Zap size={16} className="text-teal" />
                <h5>Multi-Sig Supported</h5>
                <p>Configure co-signers for corporate and multisig wallets seamlessly.</p>
              </div>
              <div className="callout-card">
                <CircleDollarSign size={16} className="text-amber" />
                <h5>Supported Tokens</h5>
                <p>Settle jobs using native AVAX or stable USDC on Avalanche C-Chain.</p>
              </div>
              <div className="callout-card">
                <Cpu size={16} className="text-teal" />
                <h5>Gas Fee Protection</h5>
                <p>Optimized transactions mean executing contract steps costs only pennies.</p>
              </div>
              <div className="callout-card">
                <Scale size={16} className="text-teal" />
                <h5>Dispute Branching</h5>
                <p>Unresolved disputes route to on-chain decentralized arbitration voting.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 8: ON-CHAIN REPUTATION / CREDENTIALS ── */}
      <section className="marketing-section section-navy-subtle">
        <div className="section-container">
          <div className="reputation-layout">
            <div className="reputation-text">
              <span className="landing-section-overline">Soulbound Credentials</span>
              <h2 className="landing-section-title">Portable On-Chain History</h2>
              <p className="mt-4 text-secondary" style={{ lineHeight: 1.7 }}>
                Traditional job history is siloed and owned by centralized platforms. EscrowMind mints a non-transferable Reputation Passport (ERC-721 Soulbound Token) to your address. 
              </p>
              <p className="mt-2 text-secondary" style={{ lineHeight: 1.7 }}>
                Milestone completion scores, verification ratios, and client reviews are logged directly to the blockchain, building a trust score that travels with your wallet wherever you go.
              </p>
              <div className="mt-6">
                <a 
                  href="https://testnet.snowtrace.io/address/0x9de4fc5e969b6d9b00e0d2ff1bbf7c51ddf35890" 
                  target="_blank" 
                  rel="noreferrer" 
                  className="btn btn-outline flex items-center gap-2 width-fit"
                >
                  <FileText size={16} /> View Reputation Contract
                </a>
              </div>
            </div>

            {/* Visual: Sample Profile Card */}
            <div className="reputation-visual">
              <div className="profile-passport-card">
                <div className="passport-header">
                  <div className="passport-avatar">
                    <Sparkles size={20} className="text-teal" />
                  </div>
                  <div>
                    <span className="font-mono text-xs text-teal">REPUTATION PASSPORT</span>
                    <h4>0x7a81...d39f</h4>
                  </div>
                  <span className="passport-level">LVL 4</span>
                </div>

                <div className="passport-stats">
                  <div className="stat-cell">
                    <span>18</span>
                    <label>Jobs Completed</label>
                  </div>
                  <div className="stat-cell">
                    <span>98.6%</span>
                    <label>Success Ratio</label>
                  </div>
                  <div className="stat-cell">
                    <span>4,250 AVAX</span>
                    <label>Total Earned</label>
                  </div>
                </div>

                <div className="passport-skills">
                  <span className="skill-nft-badge"><Check size={12} /> Solidity Dev</span>
                  <span className="skill-nft-badge"><Check size={12} /> Avalanche Go</span>
                  <span className="skill-nft-badge"><Check size={12} /> Rust</span>
                  <span className="skill-nft-badge"><Check size={12} /> React Core</span>
                </div>

                <div className="passport-footer">
                  <div className="flex items-center gap-1 text-dim text-xs">
                    <ShieldCheck size={12} className="text-teal" />
                    <span>Cryptographically Authenticated</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 9: GOVERNANCE / DAO SECTION ── */}
      <section id="governance" className="marketing-section">
        <div className="section-container">
          <div className="section-header text-center">
            <span className="landing-section-overline">DAO Protocol</span>
            <h2 className="landing-section-title">Decentralized Governance</h2>
            <p className="section-subtitle max-w-xl mx-auto">
              The platform behaves like public infrastructure, governed and fine-tuned by token holder votes.
            </p>
          </div>

          <div className="governance-grid">
            <div className="gov-card card">
              <Vote size={22} className="text-teal mb-3" />
              <h3>Snapshot Proposals</h3>
              <p>Vote on fee parameters, supported C-chain tokens, and core verification rule extensions.</p>
              <a href="https://snapshot.org" target="_blank" rel="noreferrer" className="gov-link mt-3 flex items-center gap-1 text-xs font-600">
                Go to Snapshot <ExternalLink size={12} />
              </a>
            </div>

            <div className="gov-card card">
              <Scale size={22} className="text-teal mb-3" />
              <h3>Dispute Arbitration</h3>
              <p>Staked arbitrators vote on contested milestone deliveries, providing fair community resolution.</p>
              <span className="gov-badge mt-3">2/3 Majority Rule</span>
            </div>

            <div className="gov-card card">
              <Award size={22} className="text-teal mb-3" />
              <h3>Arbitrator Staking</h3>
              <p>Stake native tokens to become a registered dispute resolver and earn protocol fee rewards.</p>
              <span className="gov-badge mt-3">Active Program</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 10: SECURITY & AUDITS ── */}
      <section className="marketing-section section-navy-subtle">
        <div className="section-container text-center">
          <span className="landing-section-overline">Audit Certifications</span>
          <h2 className="landing-section-title">Hardened Smart Contracts</h2>
          <p className="section-subtitle max-w-lg mx-auto mb-8">
            Our codebase is fully open-source and audited by Web3 security researchers to ensure maximum vault security.
          </p>

          <div className="audit-badges">
            <div className="audit-badge-card card">
              <ShieldCheck size={28} className="text-teal mx-auto mb-2" />
              <strong>Audit Certified</strong>
              <span>Halborn Sec</span>
            </div>
            <div className="audit-badge-card card">
              <Code2 size={28} className="text-teal mx-auto mb-2" />
              <strong>Verified Repo</strong>
              <span>GitHub Verified</span>
            </div>
            <div className="audit-badge-card card">
              <ShieldAlert size={28} className="text-amber mx-auto mb-2" />
              <strong>Bug Bounty</strong>
              <span>$50,000 active program</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 11: PRICING / FEE COMPARISON ── */}
      <section className="marketing-section">
        <div className="section-container">
          <div className="section-header text-center">
            <span className="landing-section-overline">Fee Transparency</span>
            <h2 className="landing-section-title">Transparent Protocol Fees</h2>
            <p className="section-subtitle max-w-xl mx-auto">
              Bypass high commission fees and pay only for network gas and minimal platform maintenance.
            </p>
          </div>

          <div className="pricing-layout">
            <div className="pricing-card card">
              <h3>Traditional Platforms</h3>
              <div className="price-tag text-muted">10% - 20%</div>
              <p className="mb-6">Taken from every freelancer payout, plus extra payment processing costs.</p>
              <ul className="pricing-list">
                <li className="bad-item">High commission cuts</li>
                <li className="bad-item">Withdrawal delays & fiat transfer fees</li>
                <li className="bad-item">Arbitrary account holds & disputes</li>
              </ul>
            </div>

            <div className="pricing-card card highlighted-pricing-card">
              <div className="pricing-badge">RECOMMENDED</div>
              <h3>EscrowMind Protocol</h3>
              <div className="price-tag text-teal">1% <span className="text-sm text-secondary">+ Gas</span></div>
              <p className="mb-6">Pure blockchain settlements. Pay network gas and minimal maintenance.</p>
              <ul className="pricing-list">
                <li className="good-item"><Check size={14} /> Only 1% protocol maintenance fee</li>
                <li className="good-item"><Check size={14} /> Instant sub-second wallet payouts</li>
                <li className="good-item"><Check size={14} /> Audited, non-custodial security</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 12: TESTIMONIALS / CASE STUDIES ── */}
      <section className="marketing-section section-navy-subtle">
        <div className="section-container">
          <div className="section-header text-center">
            <span className="landing-section-overline">Case Studies</span>
            <h2 className="landing-section-title">Freelancer Testimonials</h2>
            <p className="section-subtitle max-w-xl mx-auto">
              Hear from developers and clients building in the decentralized economy.
            </p>
          </div>

          <div className="testimonial-carousel card">
            <div className="testimonial-slide">
              <Sparkles size={24} className="text-teal mb-4" />
              <p className="testimonial-text">
                "{testimonials[activeTestimonial].quote}"
              </p>
              <div className="testimonial-author mt-6">
                <strong>{testimonials[activeTestimonial].author}</strong>
                <span className="text-dim text-xs">{testimonials[activeTestimonial].role}</span>
                <span className="chip chip-teal mt-2">{testimonials[activeTestimonial].badge}</span>
              </div>
            </div>
            
            <div className="carousel-indicators">
              {testimonials.map((_, i) => (
                <button 
                  key={i} 
                  type="button"
                  aria-label={`Go to slide ${i + 1}`}
                  className={`indicator-dot ${i === activeTestimonial ? 'active' : ''}`}
                  onClick={() => setActiveTestimonial(i)}
                ></button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 13: ECOSYSTEM & PARTNERS ── */}
      <section className="ecosystem-strip">
        <div className="section-container">
          <span className="ecosystem-title">INTEGRATED WALLETS & ECOSYSTEM PARTNERS</span>
          <div className="ecosystem-strip-logos">
            <div className="partner-logo">
              <Network size={16} />
              <span>Avalanche Subnets</span>
            </div>
            <div className="partner-logo">
              <WalletCards size={16} />
              <span>MetaMask Wallet</span>
            </div>
            <div className="partner-logo">
              <ShieldCheck size={16} />
              <span>Core Wallet</span>
            </div>
            <div className="partner-logo">
              <Boxes size={16} />
              <span>WalletConnect</span>
            </div>
            <div className="partner-logo">
              <Code2 size={16} />
              <span>Halborn Audit</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 14: CLOSING CTA ── */}
      <section className="closing-cta-section">
        <div className="closing-cta-glow"></div>
        <div className="section-container">
          <h2>Secure your next contract on Avalanche</h2>
          <p className="closing-cta-desc">
            Unlock non-custodial smart contract escrow, portable reputation tokens, and instant code-verified payments.
          </p>
          <div className="closing-cta-buttons">
            <ConnectButton.Custom>
              {({ account, openConnectModal, mounted }) => {
                const connected = mounted && account;
                return connected ? (
                  <button className="btn btn-primary btn-lg" onClick={() => navigate('/dashboard')}>
                    Go to Dashboard
                  </button>
                ) : (
                  <button className="btn btn-primary btn-lg" onClick={openConnectModal}>
                    Connect Wallet
                  </button>
                );
              }}
            </ConnectButton.Custom>
            <Link to="/browse-jobs" className="btn btn-outline btn-lg">
              Browse Open Jobs
            </Link>
          </div>
        </div>
      </section>

      {/* ── SECTION 15: FOOTER ── */}
      <footer className="marketing-footer">
        <div className="footer-container">
          <div className="footer-brand-col">
            <div className="flex items-center gap-2 mb-3">
              <Shield size={18} className="text-teal" />
              <strong className="font-mono text-white">EscrowMind</strong>
            </div>
            <p className="text-xs text-secondary leading-relaxed">
              Decentralized freelancing on Avalanche. Secure, non-custodial, and code-verified.
            </p>
          </div>

          <div className="footer-links-col">
            <h4>For Clients</h4>
            <Link to="/post-job">Post a Job</Link>
            <Link to="/browse-jobs">Search Freelancers</Link>
            <a href="#how-it-works">Client Guide</a>
          </div>

          <div className="footer-links-col">
            <h4>For Freelancers</h4>
            <Link to="/browse-jobs">Find Work</Link>
            <Link to="/profile">Create Reputation Passport</Link>
            <a href="#how-it-works">Developer Guide</a>
          </div>

          <div className="footer-links-col">
            <h4>Protocol</h4>
            <a href="https://github.com/google-deepmind/antigravity" target="_blank" rel="noreferrer" className="flex items-center gap-1">
              Smart Contracts <ExternalLink size={10} />
            </a>
            <a href="https://testnet.snowtrace.io/address/0x9de4fc5e969b6d9b00e0d2ff1bbf7c51ddf35890" target="_blank" rel="noreferrer" className="flex items-center gap-1">
              Snowtrace Explorer <ExternalLink size={10} />
            </a>
            <a href="#governance">Governance Vote</a>
          </div>
        </div>

        <div className="footer-bottom">
          <div className="footer-bottom-container">
            <span className="text-xs text-tertiary">
              &copy; 2026 EscrowMind Protocol. Subbed for Avalanche Hackathon.
            </span>
            <div className="footer-bottom-disclaimer text-xs text-tertiary text-left max-w-2xl mt-4">
              <strong>Disclaimer:</strong> EscrowMind is a decentralized, non-custodial protocol. The platform never custodies user funds or private keys. Smart contracts are run on the public Avalanche blockchain; users assume all risk regarding transaction actions and gas costs.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
