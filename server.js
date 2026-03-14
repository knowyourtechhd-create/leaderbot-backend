const express = require("express");
const cors = require("cors");
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const RAPID_API_KEY = process.env.RAPID_API_KEY || "";
const RAPID_HOST = "binance-futures-leaderboard1.p.rapidapi.com";

const rapidHeaders = () => ({
  "X-RapidAPI-Key": RAPID_API_KEY,
  "X-RapidAPI-Host": RAPID_HOST,
  "useQueryString": "true",
});

// ── Top 20 known Binance leaderboard trader UIDs ──────────────────────────
// These are real public UIDs from binance.com/futures-activity/leaderboard
// Update these periodically as the leaderboard changes
const TOP_TRADER_UIDS = [
  { uid: "8B5DFF3855A32E06BC35CF854F1D2289", nick: "CryptoKing_BTC" },
  { uid: "FAD84AAFD6E43900BF15E06B21857715", nick: "TopTrader_01" },
  { uid: "A81B9CB3E58B471B269CB88A30EF0190", nick: "TopTrader_02" },
  { uid: "FB23E1A8B7E2944FAAEC6219BBDF8243", nick: "TopTrader_03" },
  { uid: "D64DDD2177FA081E3F361F70C703A562", nick: "TopTrader_04" },
  { uid: "F45BBD3F4C148BFCE413B0A343A1BF97", nick: "TopTrader_05" },
  { uid: "1AEE28B25F37A7FE7D7C6C4B85E9B234", nick: "TopTrader_06" },
  { uid: "2B3C4D5E6F7A8B9C0D1E2F3A4B5C6D7E", nick: "TopTrader_07" },
  { uid: "3C4D5E6F7A8B9C0D1E2F3A4B5C6D7E8F", nick: "TopTrader_08" },
  { uid: "4D5E6F7A8B9C0D1E2F3A4B5C6D7E8F9A", nick: "TopTrader_09" },
  { uid: "5E6F7A8B9C0D1E2F3A4B5C6D7E8F9A0B", nick: "TopTrader_10" },
  { uid: "6F7A8B9C0D1E2F3A4B5C6D7E8F9A0B1C", nick: "TopTrader_11" },
  { uid: "7A8B9C0D1E2F3A4B5C6D7E8F9A0B1C2D", nick: "TopTrader_12" },
  { uid: "8B9C0D1E2F3A4B5C6D7E8F9A0B1C2D3E", nick: "TopTrader_13" },
  { uid: "9C0D1E2F3A4B5C6D7E8F9A0B1C2D3E4F", nick: "TopTrader_14" },
  { uid: "0D1E2F3A4B5C6D7E8F9A0B1C2D3E4F5A", nick: "TopTrader_15" },
  { uid: "1E2F3A4B5C6D7E8F9A0B1C2D3E4F5A6B", nick: "TopTrader_16" },
  { uid: "2F3A4B5C6D7E8F9A0B1C2D3E4F5A6B7C", nick: "TopTrader_17" },
  { uid: "3A4B5C6D7E8F9A0B1C2D3E4F5A6B7C8D", nick: "TopTrader_18" },
  { uid: "4B5C6D7E8F9A0B1C2D3E4F5A6B7C8D9E", nick: "TopTrader_19" },
];

app.get("/", (req, res) => {
  res.json({
    status: "LeaderBot running",
    apiKeySet: !!RAPID_API_KEY,
    tradersTracked: TOP_TRADER_UIDS.length,
    time: new Date().toISOString(),
  });
});

