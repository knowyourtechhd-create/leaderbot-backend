const express = require("express");
const cors = require("cors");
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const RAPID_API_KEY = process.env.RAPID_API_KEY || "";
const RAPID_API_HOST = "binance-futures-leaderboard1.p.rapidapi.com";
const RAPID_BASE = `https://${RAPID_API_HOST}`;

const rapidHeaders = {
  "X-RapidAPI-Key": RAPID_API_KEY,
  "X-RapidAPI-Host": RAPID_API_HOST,
};

app.get("/", (req, res) => {
  res.json({
    status: "LeaderBot backend running",
    apiKeySet: !!RAPID_API_KEY,
    time: new Date().toISOString(),
  });
});

// ── Leaderboard ────────────────────────────────────────────────────────────
app.get("/api/leaderboard", async (req, res) => {
  try {
    if (!RAPID_API_KEY) {
      return res.status(500).json({ success: false, error: "RAPID_API_KEY not set in environment variables" });
    }

    const limit = Math.min(parseInt(req.query.limit) || 20, 20);
    const periodType = req.query.period || "DAILY";
    const sortType = req.query.sort || "ROI";

    const url = `${RAPID_BASE}/v2/getLeaderboard?tradeType=PERPETUAL&periodType=${periodType}&sortType=${sortType}&limit=${limit}`;

    const response = await fetch(url, { headers: rapidHeaders });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`RapidAPI ${response.status}: ${text.slice(0, 200)}`);
    }

    const data = await response.json();

    // RapidAPI returns data.data array
    const raw = data.data || data || [];
    const traders = raw.slice(0, limit).map((t, i) => ({
      rank: i + 1,
      encryptedUid: t.encryptedUid,
      nickName: t.nickName || `Trader_${i + 1}`,
      roi: t.roiValue !== undefined ? parseFloat(t.roiValue).toFixed(2) : (t.roi ? (t.roi * 100).toFixed(2) : "0.00"),
      pnl: t.pnlValue !== undefined ? parseFloat(t.pnlValue).toFixed(2) : "0.00",
      winRate: t.winRate ? (t.winRate * 100).toFixed(1) : "0.0",
      followerCount: t.followerCount || 0,
      positionShared: t.positionShared || false,
    }));

    res.json({ success: true, traders, fetchedAt: Date.now() });
  } catch (err) {
    console.error("Leaderboard error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Single trader positions ────────────────────────────────────────────────
app.get("/api/positions/:uid", async (req, res) => {
  try {
    if (!RAPID_API_KEY) {
      return res.status(500).json({ success: false, error: "RAPID_API_KEY not set" });
    }

    const url = `${RAPID_BASE}/v1/getOtherPosition?encryptedUid=${req.params.uid}&tradeType=PERPETUAL`;
    const response = await fetch(url, { headers: rapidHeaders });
    const data = await response.json();

    const raw = data.data?.otherPositionRetList || data.otherPositionRetList || [];
    const positions = raw.map((p) => ({
      symbol: p.symbol,
      entryPrice: parseFloat(p.entryPrice),
      markPrice: parseFloat(p.markPrice),
      pnl: p.unrealizedProfit,
      roe: p.roe ? (p.roe * 100).toFixed(2) : "0.00",
      amount: p.amount,
      leverage: p.leverage || 1,
      direction: parseFloat(p.amount) > 0 ? "LONG" : "SHORT",
    }));

    res.json({ success: true, uid: req.params.uid, positions, fetchedAt: Date.now() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, positions: [] });
  }
});

// ── Batch positions ────────────────────────────────────────────────────────
app.post("/api/positions/batch", async (req, res) => {
  try {
    if (!RAPID_API_KEY) {
      return res.status(500).json({ success: false, error: "RAPID_API_KEY not set" });
    }

    const { uids } = req.body;
    if (!uids || !Array.isArray(uids)) {
      return res.status(400).json({ success: false, error: "uids array required" });
    }

    const results = {};
    for (const uid of uids) {
      try {
        const url = `${RAPID_BASE}/v1/getOtherPosition?encryptedUid=${uid}&tradeType=PERPETUAL`;
        const response = await fetch(url, { headers: rapidHeaders });
        const data = await response.json();
        const raw = data.data?.otherPositionRetList || data.otherPositionRetList || [];
        results[uid] = raw.map((p) => ({
          symbol: p.symbol,
          entryPrice: parseFloat(p.entryPrice),
          markPrice: parseFloat(p.markPrice),
          roe: p.roe ? (p.roe * 100).toFixed(2) : "0.00",
          amount: p.amount,
          leverage: p.leverage || 1,
          direction: parseFloat(p.amount) > 0 ? "LONG" : "SHORT",
        }));
      } catch {
        results[uid] = [];
      }
      await new Promise(r => setTimeout(r, 200));
    }

    res.json({ success: true, traderPositions: results, fetchedAt: Date.now() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`LeaderBot on port ${PORT} | API key: ${RAPID_API_KEY ? "SET ✓" : "NOT SET ✗"}`);
});
