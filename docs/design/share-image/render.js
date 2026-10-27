// Renders compose.html to a 1200x630 PNG. From the repo root, with a static server on the repo root:
//   python3 -m http.server 8765 &
//   node docs/design/share-image/render.js dusk app/opengraph-image.png
const { chromium } = require("playwright");

(async () => {
  const [look = "dusk", out = `share-${look}.png`, base = "http://localhost:8765"] = process.argv.slice(2);
  const browser = await chromium.launch();
  // The skyline reads sunrise and sunset as local times, so render in the venue's time zone.
  const page = await browser.newPage({ timezoneId: "America/Los_Angeles", viewport: { width: 1200, height: 630 } });
  page.on("pageerror", (e) => console.error(e.message));
  await page.goto(`${base}/docs/design/share-image/compose.html?look=${look}`);
  await page.waitForFunction(() => window.done, null, { timeout: 15000 });
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  await browser.close();
  console.log(`wrote ${out}`);
})();
