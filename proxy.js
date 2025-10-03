// proxy.js (ESM)
import express from 'express';
import moment from 'moment-timezone';
import axios from 'axios';
import tough from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';

const app = express();
app.use(express.static('public'));

// ----- Config -----
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
];
const pickUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

const DEBUG_YF = process.env.DEBUG_YF === '1';
const FRESH_TTL_MS = parseInt(process.env.FRESH_TTL_MS || '60000', 10);      // 60s
const STALE_TTL_MS = parseInt(process.env.STALE_TTL_MS || '600000', 10);     // 10m
const MIN_INTERVAL_MS = parseInt(process.env.MIN_INTERVAL_MS || '10000', 10); // 10s to avoid rate limits

// ----- Axios + cookie jar (hosts) -----
const jar = new tough.CookieJar();
const baseHeaders = {
  'User-Agent': pickUA(),
  'Accept': 'application/json,text/plain,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Connection': 'keep-alive',
};

const http2 = wrapper(axios.create({ baseURL: 'https://query2.finance.yahoo.com', jar, withCredentials: true, timeout: 15000, headers: { ...baseHeaders } }));
const http1 = wrapper(axios.create({ baseURL: 'https://query1.finance.yahoo.com', jar, withCredentials: true, timeout: 15000, headers: { ...baseHeaders } }));
const httpPage = wrapper(axios.create({ baseURL: 'https://finance.yahoo.com', jar, withCredentials: true, timeout: 15000, headers: { ...baseHeaders } }));
const httpConsent = wrapper(axios.create({ baseURL: 'https://guce.yahoo.com', jar, withCredentials: true, timeout: 15000, headers: { ...baseHeaders } }));

// ----- Session and consent handling -----
let sessionReadyAt = 0;
const SESSION_TTL = 30 * 60 * 1000;
let sessionPromise = null;

async function ensureBaseSession() {
  const now = Date.now();
  if (now - sessionReadyAt < SESSION_TTL) return;
  if (!sessionPromise) {
    sessionPromise = (async () => {
      await http2.get('https://fc.yahoo.com', { headers: { 'User-Agent': http2.defaults.headers['User-Agent'], 'Accept-Language': 'en-US,en;q=0.9' }, timeout: 15000 });
      sessionReadyAt = Date.now();
      sessionPromise = null;
      if (DEBUG_YF) console.log('[yf] base session seeded');
    })().catch((e) => { sessionPromise = null; throw e; });
  }
  await sessionPromise;
}

const warmedSymbols = new Map();
const WARM_TTL = 30 * 60 * 1000;

