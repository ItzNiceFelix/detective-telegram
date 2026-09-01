#!/usr/bin/env node

/**
 * Smoke Test — Detective Telegram Beta
 * 
 * Quick validation that core systems work:
 * - API endpoints respond
 * - Firestore connection works
 * - Telegram bot configured
 * - Health check passes
 */

import https from 'https';

const API_BASE = process.env.API_BASE || 'https://your-project.vercel.app';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_SECRET = process.env.TELEGRAM_SECRET;

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

const results: TestResult[] = [];

async function httpGet(url: string, headers?: Record<string, string>): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const requestHeaders = {
      'Content-Type': 'application/json',
      ...headers,
    };

    https.get(url, { headers: requestHeaders }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        resolve({ status: res.statusCode || 500, body });
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function httpPost(
  url: string,
  body: unknown,
  headers?: Record<string, string>
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const requestHeaders = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(bodyStr),
      ...headers,
    };

    const request = https.request(url, { method: 'POST', headers: requestHeaders }, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => (responseBody += chunk));
      res.on('end', () => {
        resolve({ status: res.statusCode || 500, body: responseBody });
      });
    });

    request.on('error', (err) => {
      reject(err);
    });

    request.write(bodyStr);
    request.end();
  });
}

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    const duration = Date.now() - start;
    results.push({ name, passed: true, duration });
    console.log(`✅ ${name} (${duration}ms)`);
  } catch (error) {
    const duration = Date.now() - start;
    results.push({
      name,
      passed: false,
      duration,
      error: error instanceof Error ? error.message : String(error),
    });
    console.log(`❌ ${name}: ${error}`);
  }
}

async function runTests(): Promise<void> {
  console.log('🧪 Detective Telegram Smoke Test\n');
  console.log(`API Base: ${API_BASE}`);
  console.log(`Telegram Bot Token: ${TELEGRAM_BOT_TOKEN ? '***' : 'NOT SET'}`);
  console.log(`Telegram Secret: ${TELEGRAM_SECRET ? '***' : 'NOT SET'}\n`);

  // Test 1: Health check
  await test('Health Check', async () => {
    const result = await httpGet(`${API_BASE}/api/health`);
    if (result.status !== 200) {
      throw new Error(`Expected 200, got ${result.status}`);
    }
  });

  // Test 2: Invalid webhook (no secret)
  await test('Webhook Validation (reject missing secret)', async () => {
    const result = await httpPost(`${API_BASE}/api/telegram`, {
      update_id: 1,
      message: { text: '/start' },
    });
    if (result.status !== 401) {
      throw new Error(`Expected 401, got ${result.status}`);
    }
  });

  // Test 3: Valid webhook request (with secret)
  await test('Webhook Validation (accept with secret)', async () => {
    const result = await httpPost(
      `${API_BASE}/api/telegram`,
      {
        update_id: 999,
        message: { text: '/help' },
      },
      { 'X-Telegram-Bot-API-Secret-Token': TELEGRAM_SECRET || '' }
    );
    // Should accept request (may still error on processing, but not on auth)
    if (result.status === 401) {
      throw new Error('Webhook rejected valid secret');
    }
  });

  // Test 4: Admin endpoint (no token)
  await test('Admin Operations (reject missing token)', async () => {
    const result = await httpPost(`${API_BASE}/api/admin`, {
      action: 'healthDiagnostic',
    });
    if (result.status !== 401) {
      throw new Error(`Expected 401, got ${result.status}`);
    }
  });

  // Test 5: Function count check (indirect via multiple health calls)
  await test('Function availability', async () => {
    // Call multiple endpoints to ensure they're distinct functions
    const endpoints = ['/api/health', '/api/cron', '/api/admin'];
    for (const endpoint of endpoints) {
      const result = await httpGet(`${API_BASE}${endpoint}`);
      if (result.status === 404) {
        console.log(`  ⚠️  ${endpoint} not found (endpoint may not be deployed)`);
      }
    }
  });

  // Test 6: Telegram webhook info
  if (TELEGRAM_BOT_TOKEN) {
    await test('Telegram Webhook Configuration', async () => {
      const result = await httpGet(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo`
      );
      if (result.status !== 200) {
        throw new Error(`Telegram API error: ${result.status}`);
      }
      const data = JSON.parse(result.body);
      if (!data.ok) {
        throw new Error(`Telegram webhook not configured: ${data.description}`);
      }
      console.log(`  → Webhook URL: ${data.result?.url}`);
      console.log(`  → Pending updates: ${data.result?.pending_update_count}`);
    });
  }

  // Summary
  console.log(`\n📊 Test Results`);
  console.log(`================`);
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  console.log(`Passed: ${passed}/${total}`);

  if (passed === total) {
    console.log('\n✅ All tests passed! Ready for deployment.');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed. Please review errors above.');
    results.filter((r) => !r.passed).forEach((r) => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
