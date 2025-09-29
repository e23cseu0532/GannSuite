import express from "express";
import fetch from "node-fetch";
import moment from "moment-timezone";

const app = express();
app.use(express.static("public"));

// --- New Yahoo Authentication Logic ---

let yahooAuth = {
  cookie: null,
  crumb: null,
  lastUpdated: 0,
};

// Cache the auth details for 30 minutes
const CACHE_DURATION = 30 * 60 * 1000;

async function getYahooAuth() {
  const now = Date.now();
  if (now - yahooAuth.lastUpdated < CACHE_DURATION && yahooAuth.cookie && yahooAuth.crumb) {
    console.log("Using cached Yahoo auth details.");
    return yahooAuth;
  }

  console.log("Fetching new Yahoo auth details (cookie and crumb)...");
  try {
    // Step 1: Get the cookie by visiting a page that reliably sets cookies
    const cookieResponse = await fetch("https://fc.yahoo.com", {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
      }
    });

    let setCookie = cookieResponse.headers.raw()['set-cookie'];
    if (!setCookie || setCookie.length === 0) {
      throw new Error("Failed to get set-cookie header from Yahoo.");
    }

    // Step 2: Parse and filter only essential cookies to avoid header overflow
    // Include common Yahoo session cookies: A1, A1S, A3, B, GUC, etc.
    let cookie = setCookie
      .map(cookieStr => cookieStr.split(';')[0].trim())  // Take only the key=value part
      .filter(c => c.startsWith('A1=') || c.startsWith('A1S=') || c.startsWith('A3=') || c.startsWith('B=') || c.startsWith('GUC=') || c.startsWith('GUCS=') || c.startsWith('cmp='))
      .join('; ');

    if (!cookie) {
      throw new Error("No essential cookies found in set-cookie header.");
    }

    // Safeguard: If cookie string is too long, log and truncate (though filtering should prevent this)
    if (cookie.length > 8000) {
      console.warn(`Cookie string too long (${cookie.length} chars), truncating...`);
      cookie = cookie.substring(0, 8000);
    }

    // Step 3: Get the crumb using the filtered cookie
    const crumbResponse = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Cookie': cookie,
      }
    });

    if (!crumbResponse.ok) {
      throw new Error(`Crumb request failed with status ${crumbResponse.status}`);
    }

    const crumb = await crumbResponse.text();

    if (!crumb || crumb.length === 0) {
      throw new Error("Failed to extract crumb from Yahoo Finance.");
    }

    yahooAuth = {
      cookie,
      crumb,
      lastUpdated: now,
    };

    console.log("Successfully fetched new Yahoo auth details.");
    return yahooAuth;
  } catch (error) {
    console.error("Error getting Yahoo auth:", error.message, error.stack);
    // Invalidate cache on failure
    yahooAuth.lastUpdated = 0;
    throw error; // Re-throw to be caught by the route handler
  }
}

async function fetchWithYahooAuth(url) {
  const { cookie, crumb } = await getYahooAuth();
  const finalUrl = `${url}&crumb=${encodeURIComponent(crumb)}`;

  return fetch(finalUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Cookie': cookie,
    }
  });
}

// --- API Routes Updated to Use New Auth Logic ---

app.get("/api/price", async (req, res) => {
  let symbol = req.query.symbol;
  if (!symbol) {
    return res.status(400).json({ error: "Stock symbol is required" });
  }
  if (!symbol.endsWith(".NS")) {
    symbol += ".NS";
  }
  const daysAgo = parseInt(req.query.daysAgo || "0");

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=10d`;
    const response = await fetchWithYahooAuth(url);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Yahoo API Error for ${symbol}:`, response.status, errorText);
      return res.status(response.status).json({ error: `Failed to fetch data from Yahoo Finance: ${response.statusText}` });
    }

    const data = await response.json();

    const result = data.chart?.result?.[0];
    if (!result) {
      return res.status(404).json({ error: "No data for symbol: " + symbol });
    }

    const closes = result.indicators?.quote?.[0]?.close;
    const timestamps = result.timestamp;

    if (!closes || !timestamps || closes.length === 0) {
      return res.status(404).json({ error: "No price data available" });
    }

    const lastTs = timestamps[timestamps.length - 1];
    const lastDate = moment.unix(lastTs).tz("Asia/Kolkata");
    const now = moment().tz("Asia/Kolkata");

    let indexToUse;

    if (
      lastDate.isSame(now, "day") &&
      (now.hour() < 15 || (now.hour() === 15 && now.minute() < 30))
    ) {
      indexToUse = closes.length - 2 - daysAgo;
    } else {
      indexToUse = closes.length - 1 - daysAgo;
    }

    if (indexToUse < 0 || closes[indexToUse] == null) {
      return res.status(404).json({ error: `Not enough history to get ${daysAgo} days ago.` });
    }

    const previousClose = closes[indexToUse];

    res.json({ previousClose });
  } catch (error) {
    console.error(`Fetch error for ${symbol}:`, error.message, error.stack);
    res.status(500).json({ error: `Internal server error: ${error.message}` });  // Include error message for debugging
  }
});

app.get("/api/yahoo-chart", async (req, res) => {
  const symbol = req.query.symbol;
  if (!symbol) {
    return res.status(400).json({ error: "Stock symbol is required" });
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=5d`;
    const response = await fetchWithYahooAuth(url);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Yahoo API Error for ${symbol}:`, response.status, errorText);
      return res.status(response.status).json({ error: `Failed to fetch data from Yahoo Finance: ${response.statusText}` });
    }

    const data = await response.json();

    const result = data.chart?.result?.[0];
    if (!result) {
      return res.status(404).json({ error: "No data for symbol: " + symbol });
    }

    const meta = result.meta;
    const closes = result.indicators?.quote?.[0]?.close;
    const timestamps = result.timestamp;

    if (!closes || closes.length === 0 || !timestamps) {
      return res.status(404).json({ error: "No price data available" });
    }

    const latestClose = closes[closes.length - 1];

    res.json({
      meta,
      closes,
      timestamps,
      latestClose,
    });
  } catch (err) {
    console.error(`Yahoo fetch error for ${symbol}:`, err.message, err.stack);
    res.status(500).json({ error: `Internal server error: ${err.message}` });  // Include error message for debugging
  }
});

const PORT = 3005;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
