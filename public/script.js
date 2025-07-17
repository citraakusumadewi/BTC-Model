const priceEl = document.getElementById('price');
const timeEl = document.getElementById('time');
const ctx = document.getElementById('chart').getContext('2d');
const darkToggle = document.getElementById('darkToggle');
const startBtn = document.getElementById('startPredictionBtn');
const modal = document.getElementById('confirmationModal');
const modalConfirmBtn = document.getElementById('modalConfirmBtn');
const modalCancelBtn = document.getElementById('modalCancelBtn');
const entryPriceEl = document.getElementById('entryPrice');
const recommendationEl = document.getElementById('recommendation');
const predictedPriceEl = document.getElementById('predictedPrice');

const lightTextColor = '#6b7280', darkTextColor = '#8b949e';
const lightGridColor = '#e5e7eb', darkGridColor = '#30363d';

let lastPrice = null, currentMinute = null, sequence = [];

// 📈 Chart
const gradient = ctx.createLinearGradient(0, 0, 0, 400);
gradient.addColorStop(0, 'rgba(59, 130, 246, 0.3)');  // biru muda
gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');    // transparan

const chart = new Chart(ctx, {
  type: 'line',
  data: {
    labels: [],
    datasets: [{
      label: 'BTC/USD',
      data: [],
      borderColor: '#3b82f6',            // biru garis
      backgroundColor: gradient,        // biru gradient
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.1,
      fill: true
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    scales: {
      x: { type: 'time', time: { unit: 'minute' }, ticks: { color: lightTextColor }, grid: { display: false }},
      y: { position: 'right', ticks: { color: lightTextColor, callback: v => `$${v.toLocaleString()}` }, grid: { color: lightGridColor }}
    },
    plugins: {
      legend: { display: false },
      zoom: { pan: { enabled: true, mode: 'x' }, zoom: { wheel: { enabled: true }, mode: 'x' } }
    }
  }
});

// 🌙 Dark mode
darkToggle.onclick = () => {
  document.body.classList.toggle('dark');
  darkToggle.textContent = document.body.classList.contains('dark') ? '☀️' : '🌙';
  updateChartColors();
};

function updateChartColors() {
  const isDark = document.body.classList.contains('dark');
  chart.options.scales.x.ticks.color = isDark ? darkTextColor : lightTextColor;
  chart.options.scales.y.ticks.color = isDark ? darkTextColor : lightTextColor;
  chart.options.scales.y.grid.color = isDark ? darkGridColor : lightGridColor;
  chart.update();
}

// 🔌 WebSocket
const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
ws.onmessage = msg => {
  const data = JSON.parse(msg.data);
  const price = parseFloat(data.price);
  const time = new Date(parseInt(data.time));

  if (lastPrice !== null) {
    priceEl.classList.toggle('up', price > lastPrice);
    priceEl.classList.toggle('down', price < lastPrice);
  }
  lastPrice = price;

  priceEl.textContent = `$${price.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
  timeEl.textContent = `Last update: ${time.toLocaleTimeString()}`;

  setTimeout(() => priceEl.classList.remove('up', 'down'), 300);

  const minute = time.getMinutes();
  if (currentMinute !== minute) {
    chart.data.labels.push(time);
    chart.data.datasets[0].data.push(price);
    sequence.push(price);

    if (chart.data.labels.length > 500) {
      chart.data.labels.shift();
      chart.data.datasets[0].data.shift();
    }

    if (sequence.length > 24) sequence.shift();

    chart.update('none');
    currentMinute = minute;
  }
};

// 🕒 Timeframe
document.querySelectorAll('.timeframe button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelector('.timeframe button.active').classList.remove('active');
    btn.classList.add('active');
    changeTimeframe(btn.dataset.interval);
  });
});

async function changeTimeframe(interval) {
  chart.data.labels = [];
  chart.data.datasets[0].data = [];
  chart.update('none');
  const apiMap = { '1m': '1m', '15m': '15m', '1H': '1h', '4H': '4h', '1D': '1d', '1W': '1w' };
  const unitMap = { '1m': 'minute', '15m': 'minute', '1H': 'hour', '4H': 'hour', '1D': 'day', '1W': 'week' };
  const res = await fetch(`/historical?interval=${apiMap[interval]}`);
  const data = await res.json();
  chart.data.labels = data.map(d => new Date(d.time));
  chart.data.datasets[0].data = data.map(d => d.price);
  chart.options.scales.x.time.unit = unitMap[interval];
  chart.update('none');
}

// 🔮 Modal
startBtn.addEventListener('click', () => {
  if (!lastPrice) {
    showNotification("⚠️ Waiting for price data…", 'info');
    return;
  }
  modal.classList.add('visible');
});

modalCancelBtn.addEventListener('click', () => {
  modal.classList.remove('visible');
});

modalConfirmBtn.addEventListener('click', () => {
  modal.classList.remove('visible');
  startPrediction();
});

// 🔮 Prediction
async function startPrediction() {
  setLoading(true);
  try {
    const res = await fetch(`/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    const result = await res.json();

    entryPriceEl.textContent = `$${result.entry_price.toFixed(2)}`;
    updateBadge(recommendationEl, result.recommendation);
    predictedPriceEl.textContent = `$${result.predicted_price.toFixed(2)}`;
    predictedPriceEl.classList.add('fade-in');

    showNotification("AI Prediction Complete", 'buy');
  } catch (err) {
    showNotification(err.message, 'sell');
  } finally {
    setLoading(false);
  }
}

// 🎨 Update Badge
function updateBadge(el, value) {
  el.textContent = value;
  el.classList.remove('buy', 'sell', 'neutral', 'fade-in');

  if (value.includes('BUY')) el.classList.add('buy');
  else if (value.includes('SELL')) el.classList.add('sell');
  else el.classList.add('neutral');

  void el.offsetWidth;
  el.classList.add('fade-in');
}

// 🔔 Notification
function showNotification(message, type = 'info') {
  const container = document.getElementById('notification-container');
  const n = document.createElement('div');
  n.className = `notification ${type}`;
  n.textContent = message;
  container.appendChild(n);
  setTimeout(() => n.remove(), 4000);
}

// 🔄 Spinner state
function setLoading(isLoading) {
  if (isLoading) {
    startBtn.disabled = true;
    startBtn.classList.add('loading');
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    startBtn.appendChild(spinner);
  } else {
    startBtn.disabled = false;
    startBtn.classList.remove('loading');
    const spinner = startBtn.querySelector('.spinner');
    if (spinner) spinner.remove();
  }
}

// 🚀 Init
window.onload = () => {
  updateChartColors();
  changeTimeframe('1m');
};