# EscrowMind Setup & MetaMask Login Guide

## Table of Contents
1. [Environment Variables Setup](#environment-variables-setup)
2. [MetaMask Installation & Wallet Creation](#metamask-installation--wallet-creation)
3. [How MetaMask Login Works](#how-metamask-login-works)
4. [Testing the Complete Flow](#testing-the-complete-flow)
5. [Troubleshooting](#troubleshooting)

---

## Environment Variables Setup

### Step 1: Create Wallets for Testing

You'll need **5 different wallets** for complete testing:

```
1. DEPLOYER      - Deploys contracts (needs AVAX for gas)
2. RELAYER       - Backend service wallet (submits verification scores)
3. ARBITER_A     - Disputes resolution member 1
4. ARBITER_B     - Disputes resolution member 2
5. ARBITER_C     - Disputes resolution member 3
```

Plus: **CLIENT** and **FREELANCER** wallets for testing user flows (can use any account in MetaMask)

### Step 2: Setup MetaMask Locally

#### a) Install MetaMask
1. Go to https://metamask.io
2. Download extension for your browser
3. Create new wallet or import existing seed phrase

#### b) Add Avalanche Fuji Testnet Network

1. Open MetaMask
2. Click network dropdown (top left)
3. Click "Add network"
4. Fill in:
   ```
   Network Name: Avalanche Fuji C-Chain
   RPC URL: https://api.avax-test.network/ext/bc/C/rpc
   Chain ID: 43113
   Currency Symbol: AVAX
   Block Explorer: https://testnet.snowtrace.io/
   ```
5. Click "Save"

#### c) Get Testnet AVAX
1. Go to https://faucet.avax.network/
2. Select "Avalanche Fuji C-Chain"
3. Paste your wallet address
4. Get 2 AVAX (free, for testing)
5. Wait 30 seconds for confirmation

#### d) Export Private Keys from MetaMask

For each wallet you'll use:

1. Click wallet avatar (top right)
2. Settings → Account Details
3. Click "Export Private Key"
4. Enter password
5. Copy the private key (starts with `0x`)

**⚠️ SECURITY WARNING:** Never share private keys! Only use for testing on testnet.

### Step 3: Configure .env Files

#### Root .env (for Foundry deployments)
```bash
cp .env.example .env
```

Edit `.env`:
```env
FUJI_RPC_URL=https://api.avax-test.network/ext/bc/C/rpc
DEPLOYER_PRIVATE_KEY=0x... (from MetaMask export)
RELAYER_ADDRESS=0x... (from MetaMask)
RELAYER_PRIVATE_KEY=0x... (from MetaMask export)
ARBITER_A=0x...
ARBITER_B=0x...
ARBITER_C=0x...
```

#### Backend .env
```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:
```env
PORT=3001
NODE_ENV=development
FUJI_RPC_URL=https://api.avax-test.network/ext/bc/C/rpc
RELAYER_PRIVATE_KEY=0x... (same as root .env)
# Leave Pinata keys empty for local cache fallback
```

#### Frontend .env
Already configured! Just verify:
```env
VITE_BACKEND_URL=http://localhost:3001
VITE_CHAIN_ID=43113
# Other variables auto-configured
```

---

## MetaMask Installation & Wallet Creation

### Quick Start (3 minutes)

1. **Install MetaMask**
   ```
   Browser Extension → https://metamask.io → Add to Browser
   ```

2. **Create Wallet**
   - Click "Create a New Wallet"
   - Save 12-word seed phrase (IMPORTANT!)
   - Set password

3. **Add Avalanche Fuji Network**
   - MetaMask → Networks → Add Network
   - Use custom RPC endpoint above

4. **Get Testnet AVAX**
   - Faucet: https://faucet.avax.network/
   - Select "Avalanche Fuji C-Chain"
   - Paste your address
   - Get 2 AVAX (free)

### For Production (Mainnet)
- Use hardware wallet (Ledger, Trezor)
- Use only mainnet AVAX
- Never share private keys
- Enable all security features

---

## How MetaMask Login Works

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser (React App)                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐      ┌──────────────────┐             │
│  │  RainbowKit      │──────│  Wagmi Provider  │             │
│  │  (UI Component)  │      │  (Web3 Logic)    │             │
│  └──────────────────┘      └──────────────────┘             │
│           │                         │                       │
│           └─────────────┬───────────┘                       │
│                         │                                   │
│                ┌────────▼─────────┐                        │
│                │   MetaMask       │                        │
│                │   (In-Browser    │                        │
│                │   Wallet)        │                        │
│                └────────┬─────────┘                        │
│                         │                                   │
└─────────────────────────┼───────────────────────────────────┘
                          │
                          │ (User approves with private key)
                          │
┌─────────────────────────┼───────────────────────────────────┐
│                Avalanche Fuji Blockchain                    │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         Smart Contracts (on-chain state)             │   │
│  │  - JobBoard (jobs & bids)                            │   │
│  │  - EscrowVault (milestone escrow)                    │   │
│  │  - CreditManager (credit ledger)                     │   │
│  │  - ReputationSBT (soulbound tokens)                  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Step-by-Step Login Flow

#### 1. User Clicks "Connect Wallet" (RainbowKit Button)

```javascript
// Location: frontend/src/components/Navbar.jsx
import { ConnectButton } from '@rainbow-me/rainbowkit';

export default function Navbar() {
  return (
    <ConnectButton />  // ← This button opens MetaMask
  );
}
```

#### 2. MetaMask Popup Appears

```
┌─────────────────────────────────────────┐
│          MetaMask Notification          │
├─────────────────────────────────────────┤
│  EscrowMind would like to connect       │
│  your MetaMask wallet                   │
│                                         │
│  📊 Can view:                           │
│  - Your account address                 │
│  - Your balance                         │
│  - Activity                             │
│                                         │
│  [Cancel]          [Connect]            │
└─────────────────────────────────────────┘
```

#### 3. User Selects Account & Clicks "Connect"

**What happens internally:**

```javascript
// frontend/src/main.jsx - Wagmi Configuration
const config = getDefaultConfig({
  appName: 'EscrowMind',
  projectId: '4c84910a34b22c7a36cb988892f3922d',
  chains: [avalancheFuji],  // ← Fuji network
  ssr: false,
});

// RainbowKit + Wagmi now:
// 1. Stores connected account address
// 2. Creates RPC connection to Fuji network
// 3. Enables transaction signing
```

#### 4. User is Now Logged In

```javascript
// Any component can now access wallet data:
import { useAccount } from 'wagmi';

export default function MyComponent() {
  const { address, isConnected, chainId } = useAccount();
  
  if (isConnected) {
    return <div>Connected as {address}</div>;
  }
  return <div>Not connected</div>;
}
```

#### 5. User Performs Actions (Post Job, Submit Bid, etc.)

When user clicks "Post Job":

```javascript
// Example: frontend/src/pages/PostJob.jsx
const { writeContract, data: txHash, isPending } = useWriteContract();

const handlePostJob = () => {
  writeContract({
    address: getContractAddress('JobBoard'),
    abi: JOB_BOARD_ABI,
    functionName: 'postJob',
    args: [checklist, specsipfsHash, budgetMin, budgetMax, deadline],
  });
};
```

**What happens:**

```
1. Frontend calls writeContract()
   ↓
2. Wagmi prepares transaction
   ↓
3. MetaMask shows confirmation popup:
   ┌──────────────────────────────┐
   │  Confirm Transaction         │
   ├──────────────────────────────┤
   │  To: JobBoard (0x...)        │
   │  Function: postJob           │
   │  Gas: 0.002 AVAX             │
   │                              │
   │  [Reject]     [Approve]      │
   └──────────────────────────────┘
   ↓
4. User clicks "Approve"
   ↓
5. MetaMask signs transaction with private key
   ↓
6. Transaction sent to Fuji RPC node
   ↓
7. Smart contract executes on blockchain
   ↓
8. Wagmi detects completion
   ↓
9. UI shows success ✓
```

### Key Points

✓ **MetaMask holds the private key** - Only used for signing, never sent to server
✓ **No passwords** - Only MetaMask password + seed phrase
✓ **Automatic detection** - Wagmi auto-detects wallet connection/disconnection
✓ **Network switching** - User can switch networks in MetaMask, app responds
✓ **Multiple accounts** - User can switch between accounts, app updates

---

## Testing the Complete Flow

### Scenario: Client Posts Job, Freelancer Bids, Job Completes

#### Prerequisites
- ✓ Both wallets connected (different accounts)
- ✓ Both have 0.5+ AVAX
- ✓ Backend running (`npm run dev` in backend/)
- ✓ Frontend running (`npm run dev` in frontend/)
- ✓ Contracts deployed (`forge script ...`)

#### Test Steps

**As CLIENT (Wallet A):**

1. Open http://localhost:5173
2. Click "Connect Wallet" → Select Account A
3. Go to "Post Job"
4. Fill form:
   - Required pages: home, about, contact
   - Budget: 0.5 - 2.0 AVAX
   - Deadline: 14 days
   - Click "Post Job"
5. MetaMask popup → Approve → Wait for confirmation
6. ✓ Job posted! See it in "Browse Jobs"

**As FREELANCER (Wallet B):**

1. Open http://localhost:5173 (new tab/incognito)
2. Click "Connect Wallet" → Select Account B
3. Go to "Browse Jobs"
4. Find CLIENT's job
5. Click "Bid" → Enter 1.0 AVAX
6. MetaMask popup → Approve
7. ✓ Bid submitted!

**Back As CLIENT:**

1. Go to "My Jobs"
2. See freelancer's bid
3. Click "Accept Bid"
4. MetaMask popup → Approve
5. ✓ Bid accepted! Job funded.

**As FREELANCER:**

1. See "Your Escrow" or navigate to vault
2. Upload website delivery
3. Click "Submit Delivery"
4. MetaMask popup → Approve
5. ✓ Delivery submitted to backend verification

**Backend Verification Process:**

```bash
# Backend automatically:
# 1. Downloads ZIP from IPFS
# 2. Runs Puppeteer checks (responsive, forms, pages)
# 3. Calculates score
# 4. Calls markVerified() on EscrowVault
# 5. Score submitted with RELAYER_PRIVATE_KEY
```

**Auto-Release (if score ≥ 90):**

1. Client sees "Approved ✓"
2. Click "Release Funds"
3. MetaMask popup → Approve
4. ✓ Funds released to freelancer!
5. Reputation tokens minted
6. Credits earned

---

## Troubleshooting

### Issue: "MetaMask not detected"
**Solution:**
```
1. Install MetaMask extension
2. Refresh page (Ctrl+R)
3. Check extension is enabled
4. Check correct network selected (Fuji)
```

### Issue: "Wrong network. Please switch to Avalanche Fuji"
**Solution:**
```
1. Click MetaMask network dropdown
2. Select "Avalanche Fuji C-Chain"
3. If not listed, add it manually (see step above)
```

### Issue: "Insufficient balance"
**Solution:**
```
1. Go to https://faucet.avax.network/
2. Select Avalanche Fuji C-Chain
3. Paste wallet address
4. Get free 2 AVAX
5. Wait 30 seconds
6. Refresh frontend
```

### Issue: "Transaction failed" on post job
**Solution:**
```
1. Check you have ≥ 0.1 AVAX (for gas)
2. Credits spent? (need 2 credits for job post)
3. Claim starter credits first: Go to credits modal
4. Retry transaction
```

### Issue: Backend verification not working
**Solution:**
```bash
# Check backend logs
cd backend
npm run dev

# Should show:
# > nodemon app.js
# Backend running on port 3001
# ✓ Verification service ready

# Test endpoint:
curl http://localhost:3001/health
# Should return: {"status":"ok", "uptime":...}
```

### Issue: Contracts not deployed
**Solution:**
```bash
# Deploy to Fuji:
forge script script/Deploy.s.sol --rpc-url $FUJI_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY --broadcast

# Copy deployed addresses to:
# 1. deployments/fuji.json
# 2. frontend/.env (VITE_*_ADDRESS vars)
```

---

## Complete Startup Sequence

### Terminal 1: Backend
```bash
cd backend
npm install
npm run dev
# Wait for: Backend running on port 3001 ✓
```

### Terminal 2: Frontend
```bash
cd frontend
npm install
npm run dev
# Wait for: Local: http://localhost:5173/ ✓
```

### Terminal 3: Deploy Contracts (One-time)
```bash
# In root directory
forge script script/Deploy.s.sol \
  --rpc-url https://api.avax-test.network/ext/bc/C/rpc \
  --private-key 0x... \
  --broadcast

# Copy output addresses to:
# - deployments/fuji.json
# - frontend/.env
```

### Browser: Open App
```
1. Go to http://localhost:5173
2. MetaMask should auto-detect
3. Click "Connect Wallet"
4. Select account
5. ✓ Ready to use!
```

---

## Security Checklist

- [ ] Never commit .env files (added to .gitignore)
- [ ] Never share private keys
- [ ] Use testnet AVAX only (never mainnet for testing)
- [ ] Use different wallets for different roles
- [ ] Verify contract addresses before interacting
- [ ] Check gas prices before large transactions
- [ ] Use hardware wallet for production

---

## Next Steps

1. ✓ Set up .env files
2. ✓ Create/import wallets in MetaMask
3. ✓ Get testnet AVAX from faucet
4. ✓ Deploy contracts
5. ✓ Start backend
6. ✓ Start frontend
7. ✓ Test complete user flow
8. 🎉 Ready for hackathon submission!
