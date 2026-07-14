const pinataSDK = require('@pinata/sdk');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Initialize Pinata SDK if credentials are in env, otherwise fallback to local caching
let pinata = null;
if (process.env.PINATA_API_KEY && process.env.PINATA_SECRET_KEY) {
  pinata = new pinataSDK(process.env.PINATA_API_KEY, process.env.PINATA_SECRET_KEY);
  console.log('IPFS service initialized with Pinata SDK');
} else {
  console.log('PINATA_API_KEY/SECRET_KEY not set. Using local IPFS mock cache.');
}

const LOCAL_CACHE_DIR = path.join(__dirname, '..', 'local_ipfs_cache');
const MANIFEST_PATH = path.join(LOCAL_CACHE_DIR, 'manifest.json');
if (!fs.existsSync(LOCAL_CACHE_DIR)) {
  fs.mkdirSync(LOCAL_CACHE_DIR, { recursive: true });
}

function readManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function writeManifest(manifest) {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

function rememberUpload(hash, cid, fileName) {
  const manifest = readManifest();
  manifest[hash.toLowerCase()] = {
    cid,
    fileName,
    uploadedAt: new Date().toISOString()
  };
  writeManifest(manifest);
}

function resolveCidForHash(hash) {
  const normalized = String(hash || '').toLowerCase();
  const manifest = readManifest();
  if (manifest[normalized]?.cid) return manifest[normalized].cid;

  if (/^0x[0-9a-f]{64}$/.test(normalized)) {
    const mockCID = `QmMockIPFSCID${normalized.slice(2, 22)}`;
    const cachePath = path.join(LOCAL_CACHE_DIR, `${mockCID}.zip`);
    if (fs.existsSync(cachePath)) return mockCID;
  }

  return null;
}

/**
 * Computes keccak256 hash of a file buffer (matches Solidity keccak256).
 * Uses ethers.keccak256 for exact compatibility with Solidity.
 * @param {Buffer} buffer 
 * @returns {string} 0x prefixed hex string
 */
function computeKeccak256(buffer) {
  const { ethers } = require('ethers');
  return ethers.keccak256(buffer);
}

/**
 * Upload buffer to IPFS via Pinata.
 * Falls back to local directory cache if Pinata keys are missing.
 * 
 * @param {Buffer} buffer - File content.
 * @param {string} fileName - File name or folder name.
 * @returns {Promise<{ cid: string, hash: string }>}
 */
async function uploadToIPFS(buffer, fileName) {
  // Compute keccak256 content hash using ethers
  const { ethers } = require('ethers');
  const contentHash = ethers.keccak256(buffer);

  // If Pinata is set up, pin the file
  if (pinata) {
    try {
      // Create temporary file to pass to Pinata stream
      const tempPath = path.join(LOCAL_CACHE_DIR, `temp-${Date.now()}-${fileName}`);
      fs.writeFileSync(tempPath, buffer);

      const readableStream = fs.createReadStream(tempPath);
      const options = {
        pinataMetadata: {
          name: fileName,
        },
      };

      const result = await pinata.pinFileToIPFS(readableStream, options);
      
      // Cleanup temp file
      try { fs.unlinkSync(tempPath); } catch (e) {}

      console.log(`Pinata upload success. CID: ${result.IpfsHash}`);
      rememberUpload(contentHash, result.IpfsHash, fileName);
      return {
        cid: result.IpfsHash,
        hash: contentHash
      };
    } catch (err) {
      // Log full error object to help diagnose failures (Pinata SDK may return
      // non-standard error shapes where `err.message` is undefined).
      console.error('Pinata upload failed. Full error:', err);
      // Surface the failure to callers so the frontend can show a clear error
      // instead of silently receiving a mock CID. Include useful details when
      // available.
      const details = err && (err.message || (err.response && err.response.data) || JSON.stringify(err));
      throw new Error(`Pinata upload failed: ${details}`);
    }
  }

  // Fallback / local caching path
  // Deterministic mock CID based on hash
  const mockCID = `QmMockIPFSCID${contentHash.slice(2, 22)}`;
  const cachePath = path.join(LOCAL_CACHE_DIR, `${mockCID}.zip`);
  
  fs.writeFileSync(cachePath, buffer);
  rememberUpload(contentHash, mockCID, fileName);
  console.log(`Saved build to mock IPFS cache: ${cachePath}`);

  return {
    cid: mockCID,
    hash: contentHash
  };
}

/**
 * Retrieve a file buffer by CID.
 * Fetches from IPFS gate or local mock cache folder.
 * 
 * @param {string} cid 
 * @returns {Promise<Buffer>}
 */
async function getFromIPFS(cid) {
  // First check local cache
  const cachePath = path.join(LOCAL_CACHE_DIR, `${cid}.zip`);
  if (fs.existsSync(cachePath)) {
    console.log(`IPFS Cache hit for CID: ${cid}`);
    return fs.readFileSync(cachePath);
  }

  // Otherwise, fetch from public IPFS gateways
  const axios = require('axios');
  const gateways = [
    `https://gateway.pinata.cloud/ipfs/${cid}`,
    `https://cloudflare-ipfs.com/ipfs/${cid}`,
    `https://ipfs.io/ipfs/${cid}`
  ];

  for (const url of gateways) {
    try {
      console.log(`Fetching from gateway: ${url}`);
      const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
      const buffer = Buffer.from(response.data);
      // Cache it locally
      fs.writeFileSync(cachePath, buffer);
      return buffer;
    } catch (err) {
      console.log(`Gateway fetch failed for URL ${url}: ${err.message}`);
    }
  }

  throw new Error(`Unable to fetch content for CID: ${cid} from gateways or local cache`);
}

/**
 * Resolves file metadata (filename, etc.) from manifest by hash or CID.
 */
function getUploadInfo(hashOrCid) {
  const manifest = readManifest();
  const normalized = String(hashOrCid || '').toLowerCase();
  
  if (normalized.startsWith('0x')) {
    return manifest[normalized] || null;
  }
  
  // Find by CID
  const entry = Object.entries(manifest).find(([h, val]) => val.cid === hashOrCid);
  if (entry) return entry[1];
  
  return null;
}

module.exports = {
  uploadToIPFS,
  getFromIPFS,
  resolveCidForHash,
  getUploadInfo
};

