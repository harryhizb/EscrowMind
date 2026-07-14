/**
 * Offline validation script for EscrowMind backend verification pipeline.
 * Creates mock website builds (one passing, one failing), executes Puppeteer checks
 * inside the sandbox, and validates output structure.
 */

const AdmZip = require('adm-zip');
const { runPuppeteerChecks } = require('./services/verifier');

// Create mock HTML index page
const passingHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Passing Demo Site</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { margin: 0; padding: 20px; font-family: sans-serif; background: #fafafa; }
    form { display: flex; flex-direction: column; max-width: 300px; gap: 10px; }
  </style>
</head>
<body>
  <h1>Welcome to the EscrowMind demo site</h1>
  <p>This is the homepage.</p>
  <form id="contact-form">
    <input type="text" placeholder="Name" required />
    <input type="email" placeholder="Email" required />
    <button type="submit">Submit</button>
  </form>
</body>
</html>
`;

const aboutHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>About Page</title>
</head>
<body>
  <h1>About EscrowMind</h1>
  <p>Information page.</p>
</body>
</html>
`;

// Failing site (no form, has element wider than 375px viewport triggering overflow)
const failingHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>Failing Site</title>
  <style>
    /* Intentionally trigger horizontal scrollbar on mobile viewports */
    .overflow-box {
      width: 500px;
      height: 100px;
      background: red;
    }
  </style>
</head>
<body>
  <h1>Broken Layout Site</h1>
  <div class="overflow-box">This box overflows 375px!</div>
  <!-- No form element present anywhere -->
</body>
</html>
`;

function createZipBuffer(files) {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(files)) {
    zip.addFile(name, Buffer.from(content, 'utf-8'));
  }
  return zip.toBuffer();
}

async function runTests() {
  console.log('=== Starting Backend Verification Sandbox Tests ===\n');

  // Test Case 1: Fully Passing Website Build
  console.log('--- Test Case 1: Passing Site (Has required pages, Form, Responsive) ---');
  const passingZip = createZipBuffer({
    'index.html': passingHtml,
    'about.html': aboutHtml
  });

  const checklist1 = {
    requiredPages: ['/', '/about.html'],
    mustHaveContactForm: true,
    mustBeResponsive: true
  };

  const result1 = await runPuppeteerChecks(passingZip, checklist1);
  console.log('Result 1 Score:', result1.score);
  console.log('Logs:');
  console.log(JSON.stringify(result1.logs, null, 2));
  console.log('\n');

  if (result1.score !== 100) {
    console.error('FAIL: Test Case 1 should have returned 100% score.');
    process.exit(1);
  }

  // Test Case 2: Failing Website Build
  console.log('--- Test Case 2: Failing Site (No about page, No form, Horizontal overflow) ---');
  const failingZip = createZipBuffer({
    'index.html': failingHtml
  });

  const checklist2 = {
    requiredPages: ['/', '/about.html'],
    mustHaveContactForm: true,
    mustBeResponsive: true
  };

  const result2 = await runPuppeteerChecks(failingZip, checklist2);
  console.log('Result 2 Score:', result2.score);
  console.log('Logs:');
  console.log(JSON.stringify(result2.logs, null, 2));
  console.log('\n');

  // Should have failed at least some checks:
  // - page exists about.html (fail)
  // - contact form exists (fail)
  // - responsive (fail due to width 500px)
  // Total checks: 4 (index, about, form, responsive). Passed: 1 (index). Expected score: 25%
  if (result2.score !== 25) {
    console.error(`FAIL: Test Case 2 should have returned 25% score, got ${result2.score}%`);
    process.exit(1);
  }

  console.log('=== All Backend Verification Pipeline Tests PASSED! ===');
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test run crashed:', err);
  process.exit(1);
});
