import express from 'express';
import fetch from 'node-fetch';
import moment from 'moment-timezone';

const app = express();
app.use(express.static('public'));

// Cache with TTL
const cache = new Map();
const CACHE_TTL = 120000; // 2 minutes (cache results longer)

function getCache(key) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.value;
  }
  return null;
}

function setCache(key, value) {
  cache.set(key, { value, timestamp: Date.now() });
}

// Rate limiting - minimum 2 seconds between requests
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 2000; // 2 seconds

async function rateLimit() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  lastRequestTime = Date.now();
}

// User-Agent rotation
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

app.get('/api/price', async (req, res) => {
  try {
    let symbol = req.query.symbol;
    if (!symbol) {
      return res.status(400).json({ error: 'Stock symbol is required' });
    }
    
    if (!symbol.endsWith('.NS')) {
      symbol += '.NS';
    }

    const daysAgo = parseInt(req.query.daysAgo || '0', 10);
    const cacheKey = `${symbol}:${daysAgo}`;

    // Check cache first
    const cached = getCache(cacheKey);
    if (cached !== null) {
      console.log(`Cache hit for ${cacheKey}`);
      return res.json({ previousClose: cached, stale: false });
    }

    // Rate limit before making request
    await rateLimit();

    // Fetch from Yahoo with User-Agent
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=max`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://finance.yahoo.com/',
        'Origin': 'https://finance.yahoo.com'
      }
    });
    
    if (!response.ok) {
      console.error(`Yahoo API error: ${response.status} ${response.statusText}`);
      
      // If rate limited, return cached value if available (even if stale)
      if (response.status === 429) {
        const staleCache = cache.get(cacheKey);
        if (staleCache) {
          console.log(`Returning stale cache due to rate limit for ${cacheKey}`);
          return res.json({ previousClose: staleCache.value, stale: true });
        }
      }
      
      return res.status(500).json({ error: 'Failed to fetch data from Yahoo Finance' });
    }

    const data = await response.json();
    const result = data.chart?.result?.[0];
    
    if (!result) {
      return res.status(404).json({ error: 'No data for symbol: ' + symbol });
    }

    const closes = result.indicators?.quote?.[0]?.close;
    const timestamps = result.timestamp;

    if (!closes || !timestamps || closes.length === 0) {
      return res.status(404).json({ error: 'No price data available' });
    }

    // Determine which close price to use
    const lastTs = timestamps[timestamps.length - 1];
    const lastDate = moment.unix(lastTs).tz('Asia/Kolkata');
    const now = moment().tz('Asia/Kolkata');

    let indexToUse;
    
    // If last candle is today and market not closed yet, use previous day
    if (lastDate.isSame(now, 'day') && (now.hour() < 15 || (now.hour() === 15 && now.minute() < 30))) {
      indexToUse = closes.length - 2 - daysAgo;
    } else {
      indexToUse = closes.length - 1 - daysAgo;
    }

    if (indexToUse < 0 || closes[indexToUse] == null) {
      return res.status(404).json({ error: `Not enough history to get ${daysAgo} days ago` });
    }

    const previousClose = closes[indexToUse];
    
    // Cache the result
    setCache(cacheKey, previousClose);
    console.log(`Successfully fetched and cached ${cacheKey}: ${previousClose}`);

    res.json({ previousClose, stale: false });
  } catch (error) {
    console.error('Fetch error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3005;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
