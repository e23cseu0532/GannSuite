import express from 'express';
import fetch from 'node-fetch';
import moment from 'moment-timezone';

const app = express();
app.use(express.static('public'));

// ScraperAPI key (you already have this)
const SCRAPER_API_KEY = '7da16db721b77d7b57cf053549527d12';

// Cache
const cache = new Map();
const CACHE_TTL = 180000; // 3 minutes

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

    // Check cache
    const cached = getCache(cacheKey);
    if (cached !== null) {
      console.log(`Cache hit for ${cacheKey}`);
      return res.json({ previousClose: cached, stale: false });
    }

    // Use ScraperAPI to proxy Yahoo Finance request
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=max`;
    const scraperUrl = `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(yahooUrl)}`;
    
    console.log(`Fetching ${symbol} via ScraperAPI...`);
    
    const response = await fetch(scraperUrl);
    
    if (!response.ok) {
      console.error(`ScraperAPI error: ${response.status}`);
      return res.status(500).json({ error: 'Failed to fetch data' });
    }

    const data = await response.json();
    const result = data.chart?.result?.[0];
    
    if (!result) {
      console.error('No result from Yahoo');
      return res.status(404).json({ error: 'No data for symbol' });
    }

    const closes = result.indicators?.quote?.[0]?.close;
    const timestamps = result.timestamp;

    if (!closes || !timestamps || closes.length === 0) {
      console.error('No price data');
      return res.status(404).json({ error: 'No price data available' });
    }

    // Determine which close to use
    const lastTs = timestamps[timestamps.length - 1];
    const lastDate = moment.unix(lastTs).tz('Asia/Kolkata');
    const now = moment().tz('Asia/Kolkata');

    let indexToUse;
    if (lastDate.isSame(now, 'day') && (now.hour() < 15 || (now.hour() === 15 && now.minute() < 30))) {
      indexToUse = closes.length - 2 - daysAgo;
    } else {
      indexToUse = closes.length - 1 - daysAgo;
    }

    if (indexToUse < 0 || closes[indexToUse] == null) {
      return res.status(404).json({ error: `Not enough history` });
    }

    const previousClose = closes[indexToUse];
    
    setCache(cacheKey, previousClose);
    console.log(`Successfully cached ${cacheKey}: ${previousClose}`);

    res.json({ previousClose, stale: false });
  } catch (error) {
    console.error('Fetch error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3005;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
