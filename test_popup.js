const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ 
    headless: true,
    executablePath: '/root/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  
  await page.goto('http://localhost/');
  await page.waitForSelector('[data-uid="axhc3gkb"]', { timeout: 5000 });
  
  // Click the doc card
  await page.click('[data-uid="axhc3gkb"]');
  await new Promise(r => setTimeout(r, 800));
  
  // Take screenshot of view modal
  await page.screenshot({ path: 'view_modal.png', fullPage: false });
  console.log('View modal screenshot saved');
  
  // Click the annotation
  await page.click('#viewBody .doc-anno');
  await new Promise(r => setTimeout(r, 800));
  
  // Take screenshot with popup
  await page.screenshot({ path: 'popup_open.png', fullPage: false });
  console.log('Popup screenshot saved');
  
  // Get popup position info
  const popupInfo = await page.evaluate(() => {
    const popup = document.getElementById('annoPopup');
    const span = document.querySelector('#viewBody .doc-anno');
    if (!popup || !span) return { error: 'elements not found' };
    
    const spanRect = span.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();
    
    return {
      spanRect: { top: spanRect.top, left: spanRect.left, bottom: spanRect.bottom, right: spanRect.right },
      popupRect: { top: popupRect.top, left: popupRect.left, bottom: popupRect.bottom, right: popupRect.right },
      popupCss: { top: popup.style.top, left: popup.style.left }
    };
  });
  console.log('Position info:', JSON.stringify(popupInfo, null, 2));
  
  await browser.close();
  console.log('Done!');
})();
