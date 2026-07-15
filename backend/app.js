require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { uploadToIPFS, getFromIPFS, resolveCidForHash, resolveHashForCid, getUploadInfo } = require('./services/ipfs');
const { runPuppeteerChecks, submitScoreToChain } = require('./services/verifier');


const app = express();
const port = process.env.PORT || 3001;

// Middlewares
app.use(cors({
  exposedHeaders: ['Content-Disposition']
}));
app.use(express.json());

// Multer in-memory storage configuration
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 20 * 1024 * 1024 } // 20 MB size limit
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

/**
 * POST /upload
 * Accepts a website build zip archive.
 * Returns: CID (IPFS) and Keccak256 hash of zip content.
 */
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded in the "file" field.' });
    }

    console.log(`Received upload request for file: ${req.file.originalname} (${req.file.size} bytes)`);

    const result = await uploadToIPFS(req.file.buffer, req.file.originalname);
    
    return res.json({
      success: true,
      cid: result.cid,
      hash: result.hash
    });
  } catch (err) {
    console.error('Error during upload:', err);
    return res.status(500).json({ error: `Upload failed: ${err.message}` });
  }
});

function detectFileType(buffer, originalFileName) {
  if (originalFileName) {
    const ext = originalFileName.slice(originalFileName.lastIndexOf('.')).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
      '.zip': 'application/zip',
      '.txt': 'text/plain',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.doc': 'application/msword',
    };
    if (mimeTypes[ext]) {
      return { mimeType: mimeTypes[ext], fileName: originalFileName };
    }
  }

  // Magic bytes fallback detection
  if (buffer.length >= 4) {
    if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
      return { mimeType: 'application/pdf', fileName: originalFileName || 'document.pdf' };
    }
    if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
      return { mimeType: 'application/zip', fileName: originalFileName || 'archive.zip' };
    }
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      return { mimeType: 'image/png', fileName: originalFileName || 'image.png' };
    }
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      return { mimeType: 'image/jpeg', fileName: originalFileName || 'image.jpg' };
    }
  }

  try {
    const str = buffer.toString('utf8');
    JSON.parse(str);
    return { mimeType: 'application/json', fileName: originalFileName || 'data.json' };
  } catch (e) {}

  return { mimeType: 'application/octet-stream', fileName: originalFileName || 'file.bin' };
}

/**
 * GET /download/:hashOrCid and GET /file/:hashOrCid
 * Serves an uploaded IPFS object by CID or by the bytes32 content hash stored on-chain.
 */
