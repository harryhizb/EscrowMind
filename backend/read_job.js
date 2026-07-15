const { ethers } = require('ethers');

async function main() {
  const rpcUrl = process.env.FUJI_RPC_URL || 'https://api.avax-test.network/ext/bc/C/rpc';
  const jobBoardAddress = '0x9de4fc5e969b6d9b00e0d2ff1bbf7c51ddf35890';
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  
  const abi = [
    'function jobCounter() view returns (uint256)',
    'function jobs(uint256) view returns (address client, tuple(string[] requiredPages, bool mustBeResponsive, bool mustHaveContactForm, string extraNotes) checklist, bytes32 specDocCID, uint256 budgetMin, uint256 budgetMax, uint40 deadline, uint8 state, address assignedFreelancer, address escrowVault)'
  ];
  const contract = new ethers.Contract(jobBoardAddress, abi, provider);
  
  const count = await contract.jobCounter();
  console.log('Total jobs:', count.toString());
  
  if (Number(count) > 0) {
    const latestJobId = Number(count) - 1;
    const rawJob = await contract.jobs(latestJobId);
    console.log('Raw Job from Ethers:', rawJob);
    console.log('checklist:', rawJob.checklist);
    console.log('specDocCID:', rawJob.specDocCID);
  }
}

main().catch(console.error);
