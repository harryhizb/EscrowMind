const { ethers } = require('ethers');

const rpcUrl = process.env.FUJI_RPC_URL || 'https://api.avax-test.network/ext/bc/C/rpc';
const jobBoardAddress = '0x9de4fc5e969b6d9b00e0d2ff1bbf7c51ddf35890';

const jobBoardAbi = [
  'function jobs(uint256) view returns (address client, tuple(string[] requiredPages, bool mustBeResponsive, bool mustHaveContactForm, string extraNotes) checklist, bytes32 specDocCID, uint256 budgetMin, uint256 budgetMax, uint40 deadline, uint8 state, address assignedFreelancer, address escrowVault)',
  'function getBids(uint256 jobId) view returns (tuple(address freelancer, uint256 amount, bytes32 proposalCID, uint40 estimatedDays, bool withdrawn)[])'
];

async function verifyRelationship(jobId, senderAddress, recipientAddress) {
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const contract = new ethers.Contract(jobBoardAddress, jobBoardAbi, provider);

    const jobIdNum = BigInt(jobId);
    const job = await contract.jobs(jobIdNum);
    
    // Normalise to lowercase
    const client = job.client.toLowerCase();
    const assignedFreelancer = job.assignedFreelancer.toLowerCase();
    const state = Number(job.state);
    
    const sender = senderAddress.toLowerCase();
    const recipient = recipientAddress.toLowerCase();

    // Verify sender and recipient are not the same
    if (sender === recipient) {
      return { valid: false, error: 'Sender and recipient cannot be the same address' };
    }

    // A chat message on a job MUST be between the client and a freelancer
    const isSenderClient = sender === client;
    const isRecipientClient = recipient === client;

    if (!isSenderClient && !isRecipientClient) {
      return { valid: false, error: 'A conversation thread must be between the client and a freelancer' };
    }

    const freelancer = isSenderClient ? recipient : sender;

    if (state === 0) {
      // Open state: freelancer must have an active, non-withdrawn bid
      const bids = await contract.getBids(jobIdNum);
      const hasActiveBid = bids.some(b => 
        b.freelancer.toLowerCase() === freelancer && !b.withdrawn
      );
      if (!hasActiveBid) {
        return { valid: false, error: 'Freelancer does not have an active bid on this open job' };
      }
      return { valid: true };
    } else if (state === 1 || state === 2) {
      // Assigned or Closed state: freelancer must be the assignedFreelancer
      if (freelancer !== assignedFreelancer) {
        return { valid: false, error: 'Freelancer is not the accepted freelancer for this job' };
      }
      return { valid: true };
    }

    return { valid: false, error: 'Job is in an invalid state' };
  } catch (err) {
    console.error('Error verifying on-chain relationship:', err);
    return { valid: false, error: `On-chain validation error: ${err.message}` };
  }
}

async function verifyViewerPermission(jobId, viewerAddress) {
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const contract = new ethers.Contract(jobBoardAddress, jobBoardAbi, provider);

    const jobIdNum = BigInt(jobId);
    const job = await contract.jobs(jobIdNum);
    
    const client = job.client.toLowerCase();
    const assignedFreelancer = job.assignedFreelancer.toLowerCase();
    const state = Number(job.state);
    
    const viewer = viewerAddress.toLowerCase();

    if (viewer === client) {
      return { valid: true };
    }

    if (state === 0) {
      // Open state: viewer must have an active, non-withdrawn bid
      const bids = await contract.getBids(jobIdNum);
      const hasActiveBid = bids.some(b => 
        b.freelancer.toLowerCase() === viewer && !b.withdrawn
      );
      if (hasActiveBid) {
        return { valid: true };
      }
      return { valid: false, error: 'Viewer has no active bid on this open job' };
    } else if (state === 1 || state === 2) {
      // Assigned or Closed state: viewer must be the assigned freelancer
      if (viewer === assignedFreelancer) {
        return { valid: true };
      }
      return { valid: false, error: 'Viewer is not the assigned freelancer for this job' };
    }

    return { valid: false, error: 'Job is in an invalid state' };
  } catch (err) {
    console.error('Error verifying viewer permission:', err);
    return { valid: false, error: `On-chain validation error: ${err.message}` };
  }
}

module.exports = {
  verifyRelationship,
  verifyViewerPermission
};