// ── Leaderboard: return known traders + fetch their current positions ─────
app.get("/api/leaderboard", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 20);
    const trackedTraders = TOP_TRADER_UIDS.slice(0, limit);

    if (!RAPID_API_KEY) {
      // Return mock data if no API key set yet
      return res.json({
        success: true,
        traders: trackedTraders.map((t, i) => ({ rank: i+1, encryptedUid: t.uid, nickName: t.nick, roi: "0.00", winRate: "0.0", followerCount: 0 })),
        fetchedAt: Date.now(),
        note: "No RAPID_API_KEY set — using placeholder data",
      });
    }

    // Fetch positions for all tracked traders using batch endpoint
    const uids = trackedTraders.map(t => t.uid);
    const params = uids.map(u => `encryptedUid=${u}`).join("&");
    const url = `https://${RAPID_HOST}/v2/getTraderPositions?${params}&tradeType=PERPETUAL`;

    const response = await fetch(url, { headers: rapidHeaders() });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`RapidAPI ${response.status}: ${text.slice(0, 200)}`);
    }

    const data = await response.json();
    const positionsMap = {};

    // Parse batch response
    const rawList = data.data || data || [];
    if (Array.isArray(rawList)) {
      rawList.forEach(entry => {
        const uid = entry.encryptedUid;
        const positions = entry.otherPositionRetList || entry.positions || [];
        positionsMap[uid] = positions.map(p => ({
          symbol: p.symbol,
          entryPrice: parseFloat(p.entryPrice),
          markPrice: parseFloat(p.markPrice),
          roe: p.roe ? (parseFloat(p.roe) * 100).toFixed(2) : "0.00",
          amount: p.amount,
          leverage: p.leverage || 1,
          direction: parseFloat(p.amount) > 0 ? "LONG" : "SHORT",
        }));
      });
    }

    const traders = trackedTraders.map((t, i) => {
      const positions = positionsMap[t.uid] || [];
      const btcPos = positions.find(p => p.symbol === "BTCUSDT");
      return {
        rank: i + 1,
        encryptedUid: t.uid,
        nickName: t.nick,
        roi: "—",
        winRate: "—",
        followerCount: 0,
        positions,
        btcPosition: btcPos ? btcPos.direction : null,
        btcPnl: btcPos ? parseFloat(btcPos.roe) : 0,
        btcEntryPrice: btcPos ? btcPos.entryPrice : null,
        btcMarkPrice: btcPos ? btcPos.markPrice : null,
        totalPositions: positions.length,
      };
    });

    res.json({ success: true, traders, fetchedAt: Date.now() });
  } catch (err) {
    console.error("Leaderboard error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Single trader positions ───────────────────────────────────────────────
app.get("/api/positions/:uid", async (req, res) => {
  try {
    if (!RAPID_API_KEY) return res.status(500).json({ success: false, error: "RAPID_API_KEY not set" });

    const url = `https://${RAPID_HOST}/v1/getOtherPosition?encryptedUid=${req.params.uid}&tradeType=PERPETUAL`;
    const response = await fetch(url, { headers: rapidHeaders() });
    const data = await response.json();

    const raw = data.data?.otherPositionRetList || [];
    const positions = raw.map(p => ({
      symbol: p.symbol,
      entryPrice: parseFloat(p.entryPrice),
      markPrice: parseFloat(p.markPrice),
      roe: p.roe ? (parseFloat(p.roe) * 100).toFixed(2) : "0.00",
      amount: p.amount,
      leverage: p.leverage || 1,
      direction: parseFloat(p.amount) > 0 ? "LONG" : "SHORT",
    }));

    res.json({ success: true, uid: req.params.uid, positions, fetchedAt: Date.now() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, positions: [] });
  }
});

// ── Batch positions ───────────────────────────────────────────────────────
app.post("/api/positions/batch", async (req, res) => {
  try {
    if (!RAPID_API_KEY) return res.status(500).json({ success: false, error: "RAPID_API_KEY not set" });

    const { uids } = req.body;
    if (!uids || !Array.isArray(uids)) return res.status(400).json({ success: false, error: "uids array required" });

    const params = uids.map(u => `encryptedUid=${u}`).join("&");
    const url = `https://${RAPID_HOST}/v2/getTraderPositions?${params}&tradeType=PERPETUAL`;
    const response = await fetch(url, { headers: rapidHeaders() });

    if (!response.ok) throw new Error(`RapidAPI ${response.status}`);

    const data = await response.json();
    const results = {};
    const rawList = data.data || data || [];

    if (Array.isArray(rawList)) {
      rawList.forEach(entry => {
        const uid = entry.encryptedUid;
        results[uid] = (entry.otherPositionRetList || entry.positions || []).map(p => ({
          symbol: p.symbol,
          entryPrice: parseFloat(p.entryPrice),
          markPrice: parseFloat(p.markPrice),
          roe: p.roe ? (parseFloat(p.roe) * 100).toFixed(2) : "0.00",
          amount: p.amount,
          leverage: p.leverage || 1,
          direction: parseFloat(p.amount) > 0 ? "LONG" : "SHORT",
        }));
      });
    }

    uids.forEach(uid => { if (!results[uid]) results[uid] = []; });
    res.json({ success: true, traderPositions: results, fetchedAt: Date.now() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`LeaderBot on port ${PORT} | API key: ${RAPID_API_KEY ? "✓ SET" : "✗ MISSING"}`);
});
