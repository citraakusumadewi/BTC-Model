const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const axios = require("axios");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static("public"));

const BINANCE_WS = "wss://stream.binance.com:9443/ws/btcusdt@trade";
const AI_BACKEND_URL = "http://127.0.0.1:8000/predict"; // POST endpoint

let last24Prices = []; // Simpan window 24 harga terakhir

server.listen(8080, () => {
  console.log("🚀 Frontend & WebSocket server at http://localhost:8080");
});

// 📈 Binance WS → broadcast ke client + simpan harga
const binanceWs = new WebSocket(BINANCE_WS);
binanceWs.on("open", () => console.log("✅ Connected to Binance WS"));
binanceWs.on("message", (data) => {
  const trade = JSON.parse(data);
  const price = parseFloat(trade.p);
  const time = trade.T;

  last24Prices.push(price);
  if (last24Prices.length > 24) last24Prices.shift();

  const payload = JSON.stringify({ price, time });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
});

wss.on("connection", (ws) => {
  console.log("🌐 Frontend client connected");
  ws.on("close", () => console.log("❌ Frontend client disconnected"));
});

// 📊 Historical data (candlestick)
app.get("/historical", async (req, res) => {
  const interval = req.query.interval || "1m";
  const limit = (interval.includes("d") || interval.includes("w")) ? 1000 : 500;

  try {
    const { data } = await axios.get("https://api.binance.com/api/v3/klines", {
      params: { symbol: "BTCUSDT", interval, limit },
    });
    const formatted = data.map((d) => ({ time: d[0], price: parseFloat(d[4]) }));
    res.json(formatted);
  } catch (err) {
    console.error("⚠️ Error fetching historical:", err.message);
    res.status(500).json({ error: "Failed to fetch historical data" });
  }
});

// 🔮 AI Prediction request
app.post("/predict", async (req, res) => {
  try {
    if (last24Prices.length < 24) {
      return res.status(400).json({ error: "Not enough data for prediction" });
    }

    const payload = {
      sequence: last24Prices,
    };

    const { data } = await axios.post(AI_BACKEND_URL, payload);
    res.json(data);
  } catch (err) {
    console.error("❌ Error calling AI backend:", err.message);
    res.status(500).json({ error: "AI backend error" });
  }
});