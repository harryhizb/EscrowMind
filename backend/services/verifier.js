const fs = require('fs');
const path = require('path');
const http = require('http');
const AdmZip = require('adm-zip');
const puppeteer = require('puppeteer');
const { ethers } = require('ethers');
const crypto = require('crypto');

// Helper to serve files statically for Puppeteer check
class StaticServer {
  constructor(dir, port) {
    this.dir = dir;
    this.port = port;
    this.server = null;
  }

  start() {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        // Simple router
        let reqPath = req.url.split('?')[0];
        if (reqPath === '/') reqPath = '/index.html';

        // Safe relative path resolving
        const filePath = path.join(this.dir, reqPath);

        // Basic MIME types
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
          '.html': 'text/html',
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.json': 'application/json',
          '.png': 'image/png',
          '.jpg': 'image/jpg',
          '.gif': 'image/gif',
          '.svg': 'image/svg+xml',
        };

        const contentType = mimeTypes[ext] || 'application/octet-stream';

        fs.readFile(filePath, (error, content) => {
          if (error) {
            if (error.code === 'ENOENT') {
              // Try index.html in subdirectories if route matches
              const nestedHtml = path.join(filePath, 'index.html');
              if (fs.existsSync(nestedHtml)) {
                fs.readFile(nestedHtml, (err2, content2) => {
                  res.writeHead(200, { 'Content-Type': 'text/html' });
                  res.end(content2, 'utf-8');
                });
                return;
              }
              res.writeHead(404);
              res.end('404 File Not Found');
            } else {
              res.writeHead(500);
              res.end(`500 Server Error: ${error.code}`);
            }
          } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
          }
        });
      });

      this.server.listen(this.port, '127.0.0.1', () => {
        console.log(`Temp static server running at http://127.0.0.1:${this.port}`);
        resolve();
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

/**
 * Verify a delivery against a checklist.
 * 
 * @param {Buffer} zipBuffer - Delivered build .zip
 * @param {object} checklist - JobBoard.RequirementChecklist format
 * @returns {Promise<{ score: number, logs: Array<{ check: string, passed: boolean, details: string }> }>}
 */
async function runPuppeteerChecks(zipBuffer, checklist) {
  const tempDir = path.join(__dirname, '..', `sandbox-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const logs = [];
  let checksPassed = 0;
  let totalChecks = 0;

  try {
    // 1. Unzip delivery to sandboxed directory
    const zip = new AdmZip(zipBuffer);
    zip.extractAllTo(tempDir, true);
    console.log(`Extracted deliverable to ${tempDir}`);

    // If zip contains a single folder wrapping the site, target that subfolder
    let serveDir = tempDir;
    const rootFiles = fs.readdirSync(tempDir);
    if (rootFiles.length === 1 && fs.statSync(path.join(tempDir, rootFiles[0])).isDirectory()) {
      serveDir = path.join(tempDir, rootFiles[0]);
    }

    // 2. Start static server
    const port = 8000 + Math.floor(Math.random() * 1000);
    const server = new StaticServer(serveDir, port);
    await server.start();

    // 3. Launch Puppeteer
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // ── Check A: Pages check ─────────────────────────────────────
    if (checklist.requiredPages && checklist.requiredPages.length > 0) {
      for (const rawPage of checklist.requiredPages) {
        totalChecks++;
        const targetPage = rawPage.trim();
        // Normalize page route
        const route = targetPage.startsWith('/') ? targetPage : `/${targetPage}`;
        const url = `http://127.0.0.1:${port}${route}`;

        try {
          console.log(`Checking page: ${url}`);
          const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 5000 });
          const status = response.status();
          const bodyText = await page.evaluate(() => document.body.innerText.trim());

          if (status === 200 && bodyText.length > 0) {
            checksPassed++;
            logs.push({
              check: `Page exists: ${targetPage}`,
              passed: true,
              details: `Successfully loaded route "${route}" with HTTP 200. Document content length: ${bodyText.length} characters.`
            });
          } else {
            logs.push({
              check: `Page exists: ${targetPage}`,
              passed: false,
              details: `Loaded route "${route}" but returned HTTP ${status} (expected 200) or page body was empty.`
            });
          }
        } catch (err) {
          logs.push({
            check: `Page exists: ${targetPage}`,
            passed: false,
            details: `Failed to load route "${route}". Error: ${err.message}`
          });
        }
      }
    } else {
      // Default fall-back: check index.html if no pages are specified
      totalChecks++;
      try {
        const url = `http://127.0.0.1:${port}/`;
        const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 5000 });
        if (response.status() === 200) {
          checksPassed++;
          logs.push({
            check: 'Index page exists',
            passed: true,
            details: 'Loaded root route "/" successfully with HTTP 200.'
          });
        } else {
          logs.push({
            check: 'Index page exists',
            passed: false,
            details: `Loaded root route "/" but returned HTTP ${response.status()}.`
          });
        }
      } catch (err) {
        logs.push({
          check: 'Index page exists',
          passed: false,
          details: `Failed to load root route "/". Error: ${err.message}`
        });
      }
    }

    // ── Check B: Contact Form check ──────────────────────────────
    if (checklist.mustHaveContactForm) {
      totalChecks++;
      let foundForm = false;
      const pagesToCheck = checklist.requiredPages && checklist.requiredPages.length > 0 
        ? checklist.requiredPages 
        : ['/'];

      for (const targetPage of pagesToCheck) {
        const route = targetPage.startsWith('/') ? targetPage : `/${targetPage}`;
        try {
          await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: 'networkidle2', timeout: 5000 });
          const formExists = await page.evaluate(() => {
            return document.querySelector('form') !== null;
          });
          if (formExists) {
            foundForm = true;
            break;
          }
        } catch (e) {}
      }

      if (foundForm) {
        checksPassed++;
        logs.push({
          check: 'Contact Form check',
          passed: true,
          details: 'Verified the presence of a `<form>` input element on the website.'
        });
      } else {
        logs.push({
          check: 'Contact Form check',
          passed: false,
          details: 'No `<form>` element was found on any of the specified page routes.'
        });
      }
    }

    // ── Check C: Responsiveness check ────────────────────────────
    if (checklist.mustBeResponsive) {
      totalChecks++;
      let allResponsive = true;
      let failingDetails = '';

      const pagesToCheck = checklist.requiredPages && checklist.requiredPages.length > 0 
        ? checklist.requiredPages 
        : ['/'];

      // Set mobile viewport width
      await page.setViewport({ width: 375, height: 667 });

      for (const targetPage of pagesToCheck) {
        const route = targetPage.startsWith('/') ? targetPage : `/${targetPage}`;
        try {
          await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: 'networkidle2', timeout: 5000 });
          // Check scroll width of body vs viewport width
          const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth || document.body.scrollWidth);
          if (scrollWidth > 375) {
            allResponsive = false;
            failingDetails += `Route "${route}" overflowed viewport width: scrollWidth is ${scrollWidth}px (expected <= 375px). `;
          }
        } catch (err) {
          allResponsive = false;
          failingDetails += `Failed to load route "${route}" for responsive check: ${err.message}. `;
        }
      }

      if (allResponsive) {
        checksPassed++;
        logs.push({
          check: 'Responsive Mobile Layout (375px)',
          passed: true,
          details: 'Verified all required routes load without horizontal overflow (scrollWidth <= 375px).'
        });
      } else {
        logs.push({
          check: 'Responsive Mobile Layout (375px)',
          passed: false,
          details: `Responsive layout check failed. Details: ${failingDetails}`
        });
      }
    }

    // Clean up Puppeteer & Server
    await browser.close();
    await server.stop();

  } catch (err) {
    console.error('Puppeteer verification process crashed:', err);
    logs.push({
      check: 'System self-check',
      passed: false,
      details: `Sandbox test suite encountered a fatal execution crash: ${err.message}`
    });
    if (totalChecks === 0) totalChecks = 1;
  } finally {
    // 4. Recursive clean up of temp sandboxed build files
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {}
  }

  const score = Math.round((checksPassed / totalChecks) * 100);
  return { score, logs };
}

