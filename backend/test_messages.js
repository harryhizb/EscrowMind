const db = require('./services/db');
const { verifyRelationship, verifyViewerPermission } = require('./services/onchain');
const { ethers } = require('ethers');

async function testDatabase() {
  console.log('--- Test 1: Database Operations ---');
  const jobId = '999';
  const client = '0x1111111111111111111111111111111111111111';
  const freelancer = '0x2222222222222222222222222222222222222222';
  
  // Clean start (re-init db or append)
  console.log('Adding test messages...');
  const msg1 = db.addMessage(jobId, client, freelancer, 'Hello Freelancer!');
  const msg2 = db.addMessage(jobId, freelancer, client, 'Hello Client! Yes I can build that.');
  
  console.log('Retrieving messages for job 999...');
  const allMsgs = db.getMessages(jobId, client);
  console.log(`Found ${allMsgs.length} messages:`);
  for (const m of allMsgs) {
    console.log(`  [${m.senderAddress === client.toLowerCase() ? 'Client' : 'Freelancer'}]: ${m.content} (${m.createdAt})`);
  }

  // Verify getLatestMessageTimestamps
  console.log('Fetching latest message timestamps for client...');
  const latest = db.getLatestMessageTimestamps(client);
  console.log('Latest timestamp mapping:', latest);
  
  if (latest[jobId]) {
    console.log('✓ Database operations check passed!');
  } else {
    throw new Error('Database check failed: latest timestamp missing');
  }
}

async function testOnChainPermission() {
  console.log('\n--- Test 2: On-Chain Permission Logic ---');
  const rpcUrl = process.env.FUJI_RPC_URL || 'https://api.avax-test.network/ext/bc/C/rpc';
  const jobBoardAddress = '0x9de4fc5e969b6d9b00e0d2ff1bbf7c51ddf35890';
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  
  // Read jobCounter to find a live job to test against
  const abi = ['function jobCounter() view returns (uint256)', 'function jobs(uint256) view returns (address client, tuple(string[] requiredPages, bool mustBeResponsive, bool mustHaveContactForm, string extraNotes) checklist, bytes32 specDocCID, uint256 budgetMin, uint256 budgetMax, uint40 deadline, uint8 state, address assignedFreelancer, address escrowVault)'];
  const contract = new ethers.Contract(jobBoardAddress, abi, provider);
  
  const count = await contract.jobCounter();
  console.log(`Current jobCounter on Fuji: ${count}`);
  
  if (Number(count) === 0) {
    console.log('No jobs found on-chain to test relationship permissions. Skipping live checks.');
    return;
  }
  
  const testJobId = Number(count) - 1;
  console.log(`Testing with Job ID: ${testJobId}`);
  
  const job = await contract.jobs(testJobId);
  const client = job.client;
  const state = Number(job.state);
  const freelancer = job.assignedFreelancer;
  
  console.log(`Job Details - Client: ${client}, State: ${state}, Freelancer: ${freelancer}`);
  
  // 1. Client read permission check
  console.log('Verifying client viewer permission...');
  const clientCheck = await verifyViewerPermission(testJobId, client);
  console.log('Result:', clientCheck);
  if (!clientCheck.valid) {
    throw new Error(`Client read check failed: ${clientCheck.error}`);
  }

  // 2. Unrelated address read permission check (should fail)
  const fakeAddr = '0x0000000000000000000000000000000000000001';
  console.log(`Verifying unrelated address (${fakeAddr}) viewer permission...`);
  const fakeCheck = await verifyViewerPermission(testJobId, fakeAddr);
  console.log('Result (expected false):', fakeCheck);
  if (fakeCheck.valid) {
    throw new Error('Unrelated address should not have permission');
  }
  
  // 3. Write relation check
  if (state === 1 || state === 2) {
    console.log('Verifying assigned client-freelancer write permission...');
    const writeCheck = await verifyRelationship(testJobId, client, freelancer);
    console.log('Result:', writeCheck);
    if (!writeCheck.valid) {
      throw new Error(`Write check failed: ${writeCheck.error}`);
    }
  } else {
    console.log('Job is Open. Checking write relation for fake address (expected false)...');
    const writeCheck = await verifyRelationship(testJobId, client, fakeAddr);
    console.log('Result (expected false):', writeCheck);
    if (writeCheck.valid) {
      throw new Error('Unrelated address should not have write relation on Open job');
    }
  }
  
  console.log('✓ On-chain permission checks passed!');
}

async function run() {
  try {
    await testDatabase();
    await testOnChainPermission();
    console.log('\n=== ALL TESTS PASSED SUCCESSFULLY ===');
  } catch (err) {
    console.error('\n❌ Test execution failed:', err);
    process.exit(1);
  }
}

run();
