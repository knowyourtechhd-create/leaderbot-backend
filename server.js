const express = require("express");
const cors = require("cors");
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const HEADERS = {
  "Accept": "*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "Content-Type": "application/json",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Origin": "https://www.binance.com",
  "Referer": "https://www.binance.com/en/futures-activity/leaderboard",
  "bnc-uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "clienttype": "web",
  "lang": "en",
};

app.get("/", (req, res) => {
  res.json({ status: "LeaderBot backend running", time: new Date().toISOString() });
});

// ── Leaderboard ────────────────────────────────────────────────────────────
app.get("/api/leaderboard", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 20);

    const response = await fetch(
      "https://www.binance.com/bapi/futures/v3/public/future/leaderboard/getLeaderboard",
      {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({
          isShared: true,
          isTrader: false,
          periodType: "DAILY",
          statisticsType: "ROI",
          tradeType: "PERPETUAL",
        }),
      }
    );

    const text = await response.text();

    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error(`Binance returned non-JSON: ${text.slice(0, 200)}`); }

    if (!response.ok || !data.data) {
      throw new Error(`Binance error ${response.status}: ${data.message || text.slice(0, 100)}`);
    }

    const traders = data.data.slice(0, limit).map((t, i) => ({
      rank: i + 1,
      encryptedUid: t.encryptedUid,
      nickName: t.nickName || `Trader_${i + 1}`,
      roi: t.roi ? (t.roi * 100).toFixed(2) : "0.00",
      pnl: t.pnl ? parseFloat(t.pnl).toFixed(2) : "0.00",
      winRate: t.winRate ? (t.winRate * 100).toFixed(1) : "0.0",
      followerCount: t.followerCount || 0,
      updateTime: t.updateTimeStamp || Date.now(),
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
    const response = await fetch(
      "https://www.binance.com/bapi/futures/v3/public/future/leaderboard/getOtherPosition",
      {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({
          encryptedUid: req.params.uid,
          tradeType: "PERPETUAL",
        }),
      }
    );

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

    res.json({ success: true, uid: req.params.uid, positions, fetchedAt: Date.now() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, positions: [] });
  }
});

// ── Batch positions ────────────────────────────────────────────────────────
app.post("/api/positions/batch", async (req, res) => {
  try {
    const { uids } = req.body;
    if (!uids || !Array.isArray(uids)) {
      return res.status(400).json({ success: false, error: "uids array required" });
    }

    // Stagger requests slightly to avoid rate limiting
    const results = {};
    for (const uid of uids) {
      try {
        const response = await fetch(
          "https://www.binance.com/bapi/futures/v3/public/future/leaderboard/getOtherPosition",
          {
            method: "POST",
            headers: HEADERS,
            body: JSON.stringify({ encryptedUid: uid, tradeType: "PERPETUAL" }),
          }
        );
        const data = await response.json();
        results[uid] = (data.data?.otherPositionRetList || []).map((p) => ({
          symbol: p.symbol,
          entryPrice: p.entryPrice,
          markPrice: p.markPrice,
          pnl: p.unrealizedProfit,
          roe: p.roe ? (p.roe * 100).toFixed(2) : "0.00",
          amount: p.amount,
          leverage: p.leverage || 1,
          direction: p.amount > 0 ? "LONG" : "SHORT",
        }));
      } catch {
        results[uid] = [];
      }
      // Small delay between requests
      await new Promise(r => setTimeout(r, 150));
    }

    res.json({ success: true, traderPositions: results, fetchedAt: Date.now() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`LeaderBot backend on port ${PORT}`);
});
