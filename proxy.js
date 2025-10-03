import express from 'express';
import fetch from 'node-fetch';
import moment from 'moment-timezone';

const app = express();
app.use(express.static('public'));

// Simple cache
const cache = new Map();
const CACHE_TTL = 120000; // 2 minutes

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

    // Fetch from Yahoo (using query1 which works better)
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=max`;
    console.log(`Fetching from Yahoo: ${url}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`Yahoo API error: ${response.status} ${response.statusText}`);
      return res.status(500).json({ error: 'Failed to fetch data from Yahoo Finance' });
    }

    const data = await response.json();
    const result = data.chart?.result?.[0];
    
    if (!result) {
      console.error('No result from Yahoo');
      return res.status(404).json({ error: 'No data for symbol: ' + symbol });
    }

    const closes = result.indicators?.quote?.[0]?.close;
    const timestamps = result.timestamp;

    if (!closes || !timestamps || closes.length === 0) {
      console.error('No price data in response');
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
