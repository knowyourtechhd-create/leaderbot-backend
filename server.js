const express = require("express");
const cors = require("cors");
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const BINANCE_BASE = "https://www.binance.com/bapi/futures/v3/public/future/leaderboard";

const HEADERS = {
  "Content-Type": "application/json",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept": "application/json",
  "clienttype": "web",
};

// ── Health check ──────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "LeaderBot backend running", time: new Date().toISOString() });
});

// ── Get top N traders from leaderboard ────────────────────────────────────
app.get("/api/leaderboard", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 20);
    const tradeType = req.query.tradeType || "PERPETUAL";

    const body = {
      isShared: true,
      isTrader: false,
      periodType: "DAILY",
      statisticsType: "ROI",
      tradeType,
    };

    const response = await fetch(`${BINANCE_BASE}/getLeaderboard`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Binance returned ${response.status}`);
    }

    const data = await response.json();

    if (!data.data) {
      throw new Error("No data from Binance leaderboard");
    }

    const traders = data.data.slice(0, limit).map((t, i) => ({
      rank: i + 1,
      encryptedUid: t.encryptedUid,
      nickName: t.nickName || `Trader_${i + 1}`,
      roi: t.roi ? (t.roi * 100).toFixed(2) : "0.00",
      pnl: t.pnl ? t.pnl.toFixed(2) : "0.00",
      winRate: t.winRate ? (t.winRate * 100).toFixed(1) : "0.0",
      followerCount: t.followerCount || 0,
      updateTime: t.updateTimeStamp || Date.now(),
    }));

    res.json({ success: true, traders, fetchedAt: Date.now() });
  } catch (err) {
    console.error("Leaderboard fetch error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Get positions for a specific trader ───────────────────────────────────
app.get("/api/positions/:uid", async (req, res) => {
  try {
    const { uid } = req.params;
    const tradeType = req.query.tradeType || "PERPETUAL";

    const response = await fetch(`${BINANCE_BASE}/getOtherPosition`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ encryptedUid: uid, tradeType }),
    });

    if (!response.ok) {
      throw new Error(`Binance returned ${response.status}`);
    }

    const data = await response.json();
    const positions = (data.data?.otherPositionRetList || []).map((p) => ({
      symbol: p.symbol,
      entryPrice: p.entryPrice,
      markPrice: p.markPrice,
      pnl: p.unrealizedProfit,
      roe: p.roe ? (p.roe * 100).toFixed(2) : "0.00",
      amount: p.amount,
      updateTime: p.updateTimeStamp || Date.now(),
      yellow: p.yellow || false,
      tradeBefore: p.tradeBefore || false,
      leverage: p.leverage || 1,
      direction: p.amount > 0 ? "LONG" : "SHORT",
    }));

    res.json({ success: true, uid, positions, fetchedAt: Date.now() });
  } catch (err) {
    console.error("Positions fetch error:", err.message);
    res.status(500).json({ success: false, error: err.message, positions: [] });
  }
});

// ── Get positions for multiple traders at once ────────────────────────────
app.post("/api/positions/batch", async (req, res) => {
  try {
    const { uids, tradeType = "PERPETUAL" } = req.body;

    if (!uids || !Array.isArray(uids)) {
      return res.status(400).json({ success: false, error: "uids array required" });
    }

    const results = await Promise.allSettled(
      uids.map(async (uid) => {
        const response = await fetch(`${BINANCE_BASE}/getOtherPosition`, {
          method: "POST",
          headers: HEADERS,
          body: JSON.stringify({ encryptedUid: uid, tradeType }),
        });
        const data = await response.json();
        const positions = (data.data?.otherPositionRetList || []).map((p) => ({
          symbol: p.symbol,
          entryPrice: p.entryPrice,
          markPrice: p.markPrice,
          pnl: p.unrealizedProfit,
          roe: p.roe ? (p.roe * 100).toFixed(2) : "0.00",
          amount: p.amount,
          leverage: p.leverage || 1,
          direction: p.amount > 0 ? "LONG" : "SHORT",
          updateTime: p.updateTimeStamp || Date.now(),
        }));
        return { uid, positions };
      })
    );

    const traderPositions = {};
    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        traderPositions[uids[i]] = r.value.positions;
      } else {
        traderPositions[uids[i]] = [];
      }
    });

    res.json({ success: true, traderPositions, fetchedAt: Date.now() });
  } catch (err) {
    console.error("Batch positions error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`LeaderBot backend running on port ${PORT}`);
});
