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
  await page.click('[data-uid="axhc3gkb"]');
  await new Promise(r => setTimeout(r, 1000));
  
  // Check what the onclick looks like
  const onclickInfo = await page.evaluate(() => {
    const span = document.querySelector('#viewBody .doc-anno');
    if (!span) return { error: 'No span found in viewBody' };
    return {
      onclick: span.getAttribute('onclick'),
      outerHTML: span.outerHTML.substring(0, 200),
      className: span.className,
      dataId: span.getAttribute('data-id')
    };
  });
  console.log('Span info:', JSON.stringify(onclickInfo, null, 2));
  
  // Try manually triggering the onclick with event
  const result = await page.evaluate(() => {
    const span = document.querySelector('#viewBody .doc-anno');
    if (!span) return;
    
    // Create a proper click event
    const event = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window
    });
    
    // Dispatch the event
    span.dispatchEvent(event);
    
    // Check popup position
    const popup = document.getElementById('annoPopup');
    return {
      popupClass: popup.className,
      popupTop: popup.style.top,
      popupLeft: popup.style.left
    };
  });
  console.log('Result after dispatchEvent:', JSON.stringify(result, null, 2));
  
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: 'dispatch.png', fullPage: false });
  console.log('Screenshot saved');
  
  await browser.close();
})();
