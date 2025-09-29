document.addEventListener("DOMContentLoaded", () => {
    // --- Theme Toggler ---
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) {
        document.body.classList.remove("light", "dark");
        document.body.classList.add(savedTheme);
    }
    const toggleButton = document.getElementById("toggleTheme");
    if (toggleButton) {
        toggleButton.addEventListener("click", () => {
            const icon = toggleButton.querySelector(".theme-icon");
            if (document.body.classList.contains("light")) {
                document.body.classList.remove("light");
                document.body.classList.add("dark");
                localStorage.setItem("theme", "dark");
                icon.textContent = "🌙";
            } else {
                document.body.classList.remove("dark");
                document.body.classList.add("light");
                localStorage.setItem("theme", "light");
                icon.textContent = "🌞";
            }
            icon.style.transform = "rotate(360deg)";
            setTimeout(() => {
                icon.style.transform = "rotate(0deg)";
            }, 600);
        });
    }

    // --- Stock Symbol Autocomplete ---
    const stockList = ["RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK","SBIN","KOTAKBANK","AXISBANK","BAJFINANCE","BAJAJFINSV",
    "HCLTECH","TECHM","WIPRO","LT","HINDUNILVR","ITC","BHARTIARTL","SUNPHARMA","DIVISLAB","CIPLA",
    "ASIANPAINT","ULTRACEMCO","SHREECEM","GRASIM","TATASTEEL","JSWSTEEL","HINDALCO","ONGC","NTPC","POWERGRID",
    "COALINDIA","IOC","BPCL","GAIL","ADANIPORTS","ADANIGREEN","ADANIPOWER","ADANITRANS","MARUTI","M&M",
    "HEROMOTOCO","BAJAJ_AUTO","TATAMOTORS","EICHERMOT","TVSMOTOR","BRITANNIA","NESTLEIND","DABUR","HAVELLS",
    "PIDILITIND","BERGEPAINT","TRENT","DMART","UBL","MCDOWELL_N","TITAN","PEL","HDFCLIFE","ICICIPRULI",
    "SBILIFE","BAJAJHLDNG","HDFC","LICHSGFIN","PNB","IDFCFIRSTB","FEDERALBNK","BANKBARODA","CANBK","INDUSINDBK",
    "YESBANK","BANDHANBNK","CHOLAFIN","MUTHOOTFIN","MANAPPURAM","L&TFH","RECLTD","POWERFIN","IRCTC","INDIGO",
    "INTERGLOBE","ZOMATO","PAYTM","NYKAA","TATACHEM","TATAELXSI","MPHASIS","LTI","LTTS","MINDTREE","COFORGE",
    "PERSISTENT","KPITTECH","AFFLE","POLYCAB","KEI","VOLTAS","BLUESTARCO","CROMPTON","ABB","SIEMENS","BHEL",
    "BEL","HAL","BDL","IRCON","RVNL","IRFC","RITES","NBCC","NATIONALUM","HINDCOPPER","MOIL","NMDC",
    "ONGC","OIL","PETRONET","INDRAPRA","IGL","MGL","APOLLOHOSP","FORTIS","NARAYANA","MAXHEALTH","METROPOLIS",
    "DRREDDY","AUROPHARMA","BIOCON","GLENMARK","LUPIN","CADILAHC","ALKEM","IPCALAB","TORNTPHARM","PFIZER",
    "ABBOTINDIA","ASTRAL","APLAPOLLO","JINDALSTEL","TATAPOWER","NHPC","SJVN","CESC","ADANITOTAL","ADANIWILMAR",
    "HINDPETRO","MRPL","SUPREMEIND","FINCABLES","HONAUT","RAJESHEXPO","RELAXO","BATAINDIA","VGUARD",
    "PAGEIND","TCNSBRANDS","ADVENZYMES","AARTIIND","DEEPAKNTR","BALRAMCHIN","DHAMPURSUG","TRIVENI","BAJAJHIND",
    "DCMSHRIRAM","EIDPARRY","TATACONSUM","MARICO","GODREJCP","EMAMILTD","COLPAL","HATSUN","HERITGFOOD",
    "PARAGMILK","VARUNBEV","RADICO","UNITDSPR","UBL","SULA","AMARAJABAT","EXIDEIND","HBLPOWER","SCHAEFFLER",
    "SKFINDIA","TIMKEN","GODREJPROP","OBEROIRLTY","LODHA","BRIGADE","PHOENIXLTD","SOBHA","PRESTIGE","DLF",
    "IBREALEST","PNBHOUSING","CANFINHOME","HUDCO","LICHSGFIN","INDIABULLS","GRANULES","LAURUSLABS",
    "SYNGENE","DIVISLAB","SUNPHARMA","TORNTPHARM","GLAND","JBMA","JUBLFOOD","BURGERKING","WESTLIFE","RESTAURNT",
    "SPARC","ZEE","ZEEL","SUNTV","TVTODAY","TV18BRDCST","PVRINOX","INOXLEISUR","NAVINFLUOR","SRF",
    "FLUOROCHEM","TATAMETALI","SANDHAR","SHANTIGEAR","GMM","HINDZINC","GUJGASLTD","MGL","IGL","IGPL",
    "ORIENTELEC","EIHOTEL","INDHOTEL","CHOLAHLDNG","APLLTD","KECL","VARROC","SUNDRMFAST","ENDURANCE",
    "MOTHERSON","BHARATFORG","RCF","GNFC","GSFC","COROMANDEL","FACT","NFL","GODREJAGRO","JUBLINGREA",
    "JINDALSAW","JSWHL","MAHLOG","BLUEDART","VRLLOG","MASTEK","OFSS","RBLBANK","SOUTHBANK","KARURVYSYA",
    "CSBBANK","DCBBANK","UJJIVANSFB","EQUITASBNK","CUB","IDBI","SYNDIBANK","ALLAHABAD","UNIONBANK","CENTRALBK",
    "IOB","UCOBANK","J&KBANK","SHRIRAMCIT","SHRIRAMFIN","BAJAJCON","GODFRYPHLP","RAJESHEXPO","ASTERDM",
    "LALPATHLAB","METROPOLIS","SWSOLAR","BORORENEW","KPIGREEN","WEBELSOLAR","SOLARINDS","SFL","PRINCEPIPE",
    "NILKAMAL","CERA","GREENPANEL","GREENPLY","CENTURYPLY","SAIL","TATASTEEL","JINDALSTEL","JSWSTEEL",
    "HINDZINC","VEDL","NATIONALUM","MOIL","NMDC","HINDCOPPER","MANAPPURAM","MUTHOOTFIN","CHOLAFIN","SREIINFRA",
    "RECLTD","POWERFIN","IDFC","IFCI","MOTILALOFS","EDELWEISS","JMFINANCIL","IIFL","GEPL","ANGELONE","ZERODHA"];

    const symbolInput = document.getElementById("symbolInput");
    const suggestionBox = document.getElementById("suggestions");
    const clearButton = document.querySelector(".clear-button");

    if (symbolInput && clearButton) {
        clearButton.addEventListener("click", () => {
            symbolInput.value = "";
            symbolInput.focus();
            if (suggestionBox) {
                suggestionBox.innerHTML = "";
                suggestionBox.classList.remove("show");
            }
        });
    }

    if (symbolInput && suggestionBox) {
        symbolInput.addEventListener("input", () => {
            const query = symbolInput.value.toUpperCase();
            suggestionBox.innerHTML = "";
            if (!query) {
                suggestionBox.classList.remove("show");
                return;
            }
            const filtered = stockList.filter(sym => sym.startsWith(query)).slice(0, 10);
            filtered.forEach(sym => {
                const li = document.createElement("li");
                li.textContent = sym;
                li.classList.add("suggestion-item");
                li.onclick = () => {
                    symbolInput.value = sym;
                    suggestionBox.innerHTML = "";
                    suggestionBox.classList.remove("show");
                };
                suggestionBox.appendChild(li);
            });
            if (filtered.length) {
                suggestionBox.classList.add("show");
            } else {
                suggestionBox.classList.remove("show");
            }
        });
        symbolInput.addEventListener("blur", () => {
            setTimeout(() => {
                suggestionBox.classList.remove("show");
            }, 150);
        });
    }

    // --- Gann Level Generation ---
    const generateBtn = document.getElementById("generateLevels");
    if (generateBtn) {
        generateBtn.addEventListener("click", async () => {
            const symbolRaw = document.getElementById("symbolInput").value.trim();
            if (!symbolRaw) {
                alert("Please enter a stock symbol.");
                return;
            }
            const dayOffset = parseInt(document.getElementById("daySelector").value || "0");
            document.getElementById("loader").style.display = "flex";
            document.getElementById("levelsTable").innerHTML = '';
            document.getElementById("stockInfo").style.display = 'none';

            try {
                const res = await fetch(`/api/price?symbol=${encodeURIComponent(symbolRaw)}&daysAgo=${dayOffset}`);
                if (!res.ok) {
                    throw new Error(`API request failed with status ${res.status}`);
                }
                const data = await res.json();
                if (data.error) {
                    alert("Error: " + data.error);
                    return;
                }
                // --- Gann Table Logic (3 columns, color, rounding) ---
                const close = data.previousClose;
                const step = parseFloat(document.getElementById("stepSelect").value);
                const r = Math.sqrt(close);

                // Angle step depends on step size
                let angleStep = step === 0.25 ? 22.5 : 11.25;

                let tableContent = `
                    <thead>
                        <tr>
                            <th>Level</th>
                            <th>Value</th>
                            <th>Angle</th>
                        </tr>
                    </thead>
                    <tbody>`;

                for (let k = 1; k <= 19; k++) {
                    let value;
                    let angle = ((k - 10) * angleStep);
                    if (angle < 0) angle = 360 + angle;
                    angle = angle % 360;

                    // Base price at level 10, rounded to 2 decimals
                    if (k === 10) {
                        value = close;
                        value = Math.round(value * 100) / 100;
                    } else {
                        value = Math.pow(r + step * (k - 10), 2);
                        value = Math.round(value * 100) / 100;
                    }

                    // Color coding
                    let rowClass = "";
                    if (k === 10) {
                        rowClass = "level-base";
                    } else if (k === 8 || k === 12) {
                        rowClass = "level-gold";
                    } else if (k % 2 === 0) {
                        rowClass = "level-purple";
                    } else {
                        rowClass = "level-grey";
                    }

                    tableContent += `
                        <tr class="${rowClass}">
                            <td>${k}</td>
                            <td>${value.toFixed(2)}</td>
                            <td>${angle.toFixed(1)}°</td>
                        </tr>`;
                }
                tableContent += `</tbody>`;
                document.getElementById("levelsTable").innerHTML = tableContent;

                // Update and show stock info
                const stockInfoDiv = document.getElementById("stockInfo");
                const currentPriceSpan = document.getElementById("currentPrice");
                const tradingViewButton = document.getElementById("viewOnTradingView");

                currentPriceSpan.textContent = `₹${close}`;
                tradingViewButton.onclick = () => {
                    const tvUrl = `https://www.tradingview.com/symbols/NSE-${symbolRaw.toUpperCase()}/`;
                    window.open(tvUrl, "_blank");
                };
                stockInfoDiv.style.display = "flex";
            } catch (err) {
                alert("An unexpected error occurred. Please check the stock symbol and try again.");
                console.error(err);
            } finally {
                document.getElementById("loader").style.display = "none";
            }
        });
    }

    // --- Page Transitions ---
    document.querySelectorAll("a").forEach(link => {
        link.addEventListener("click", (e) => {
            const url = new URL(link.href);
            if (url.origin === window.location.origin) {
                e.preventDefault();
                const container = document.querySelector(".page-transition");
                if (container) {
                    container.classList.add("exit");
                    setTimeout(() => {
                        window.location.href = link.href;
                    }, 400);
                }
            }
        });
    });
});