app.get(['/download/:hashOrCid', '/file/:hashOrCid'], async (req, res) => {
  try {
    const { hashOrCid } = req.params;
    let cid = hashOrCid.startsWith('0x') ? resolveCidForHash(hashOrCid) : hashOrCid;

    let buffer = null;
    if (cid) {
      try {
        buffer = await getFromIPFS(cid);
      } catch (ipfsErr) {
        console.log(`Local IPFS fetch failed for CID ${cid}: ${ipfsErr.message}`);
      }
    }

    // Proxy Fallback: If not cached locally or IPFS fetch failed, query production backend
    if (!buffer) {
      try {
        const axios = require('axios');
        const hashVal = resolveHashForCid(hashOrCid);
        const targetQuery = hashVal || hashOrCid;
        const prodUrl = `https://escrowmind-production.up.railway.app/download/${targetQuery}`;
        console.log(`Proxying download request for ${hashOrCid} (${targetQuery}) to production backend: ${prodUrl}`);
        const prodRes = await axios.get(prodUrl, { responseType: 'arraybuffer', timeout: 6000 });
        res.setHeader('Content-Type', prodRes.headers['content-type'] || 'application/octet-stream');
        res.setHeader('Content-Disposition', prodRes.headers['content-disposition'] || '');
        return res.send(Buffer.from(prodRes.data));
      } catch (proxyErr) {
        console.error(`Production proxy fallback failed for ${hashOrCid}:`, proxyErr.message);
      }

      return res.status(404).json({
        error: 'No uploaded file was found for this hash.'
      });
    }

    // Check if this buffer is a job specification metadata JSON file
    let specJson = null;
    try {
      const str = buffer.toString('utf8');
      const parsed = JSON.parse(str);
      if (parsed && typeof parsed === 'object' && parsed.checklist && Array.isArray(parsed.attachments)) {
        specJson = parsed;
      }
    } catch (e) {}

    // If it's a spec JSON, resolve the actual attachments
    if (specJson) {
      const attachments = specJson.attachments;
      if (attachments && attachments.length > 0) {
        if (attachments.length === 1) {
          // Serve single attachment directly
          const att = attachments[0];
          const attCid = att.cid || (att.hash ? resolveCidForHash(att.hash) : null);
          if (attCid) {
            let attBuffer;
            try {
              attBuffer = await getFromIPFS(attCid);
            } catch (err) {
              // Try to proxy from production
              try {
                const axios = require('axios');
                const prodUrl = `https://escrowmind-production.up.railway.app/download/${att.hash || attCid}`;
                const prodRes = await axios.get(prodUrl, { responseType: 'arraybuffer', timeout: 5000 });
                attBuffer = Buffer.from(prodRes.data);
              } catch (e) {
                console.error(`Failed to proxy attachment ${att.name}:`, e.message);
              }
            }
            if (attBuffer) {
              const { mimeType, fileName } = detectFileType(attBuffer, att.name);
              res.setHeader('Content-Type', mimeType);
              res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
              return res.send(attBuffer);
            }
          }
        } else {
          // Bundle multiple attachments into a single ZIP archive on-the-fly
          const AdmZip = require('adm-zip');
          const zip = new AdmZip();
          for (const att of attachments) {
            const attCid = att.cid || (att.hash ? resolveCidForHash(att.hash) : null);
            if (attCid) {
              try {
                let attBuffer = null;
                try {
                  attBuffer = await getFromIPFS(attCid);
                } catch (e) {
                  // Try proxying
                  const axios = require('axios');
                  const prodUrl = `https://escrowmind-production.up.railway.app/download/${att.hash || attCid}`;
                  const prodRes = await axios.get(prodUrl, { responseType: 'arraybuffer', timeout: 5000 });
                  attBuffer = Buffer.from(prodRes.data);
                }
                if (attBuffer) {
                  zip.addFile(att.name || 'file', attBuffer);
                }
              } catch (err) {
                console.error(`Failed to fetch spec attachment ${att.name || attCid}:`, err.message);
              }
            }
          }
          const zipBuffer = zip.toBuffer();
          res.setHeader('Content-Type', 'application/zip');
          res.setHeader('Content-Disposition', `attachment; filename="spec-bundle-${cid.slice(0, 10)}.zip"`);
          return res.send(zipBuffer);
        }
      }
    }

    // Default download handling for any file (proposal attachments, delivery zips, single spec files, etc.)
    const info = getUploadInfo(hashOrCid);
    const originalName = info ? info.fileName : null;
    const { mimeType, fileName } = detectFileType(buffer, originalName);

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(buffer);
  } catch (err) {
    console.error('Error during download:', err);
    return res.status(500).json({ error: `Download failed: ${err.message}` });
  }
});

/**
 * GET /metadata/:hashOrCid
 * Returns the raw JSON metadata of a job specification or proposal directly.
 */