async function warmSymbol(symbol) {
  const ts = warmedSymbols.get(symbol);
  if (ts && Date.now() - ts < WARM_TTL) return;
  await ensureBaseSession();
  const quoteResp = await httpPage.get(`/quote/${encodeURIComponent(symbol)}`, {
    headers: { 'User-Agent': httpPage.defaults.headers['User-Agent'], 'Accept-Language': 'en-US,en;q=0.9' },
    params: { guccounter: 1 },
    timeout: 15000,
    maxRedirects: 5,
  });
  if (quoteResp.request.res.responseUrl.includes('guce.yahoo.com')) {
    if (DEBUG_YF) console.log('[yf] Handling consent for', symbol);
    await httpConsent.post('/consent', new URLSearchParams({
      agree: 'agree',
      consentUUID: 'default',
      sessionId: 'default',
    }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  }
  warmedSymbols.set(symbol, Date.now());
  if (DEBUG_YF) console.log('[yf] warmed symbol:', symbol);
}

// ----- Rate gate -----
let lastCallAt = 0;
async function rateGate() {
  const now = Date.now();
  const wait = Math.max(0, lastCallAt + MIN_INTERVAL_MS - now);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastCallAt = Date.now();
}

// ----- Cache -----
const cache = new Map();
const setCache = (key, val) => cache.set(key, { val, ts: Date.now() });
const getFresh = (key) => {
  const rec = cache.get(key);
  return rec && (Date.now() - rec.ts <= FRESH_TTL_MS) ? rec.val : null;
};
const getStale = (key) => {
  const rec = cache.get(key);
  return rec && (Date.now() - rec.ts <= STALE_TTL_MS) ? rec.val : null;
};

// ----- Yahoo request with fallback -----
const sleep = ms => new Promise(r => setTimeout(r, ms));
const jitter = base => Math.floor(base * (0.8 + Math.random() * 0.4));

async function tryClient(client, path, params, refererSymbol, label, maxRetries = 5) {
  let attempt = 0;
  while (true) {
    try {
      const resp = await client.get(path, {
        params,
        headers: refererSymbol ? { Referer: `https://finance.yahoo.com/quote/${encodeURIComponent(refererSymbol)}/` } : undefined,
        validateStatus: () => true,
      });
      const ctype = String(resp.headers['content-type'] || '');
      if (ctype.includes('text/html') || typeof resp.data === 'string') throw new Error('Interstitial');
      if (resp.status >= 200 && resp.status < 300) return resp.data;
      const status = resp.status;
      if ((status === 429 || status === 403 || (status >= 500 && status < 600)) && attempt < maxRetries) {
        attempt++;
        if (status === 429 && attempt === 1) client.defaults.headers['User-Agent'] = pickUA();
        const backoff = jitter(2000 * 2 ** (attempt - 1)); // Longer backoff
        if (DEBUG_YF) console.warn(`[yf] ${label} ${path} ${status}, retry ${attempt} in ${backoff}ms`);
        await sleep(backoff);
        continue;
      }
      throw new Error(`Status ${status}`);
    } catch (err) {
      const status = err.response?.status || 500;
      if ((status === 429 || status === 403 || (status >= 500 && status < 600)) && attempt < maxRetries) {
        attempt++;
        if (status === 429 && attempt === 1) client.defaults.headers['User-Agent'] = pickUA();
        const backoff = jitter(2000 * 2 ** (attempt - 1));
        if (DEBUG_YF) console.warn(`[yf] ${label} ${path} ${status ?? 'ERR'}, retry ${attempt} in ${backoff}ms`);
        await sleep(backoff);
        continue;
      }
      throw err;
    }
  }
}

async function yahooGetWithFallback(path, params, options) {
  await rateGate();
  let data = await tryClient(http2, path, params, options.refererSymbol, 'q2');
  const isEmpty = d => !d || (d.quoteResponse && d.quoteResponse.result?.length === 0) || (d.chart && d.chart.result?.length === 0) || (d.quoteSummary && d.quoteSummary.result?.length === 0);
  if (!isEmpty(data)) return data;
  data = await tryClient(http1, path, params, options.refererSymbol, 'q1');
  return data;
}

// Helpers
async function yahooQuote(symbol) {
  await ensureBaseSession();
  await warmSymbol(symbol);
  return yahooGetWithFallback('/v7/finance/quote', { symbols: symbol, region: 'IN', lang: 'en-IN' }, { refererSymbol: symbol });
}

async function yahooQuoteSummary(symbol) {
  await ensureBaseSession();
  await warmSymbol(symbol);
  return yahooGetWithFallback('/v10/finance/quoteSummary', { symbol, modules: 'price', region: 'IN', lang: 'en-IN' }, { refererSymbol: symbol });
}

async function yahooChart(symbol, params) {
  await ensureBaseSession();
  await warmSymbol(symbol);
  return yahooGetWithFallback(`/v8/finance/chart/${encodeURIComponent(symbol)}`, { ...params, region: 'IN', lang: 'en-IN' }, { refererSymbol: symbol });
}

// Backup scraper fallback (using your ScraperAPI key for structured Yahoo data)
async function backupPreviousClose(symbol) {
  try {
    const resp = await axios.get(`https://api.scraperapi.com/structured/yahoo/quote?api_key=7da16db721b77d7b57cf053549527d12&symbol=${symbol}`);
    if (DEBUG_YF) console.log('[yf] Backup response:', resp.data);
    return resp.data.previousClose;
  } catch (e) {
    if (DEBUG_YF) console.error('[yf] Backup error:', e.message);
    throw new Error('Backup failed');
  }
}

// ----- Routes -----
app.get('/api/price', async (req, res) => {
  try {
    let symbol = String(req.query.symbol || '').trim();
    if (!symbol) return res.status(400).json({ error: 'Stock symbol is required' });
    if (!symbol.endsWith('.NS')) symbol += '.NS';

    const daysAgo = parseInt(String(req.query.daysAgo || '0'), 10);
    const key = `price:${symbol}:d:${daysAgo}`;

    const fresh = getFresh(key);
    if (fresh != null) return res.json({ previousClose: fresh, stale: false });

    let previousClose;
    let usedBackup = false;

    if (daysAgo === 0) {
      try {
        const qd = await yahooQuote(symbol);
        const q = qd?.quoteResponse?.result?.[0];
        if (q && q.regularMarketPreviousClose != null) {
          previousClose = q.regularMarketPreviousClose;
        } else {
          const sd = await yahooQuoteSummary(symbol);
          const s = sd?.quoteSummary?.result?.[0]?.price;
          if (s && (s.regularMarketPreviousClose?.raw ?? s.regularMarketPreviousClose) != null) {
            previousClose = s.regularMarketPreviousClose.raw ?? s.regularMarketPreviousClose;
          } else {
            const c = await yahooChart(symbol, { interval: '1d', range: '10d' });
            const r = c?.chart?.result?.[0];
            const closes = r?.indicators?.quote?.[0]?.close;
            const timestamps = r?.timestamp;
            if (!r || !closes || !timestamps || !closes.length) throw new Error('No data');
            const lastTs = timestamps[timestamps.length - 1];
            const lastDate = moment.unix(lastTs).tz('Asia/Kolkata');
            const now = moment().tz('Asia/Kolkata');
            const idx = (lastDate.isSame(now, 'day') && (now.hour() < 15 || (now.hour() === 15 && now.minute() < 30))) ? closes.length - 2 : closes.length - 1;
            if (idx < 0 || closes[idx] == null) throw new Error('No data');
            previousClose = closes[idx];
          }
        }
      } catch (e) {
        if (DEBUG_YF) console.error('[yf] Yahoo failed, trying backup:', e.message);
        try {
          previousClose = await backupPreviousClose(symbol);
          usedBackup = true;
        } catch (be) {
          const stale = getStale(key);
          if (stale != null) return res.json({ previousClose: stale, stale: true });
          return res.status(500).json({ error: 'Upstream error and backup failed' });
        }
      }
    } else {
      try {
        const c = await yahooChart(symbol, { interval: '1d', range: 'max' });
        const r = c?.chart?.result?.[0];
        const closes = r?.indicators?.quote?.[0]?.close;
        const timestamps = r?.timestamp;
        if (!r || !closes || !timestamps || !closes.length) throw new Error('No data');
        const idx = closes.length - 1 - daysAgo;
        if (idx < 0 || closes[idx] == null) throw new Error('Not enough history');
        previousClose = closes[idx];
      } catch (e) {
        const stale = getStale(key);
        if (stale != null) return res.json({ previousClose: stale, stale: true });
        return res.status(500).json({ error: 'Upstream error' });
      }
    }

    setCache(key, previousClose);
    res.json({ previousClose, stale: false, usedBackup });
  } catch (err) {
    if (DEBUG_YF) console.error('[yf] Internal error:', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

const PORT = process.env.PORT || 3005;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