/**
 * Submits the checklist verification score to the EscrowVault contract.
 * Uses the backend relayer wallet.
 * 
 * @param {string} vaultAddress 
 * @param {number} milestoneIndex 
 * @param {number} score 
 * @returns {Promise<{ txHash: string, autoReleased: boolean, mocked: boolean }>}
 */
async function submitScoreToChain(vaultAddress, milestoneIndex, score) {
  const rpcUrl = process.env.FUJI_RPC_URL;
  const relayerKey = process.env.RELAYER_PRIVATE_KEY;

  if (!rpcUrl || !relayerKey) {
    console.log('FUJI_RPC_URL or RELAYER_PRIVATE_KEY not set. Mocking on-chain transaction.');
    return {
      txHash: '0xMockTxHash' + crypto.createHash('sha256').update(vaultAddress + milestoneIndex + score).digest('hex'),
      autoReleased: score >= 90,
      mocked: true
    };
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(relayerKey, provider);

  // Minimal human-readable ABI for markVerified
  const vaultAbi = [
    'function markVerified(uint8 index, uint256 checklistScorePercent) external',
    'function milestoneStates(uint256 index) external view returns (uint8)'
  ];

  const vaultContract = new ethers.Contract(vaultAddress, vaultAbi, wallet);

  console.log(`Sending markVerified txn to ${vaultAddress} for milestone ${milestoneIndex} (Score: ${score}%)`);
  
  // Call contract
  const tx = await vaultContract.markVerified(milestoneIndex, score);
  console.log(`Transaction sent: ${tx.hash}. Waiting for confirmation...`);
  
  const receipt = await tx.wait();
  console.log(`Transaction confirmed in block ${receipt.blockNumber}`);

  return {
    txHash: tx.hash,
    autoReleased: score >= 90,
    mocked: false
  };
}

module.exports = {
  runPuppeteerChecks,
  submitScoreToChain
};