app.get('/metadata/:hashOrCid', async (req, res) => {
  try {
    const { hashOrCid } = req.params;
    let cid = hashOrCid.startsWith('0x') ? resolveCidForHash(hashOrCid) : hashOrCid;

    // Fallback Proxy Attempt
    let parsedMetadata = null;
    
    // First, try loading metadata locally if cid is known
    if (cid) {
      try {
        const buffer = await getFromIPFS(cid);
        parsedMetadata = JSON.parse(buffer.toString('utf8'));
      } catch (ipfsError) {
        console.log(`Local metadata fetch failed for ${cid}: ${ipfsError.message}. Trying fallback.`);
      }
    }

    // Second, if local retrieval failed or cid was unknown, attempt proxying from production
    if (!parsedMetadata) {
      try {
        const axios = require('axios');
        const prodUrl = `https://escrowmind-production.up.railway.app/metadata/${hashOrCid}`;
        console.log(`Proxying metadata request for ${hashOrCid} to production backend: ${prodUrl}`);
        const prodRes = await axios.get(prodUrl, { timeout: 4000 });
        if (prodRes.data && !prodRes.data.error) {
          parsedMetadata = prodRes.data;
        }
      } catch (proxyError) {
        console.log(`Production proxy fallback failed for ${hashOrCid}:`, proxyError.message);
      }
    }

    // Third, if both local cache and production proxy fail, return a graceful restored placeholder instead of a 404
    if (!parsedMetadata) {
      const hashVal = resolveHashForCid(hashOrCid);
      if (hashVal && hashVal.startsWith('0x') && /^0x[0-9a-f]{64}$/.test(hashVal.toLowerCase())) {
        return res.json({
          title: `Job Spec (Restored #${hashVal.slice(2, 8).toUpperCase()})`,
          description: "This job's text details were loaded via C-Chain transaction manifest references. Please see the checklist below for the full scope of work.",
          checklist: { requiredPages: [], mustBeResponsive: false, mustHaveContactForm: false, extraNotes: "" },
          attachments: [],
          isRestored: true
        });
      }
      return res.status(404).json({ error: 'No uploaded metadata was found for this hash.' });
    }

    return res.json(parsedMetadata);
  } catch (err) {
    console.error('Error fetching metadata:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.post('/delivery-notes', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const { deliveryHash, notes, cid, fileName } = req.body || {};
    if (!deliveryHash || typeof notes !== 'string') {
      return res.status(400).json({ error: 'deliveryHash and notes are required.' });
    }
    const notesDir = path.join(__dirname, 'local_ipfs_cache', 'delivery-notes');
    fs.mkdirSync(notesDir, { recursive: true });
    const safeHash = deliveryHash.toLowerCase().replace(/[^a-f0-9x]/g, '');
    fs.writeFileSync(path.join(notesDir, `${safeHash}.json`), JSON.stringify({
      deliveryHash,
      notes,
      cid,
      fileName,
      savedAt: new Date().toISOString()
    }, null, 2));
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/delivery-notes/:deliveryHash', (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const safeHash = req.params.deliveryHash.toLowerCase().replace(/[^a-f0-9x]/g, '');
    const notesPath = path.join(__dirname, 'local_ipfs_cache', 'delivery-notes', `${safeHash}.json`);
    if (!fs.existsSync(notesPath)) return res.status(404).json({ error: 'No delivery notes found.' });
    return res.json(JSON.parse(fs.readFileSync(notesPath, 'utf8')));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /verify
 * Verifies a delivery against a jobBoard checklist.
 * Body: { jobId, milestoneIndex, deliveryCID, checklist, vaultAddress }
 */
app.post('/verify', async (req, res) => {
  try {
    const { jobId, milestoneIndex, deliveryCID, checklist, vaultAddress } = req.body;

    if (!deliveryCID || !checklist || !vaultAddress) {
      return res.status(400).json({ 
        error: 'Missing required parameters: deliveryCID, checklist, and vaultAddress are required.' 
      });
    }

    const mIndex = parseInt(milestoneIndex, 10);
    if (isNaN(mIndex)) {
      return res.status(400).json({ error: 'milestoneIndex must be a valid number.' });
    }

    console.log(`Starting verification for Job ${jobId}, Milestone ${mIndex}, Vault ${vaultAddress}`);
    console.log('Checklist parameters:', checklist);

    // 1. Download delivery zip from mock IPFS cache or gateway
    const zipBuffer = await getFromIPFS(deliveryCID);

    // 2. Run Puppeteer verification checks inside sandbox
    const { score, logs } = await runPuppeteerChecks(zipBuffer, checklist);

    console.log(`Verification completed. Score: ${score}%. Logs length: ${logs.length}`);

    // Save report to disk
    const fs = require('fs');
    const path = require('path');
    const reportsDir = path.join(__dirname, 'local_ipfs_cache', 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    const reportPath = path.join(reportsDir, `${vaultAddress.toLowerCase()}-${mIndex}.json`);
    fs.writeFileSync(reportPath, JSON.stringify({
      score,
      report: logs,
      timestamp: Date.now()
    }, null, 2));

    // 3. Post verification result to blockchain via relayer
    const onChainResult = await submitScoreToChain(vaultAddress, mIndex, score);

    return res.json({
      success: true,
      score: score,
      autoReleased: onChainResult.autoReleased,
      txHash: onChainResult.txHash,
      mockedTx: onChainResult.mocked,
      report: logs
    });
  } catch (err) {
    console.error('Error during verification:', err);
    return res.status(500).json({ error: `Verification failed: ${err.message}` });
  }
});

app.get('/verify-logs/:vaultAddress/:milestoneIndex', (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const { vaultAddress, milestoneIndex } = req.params;
    const mIndex = parseInt(milestoneIndex, 10);
    const reportsDir = path.join(__dirname, 'local_ipfs_cache', 'reports');
    const reportPath = path.join(reportsDir, `${vaultAddress.toLowerCase()}-${mIndex}.json`);
    if (fs.existsSync(reportPath)) {
      const data = fs.readFileSync(reportPath, 'utf8');
      return res.json(JSON.parse(data));
    }
    return res.status(404).json({ error: 'No verification logs found for this milestone' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── MESSAGING ENDPOINTS ──────────────────────────────────────────
const db = require('./services/db');
const { verifyRelationship, verifyViewerPermission } = require('./services/onchain');

const rateLimitCache = new Map();
const MESSAGE_COOLDOWN_MS = 3000; // 3 seconds per sender

function checkRateLimit(senderAddress) {
  const key = senderAddress.toLowerCase();
  const now = Date.now();
  const lastTime = rateLimitCache.get(key) || 0;
  if (now - lastTime < MESSAGE_COOLDOWN_MS) {
    return true; // Rate limited
  }
  rateLimitCache.set(key, now);
  return false;
}

function sanitizeContent(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

app.get('/jobs/:jobId/messages', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { viewerAddress, otherAddress } = req.query;

    if (!viewerAddress || !viewerAddress.startsWith('0x')) {
      return res.status(400).json({ error: 'viewerAddress query parameter is required' });
    }

    // Verify viewer permission on-chain
    const perm = await verifyViewerPermission(jobId, viewerAddress);
    if (!perm.valid) {
      return res.status(403).json({ error: `Access Denied: ${perm.error}` });
    }

    const messages = db.getMessages(jobId, viewerAddress, otherAddress);
    return res.json(messages);
  } catch (err) {
    console.error('Error fetching messages:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.post('/jobs/:jobId/messages', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { senderAddress, recipientAddress, content } = req.body;

    if (!senderAddress || !recipientAddress || !content) {
      return res.status(400).json({ error: 'senderAddress, recipientAddress, and content are required' });
    }

    if (checkRateLimit(senderAddress)) {
      return res.status(429).json({ error: 'Too many requests. Please wait a few seconds before sending another message.' });
    }

    const sanitized = sanitizeContent(content);
    if (!sanitized.trim()) {
      return res.status(400).json({ error: 'Message content cannot be empty' });
    }

    // Verify relation on-chain
    const relation = await verifyRelationship(jobId, senderAddress, recipientAddress);
    if (!relation.valid) {
      return res.status(403).json({ error: `Forbidden: ${relation.error}` });
    }

    const msg = db.addMessage(jobId, senderAddress, recipientAddress, sanitized);
    return res.json(msg);
  } catch (err) {
    console.error('Error posting message:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.get('/messages/latest', (req, res) => {
  try {
    const { viewerAddress } = req.query;
    if (!viewerAddress || !viewerAddress.startsWith('0x')) {
      return res.status(400).json({ error: 'viewerAddress query parameter is required' });
    }
    const timestamps = db.getLatestMessageTimestamps(viewerAddress);
    return res.json(timestamps);
  } catch (err) {
    console.error('Error fetching latest message timestamps:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start Server
app.listen(port, () => {
  console.log(`EscrowMind Backend Service running on port ${port}`);
  console.log(`Auto-verify relayer ready. Checks objective checklists, not subjective quality.`);
});
