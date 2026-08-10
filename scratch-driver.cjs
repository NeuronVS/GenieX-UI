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

  await page.waitForTimeout(3000);

  const rootHtml = await page.evaluate(() => document.getElementById('root')?.innerHTML?.slice(0, 500));
  console.log('ROOT HTML LENGTH:', rootHtml ? rootHtml.length : 0);
  console.log('ROOT HTML SNIPPET:', rootHtml);

  const hasGeniexApi = await page.evaluate(() => typeof window.geniex);
  console.log('typeof window.geniex:', hasGeniexApi);

  console.log('--- CONSOLE MESSAGES ---');
  for (const m of consoleMessages) console.log(m);

  await page.screenshot({ path: 'scratch-screenshot.png' });
  console.log('screenshot saved');

  await app.close();
}

main().catch((err) => {
  console.error('DRIVER ERROR:', err);
  process.exit(1);
});
