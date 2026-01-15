import { test } from '@playwright/test';

test('debug analytics test page failures', async ({ page }) => {
  // Capture all console messages
  const logs: string[] = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  
  await page.goto('/analytics');
  
  // Wait for tests to complete
  await page.waitForTimeout(4000);
  
  // Get detailed results from the test page
  const results = await page.evaluate(() => {
    // Find test result rows
    const rows = document.querySelectorAll('div[style*="display: flex"]');
    const testResults: Array<{status: string, name: string, message: string}> = [];
    
    rows.forEach(row => {
      const text = row.textContent || '';
      if (text.includes('✓') || text.includes('✗') || text.includes('◌')) {
        const status = text.includes('✓') ? 'PASS' : text.includes('✗') ? 'FAIL' : 'PENDING';
        // Extract name and message
        const spans = row.querySelectorAll('span');
        if (spans.length >= 2) {
          testResults.push({
            status,
            name: spans[1]?.textContent?.trim() || '',
            message: spans[2]?.textContent?.trim() || ''
          });
        }
      }
    });
    return testResults;
  });
  
  console.log('\n=== Analytics Test Page Results ===');
  for (const r of results) {
    console.log(`${r.status}: ${r.name} - ${r.message}`);
  }
  
  console.log('\n=== Browser Console Logs (analytics-related) ===');
  for (const log of logs) {
    if (log.toLowerCase().includes('analytics') || log.toLowerCase().includes('agentuity') || log.toLowerCase().includes('error')) {
      console.log(log);
    }
  }
});
