/**
 * updateAllMarkets.js
 * Runs incremental Shoptet sync for all markets (AT, PL, NL, DE, SK, CZ),
 * then runs updateData.js (Google Sheets: CZ + SK costs/margins),
 * and finally commits + pushes updated data files to trigger Vercel redeploy.
 *
 * Run:       node scripts/updateAllMarkets.js
 * Scheduled: Windows Task Scheduler @ 06:00 CET daily
 */

const { spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const LOG_FILE  = path.join(__dirname, 'updateAllMarkets.log');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function runScript(scriptName) {
  log(`--- START: ${scriptName} ---`);
  const result = spawnSync('node', [path.join(__dirname, scriptName)], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: false,
  });
  if (result.status !== 0) {
    log(`--- FAILED: ${scriptName} (exit ${result.status}) ---`);
    return false;
  }
  log(`--- DONE: ${scriptName} ---`);
  return true;
}

async function main() {
  log('=== updateAllMarkets START ===');

  const scripts = [
    'fetchShoptetData.js',    // AT
    'fetchShoptetDataPL.js',  // PL
    'fetchShoptetDataNL.js',  // NL
    'fetchShoptetDataDE.js',  // DE
    'fetchShoptetDataSK.js',  // SK
    'fetchShoptetDataCZ.js',  // CZ
    'updateData.js',          // Google Sheets: CZ+SK costs, margins
  ];

  let anyFailed = false;
  for (const script of scripts) {
    const ok = runScript(script);
    if (!ok) anyFailed = true;
  }

  // Git commit + push to trigger Vercel redeploy
  const { execSync } = require('child_process');
  const today = new Date().toISOString().split('T')[0];
  try {
    execSync('git add data/', { cwd: REPO_ROOT, stdio: 'pipe' });
    const status = execSync('git status --porcelain data/', { cwd: REPO_ROOT }).toString().trim();
    if (status) {
      execSync(`git commit -m "data: auto-update all markets ${today}"`, { cwd: REPO_ROOT, stdio: 'pipe' });
      execSync('git push origin main', { cwd: REPO_ROOT, stdio: 'pipe' });
      log(`Auto-deploy: committed and pushed (${today})`);
    } else {
      log('Auto-deploy: no data changes to commit');
    }
  } catch (gitErr) {
    log(`Auto-deploy WARNING: git push failed — ${gitErr.message}`);
  }

  if (anyFailed) {
    log('=== updateAllMarkets DONE with errors (see above) ===');
    process.exit(1);
  } else {
    log('=== updateAllMarkets DONE successfully ===');
  }
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
