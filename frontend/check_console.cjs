const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  
  await page.goto('http://localhost:5174/login', { waitUntil: 'networkidle2' });
  
  // Try to login to get to dashboard
  await page.type('input[placeholder="Email or Username"]', 'levi2');
  await page.type('input[placeholder="Password"]', 'P@##WORD*');
  
  await page.click('button[type="submit"]');
  
  await page.waitForTimeout(2000);
  
  console.log('Finished. Closing browser.');
  await browser.close();
})();
