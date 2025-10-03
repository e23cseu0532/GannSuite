import express from 'express';
import { NseIndia } from 'stock-nse-india';
import moment from 'moment-timezone';

const app = express();
app.use(express.static('public'));

// Initialize NSE India API
const nseIndia = new NseIndia();

// Cache with extended TTL
const cache = new Map();
const CACHE_TTL = 300000; // 5 minutes

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

// Rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 3000; // 3 seconds

async function rateLimit() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  lastRequestTime = Date.now();
}

app.get('/api/price', async (req, res) => {
  try {
    let symbol = req.query.symbol;
    if (!symbol) {
      return res.status(400).json({ error: 'Stock symbol is required' });
    }
    
    // Remove .NS suffix if present
    if (symbol.endsWith('.NS')) {
      symbol = symbol.replace('.NS', '');
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

    console.log(`Fetching data for ${symbol} from NSE India...`);

    // Calculate date range for historical data
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (daysAgo + 30)); // Get extra days for safety

    const range = {
      start: startDate,
      end: endDate
    };

    // Fetch historical data from NSE
    const historicalData = await nseIndia.getEquityHistoricalData(symbol, range);
    
    if (!historicalData || historicalData.length === 0) {
      console.error(`No data found for ${symbol}`);
      return res.status(404).json({ error: 'No data available for symbol' });
    }

    // Sort data by date (newest first)
    historicalData.sort((a, b) => new Date(b.CH_TIMESTAMP) - new Date(a.CH_TIMESTAMP));

    // Determine which close price to use
    const now = moment().tz('Asia/Kolkata');
    const latestDate = moment(historicalData[0].CH_TIMESTAMP).tz('Asia/Kolkata');

    let indexToUse;
    
    // If latest data is from today and market hasn't closed, use previous day
    if (latestDate.isSame(now, 'day') && (now.hour() < 15 || (now.hour() === 15 && now.minute() < 30))) {
      indexToUse = 1 + daysAgo;
    } else {
      indexToUse = daysAgo;
    }

    if (indexToUse >= historicalData.length) {
      return res.status(404).json({ error: `Not enough history to get ${daysAgo} days ago` });
    }

    const previousClose = parseFloat(historicalData[indexToUse].CH_CLOSING_PRICE);
    
    // Cache the result
    setCache(cacheKey, previousClose);
    console.log(`Successfully fetched and cached ${cacheKey}: ${previousClose}`);

    res.json({ previousClose, stale: false });
  } catch (error) {
    console.error('Fetch error:', error.message);
    
    // Check if we have stale cache to return
    const cacheKey = `${req.query.symbol}:${req.query.daysAgo || '0'}`;
    const staleCache = cache.get(cacheKey);
    if (staleCache) {
      console.log(`Returning stale cache for ${cacheKey} due to error`);
      return res.json({ previousClose: staleCache.value, stale: true });
    }
    
    res.status(500).json({ error: 'Failed to fetch stock data' });
  }
});

const PORT = process.env.PORT || 3005;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
