# Quick Setup Checklist

## 🚀 Complete Project Setup in 30 Minutes

### Phase 1: Wallet Setup (5 min)
- [ ] Install MetaMask: https://metamask.io
- [ ] Create new wallet (or import seed)
- [ ] Save 12-word seed phrase somewhere safe
- [ ] Add Avalanche Fuji network (RPC: https://api.avax-test.network/ext/bc/C/rpc)
- [ ] Get testnet AVAX: https://faucet.avax.network/ (2 AVAX free)

### Phase 2: Create Test Wallets (5 min)
Create 5 accounts in MetaMask (click + button on Accounts):
- [ ] Deployer (deploy contracts)
- [ ] Relayer (backend service)
- [ ] Arbiter A (disputes)
- [ ] Arbiter B (disputes)
- [ ] Arbiter C (disputes)

Send 0.5 AVAX to each:
```
1. Export private key from MetaMask
2. For each wallet, go to Account Settings → Export Private Key
3. Copy hex string (starts with 0x)
```

### Phase 3: Configure Environment (5 min)

#### Root .env
```bash
cp .env.example .env
```
Edit `.env` and fill in:
```
FUJI_RPC_URL=https://api.avax-test.network/ext/bc/C/rpc
DEPLOYER_PRIVATE_KEY=0x...
RELAYER_ADDRESS=0x...
RELAYER_PRIVATE_KEY=0x...
ARBITER_A=0x...
ARBITER_B=0x...
ARBITER_C=0x...
```

#### Backend .env
```bash
cp backend/.env.example backend/.env
```
Edit `backend/.env`:
```
FUJI_RPC_URL=https://api.avax-test.network/ext/bc/C/rpc
RELAYER_PRIVATE_KEY=0x...
```

#### Frontend .env
Already configured! Just verify it exists at `frontend/.env`

### Phase 4: Deploy Contracts (10 min)

```bash
# Terminal 1: Deploy
cd c:\Users\UTENTE\Downloads\escrow

forge script script/Deploy.s.sol \
  --rpc-url https://api.avax-test.network/ext/bc/C/rpc \
  --private-key YOUR_DEPLOYER_PRIVATE_KEY \
  --broadcast

# Wait for deployment to complete...
# ✓ Should show contract addresses
```

After deployment:
1. Copy contract addresses from output
2. Update `deployments/fuji.json` with addresses
3. Update `frontend/.env` with addresses

### Phase 5: Start Services (5 min)

#### Terminal 1: Backend
```bash
cd backend
npm install
npm run dev

# Wait for: ✓ Backend running on port 3001
```

#### Terminal 2: Frontend
```bash
cd frontend
npm install
npm run dev

# Wait for: ✓ Local: http://localhost:5173
```

### Phase 6: Test Application (5 min)

1. **Open browser:** http://localhost:5173
2. **Click "Connect Wallet"**
3. **Select account** (e.g., Deployer)
4. **Test user flow:**
   - [ ] Go to "Post Job"
   - [ ] Fill job details
   - [ ] Click "Post Job" → Approve in MetaMask
   - [ ] See job appear in "Browse Jobs"
   - [ ] See credits deducted in navbar

---

## 🔗 How MetaMask Login Works

```
1. User clicks "Connect Wallet" (RainbowKit button)
   ↓
2. MetaMask popup appears
   ↓
3. User selects account and clicks "Connect"
   ↓
4. Wagmi stores address and enables signing
   ↓
5. User can now:
   - Read smart contract data
   - Sign transactions
   - Approve spending
```

**No passwords needed!** Only MetaMask account + MetaMask password.

---

## 🔑 Environment Variables Reference

### Root .env (for forge deploy)
```
FUJI_RPC_URL          = Avalanche Fuji RPC endpoint
DEPLOYER_PRIVATE_KEY  = Deploy contracts (needs AVAX)
RELAYER_ADDRESS       = Backend wallet address
RELAYER_PRIVATE_KEY   = Backend wallet private key (for signatures)
ARBITER_A/B/C         = Three dispute arbiters
```

### backend/.env (for Node.js)
```
PORT                  = 3001
FUJI_RPC_URL         = RPC endpoint (same as root)
RELAYER_PRIVATE_KEY  = For signing verification scores
PINATA_API_KEY       = Optional (local cache fallback)
PINATA_SECRET_KEY    = Optional
```

### frontend/.env (for Vite)
```
VITE_BACKEND_URL     = http://localhost:3001
VITE_CHAIN_ID        = 43113
VITE_RPC_URL         = RPC endpoint
VITE_*_ADDRESS       = Contract addresses (auto-loaded)
```

---

## ⚠️ Security Reminders

1. **Never commit .env files** (already in .gitignore)
2. **Never share private keys** (keep only for testing)
3. **Use testnet AVAX only** (0.1-2 AVAX total needed)
4. **Different wallets for roles:**
   - Deployer: Deploy only
   - Relayer: Backend service only
   - Arbiters: Disputes only
   - Client/Freelancer: User wallets

---

## 🐛 Common Issues

### "MetaMask not found"
→ Refresh page, check extension installed

### "Wrong network"
→ Click MetaMask → Switch to Avalanche Fuji

### "Insufficient balance"
→ Get free AVAX: https://faucet.avax.network/

### "Transaction failed"
→ Check you have ≥2 credits (claim starter credits)

### "Backend not responding"
→ Check `npm run dev` in backend/ terminal is running

### "Contracts not deployed"
→ Run forge script Deploy.s.sol with correct private key

---

## 📊 Project Structure

```
escrow/
├── .env                 ← Root environment (create from .env.example)
├── backend/
│   ├── .env            ← Backend environment
│   ├── app.js          ← Express server
│   └── services/       ← IPFS, verification, blockchain
├── frontend/
│   ├── .env            ← Frontend environment
│   └── src/            ← React app
├── src/                ← Smart contracts
├── script/Deploy.s.sol ← Deployment script
└── test/               ← Contract tests
```

---

## ✅ Full Checklist to Complete

- [ ] MetaMask installed
- [ ] 5 wallets created in MetaMask
- [ ] Each wallet has 0.5+ AVAX
- [ ] Root .env configured
- [ ] backend/.env configured
- [ ] frontend/.env verified
- [ ] Contracts deployed to Fuji
- [ ] deployments/fuji.json updated
- [ ] Backend running (`npm run dev`)
- [ ] Frontend running (`npm run dev`)
- [ ] Can connect wallet in browser
- [ ] Can post a job
- [ ] Can submit a bid
- [ ] Can see credits updating

---

## 🎉 You're Ready!

Once all checkmarks are done:
1. Open http://localhost:5173
2. Connect wallet
3. Start testing user flows
4. Submit for hackathon! 🚀

---

## 📞 Quick Reference

| Command | Purpose |
|---------|---------|
| `forge script script/Deploy.s.sol --rpc-url ... --broadcast` | Deploy contracts |
| `npm run dev` (in backend/) | Start backend server |
| `npm run dev` (in frontend/) | Start frontend dev server |
| `npm test` (in backend/) | Run backend tests |
| `forge test` (in root/) | Run contract tests |

## 🔗 Useful Links

- MetaMask: https://metamask.io
- Testnet Faucet: https://faucet.avax.network/
- Avalanche Fuji Explorer: https://testnet.snowtrace.io/
- Wagmi Docs: https://wagmi.sh
- RainbowKit Docs: https://rainbowkit.com
