const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public'));

server.listen(8080, () => {
  console.log('🚀 Server & WebSocket berjalan di http://localhost:8080');
});

const binanceWs = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@trade');

binanceWs.on('open', () => {
  console.log('✅ Terhubung ke Binance WebSocket');
});

wss.on('connection', (ws) => {
  console.log('🌐 Client frontend terhubung');
  ws.on('close', () => console.log('❌ Client frontend terputus'));
});

binanceWs.on('message', (data) => {
  const trade = JSON.parse(data);
  const price = trade.p;
  const time = trade.T;

  const payload = JSON.stringify({ price, time });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
});

// endpoint untuk histori
app.get('/historical', async (req, res) => {
  const interval = req.query.interval || '1m';
  try {
    const { data } = await axios.get(`https://api.binance.com/api/v3/klines`, {
      params: {
        symbol: 'BTCUSDT',
        interval,
        limit: 500
      }
    });
    const formatted = data.map(d => ({
      time: d[0],
      price: parseFloat(d[4])
    }));
    res.json(formatted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch historical data' });
  }
});
