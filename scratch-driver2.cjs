const { _electron: electron } = require('playwright-core');
const path = require('path');

async function main() {
  const app = await electron.launch({
    executablePath: path.resolve('node_modules/electron/dist/electron.exe'),
    args: [path.resolve('.')],
    timeout: 30000,
  });

  const page = await app.firstWindow();
  const consoleMessages = [];
  page.on('console', (msg) => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => consoleMessages.push(`[pageerror] ${err.message}`));

  await page.waitForTimeout(2000);

  async function clickNav(text) {
    await page.evaluate((t) => {
      const btns = [...document.querySelectorAll('.sidebar-nav-item')];
      const btn = btns.find((b) => b.textContent.includes(t));
      btn?.click();
    }, text);
    await page.waitForTimeout(1500);
  }

  await clickNav('My Models');
  await page.screenshot({ path: 'scratch-my-models.png' });
  const myModelsText = await page.evaluate(() => document.querySelector('.main-content')?.innerText?.slice(0, 800));
  console.log('=== MY MODELS TEXT ===\n', myModelsText);

  await clickNav('Settings');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'scratch-settings.png' });
  const settingsText = await page.evaluate(() => document.querySelector('.main-content')?.innerText?.slice(0, 800));
  console.log('=== SETTINGS TEXT ===\n', settingsText);

  await clickNav('Import Local');
  await page.screenshot({ path: 'scratch-import.png' });

  // HuggingFace tab on Marketplace
  await clickNav('Marketplace');
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    btns.find((b) => b.textContent.trim() === 'HuggingFace')?.click();
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'scratch-hf-tab.png' });

  console.log('--- CONSOLE MESSAGES ---');
  for (const m of consoleMessages) console.log(m);

  await app.close();
}

main().catch((err) => {
  console.error('DRIVER ERROR:', err);
  process.exit(1);
});
