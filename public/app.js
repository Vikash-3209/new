const STOCKS = {
  RELIANCE: { name: 'Reliance Industries', sector: 'Energy', price: 1428.65, change: 1.30, volume: '8.42M', color: '#65896d' },
  TCS: { name: 'Tata Consultancy', sector: 'IT Services', price: 3864.20, change: -0.48, volume: '1.18M', color: '#5b78a5' },
  INFY: { name: 'Infosys', sector: 'IT Services', price: 1462.80, change: 0.76, volume: '4.63M', color: '#527da1' },
  HDFCBANK: { name: 'HDFC Bank', sector: 'Banking', price: 1682.40, change: 0.24, volume: '6.31M', color: '#4c7099' },
  ICICIBANK: { name: 'ICICI Bank', sector: 'Banking', price: 1124.35, change: 1.12, volume: '5.78M', color: '#bb7247' },
  TATAMOTORS: { name: 'Tata Motors', sector: 'Automotive', price: 976.50, change: -1.05, volume: '7.14M', color: '#69777d' },
  SBIN: { name: 'State Bank of India', sector: 'Banking', price: 812.35, change: 0.83, volume: '9.26M', color: '#5c7c9d' },
  WIPRO: { name: 'Wipro', sector: 'IT Services', price: 524.60, change: -0.36, volume: '2.94M', color: '#71689e' },
  BHARTIARTL: { name: 'Bharti Airtel', sector: 'Telecom', price: 1632.25, change: 0.62, volume: '2.10M', color: '#c86d54' },
  ITC: { name: 'ITC Limited', sector: 'FMCG', price: 432.10, change: 0.28, volume: '6.50M', color: '#54856b' }
};
const INDICES = [
  { name: 'NIFTY 50', symbol: 'NIFTY', price: 24680.55, change: .68, seed: 3 },
  { name: 'SENSEX', symbol: 'SENSEX', price: 81086.21, change: .54, seed: 6 },
  { name: 'BANK NIFTY', symbol: 'BANK NIFTY', price: 52842.70, change: -.21, seed: 9 }
];
const RANGES = { '1D': 36, '1W': 35, '1M': 30, '3M': 48, '1Y': 60, '5Y': 60 };
const state = {
  watchlist: readStorage('market-pulse-watchlist', ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'TATAMOTORS']),
  selected: readStorage('market-pulse-selected', 'RELIANCE'),
  range: '1Y',
  chartType: 'line',
  dark: readStorage('market-pulse-theme', 'light') === 'dark',
  live: false,
  quotes: {},
  histories: {},
  liveHistories: new Set(),
  marketErrorNotified: false,
  historyErrorNotified: false,
  toastTimer: null,
  resizeObserver: null
};

const $ = (selector) => document.querySelector(selector);
const formatINR = (value, decimals = 2) => `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
const formatNumber = (value) => Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const storage = window.localStorage;

function readStorage(key, fallback) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function getStock(symbol) {
  if (!STOCKS[symbol]) {
    const clean = symbol.replace(/\.(NS|BO)$/i, '').toUpperCase();
    if (!/^[A-Z0-9_-]{1,15}$/.test(clean)) return null;
    STOCKS[clean] = { name: clean, sector: 'NSE listed', price: 500 + clean.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) * 3.17, change: .45, volume: '—', color: '#6b8276' };
  }
  return STOCKS[symbol];
}

function quoteFor(symbol) {
  const stock = getStock(symbol);
  return state.quotes[symbol] || { price: stock.price, change: stock.change, volume: stock.volume, high: stock.price * 1.014, low: stock.price * .986 };
}

function randomWalk(start, count, seed, volatility = .012, spanDays = count) {
  let value = start * (1 - (seed % 13) / 100);
  const rows = [];
  const dateStep = spanDays * 86400000 / Math.max(1, count - 1);
  for (let index = 0; index < count; index++) {
    const wave = Math.sin((index + seed * 5) * .48) * volatility * .25;
    const drift = (Math.sin((index + seed) * .11) + Math.cos(index * .07 + seed)) * volatility * .11;
    const open = value;
    const close = Math.max(start * .55, value * (1 + wave + drift + (Math.sin(index * 1.91 + seed) * volatility * .25)));
    const wick = Math.abs(close - open) + value * volatility * (.3 + Math.abs(Math.sin(index * 1.2 + seed)) * .8);
    rows.push({
      date: new Date(Date.now() - (count - index - 1) * dateStep),
      open,
      high: Math.max(open, close) + wick * .38,
      low: Math.min(open, close) - wick * .38,
      close,
      volume: 100000 + Math.abs(Math.sin(index * 1.42 + seed)) * 850000
    });
    value = close;
  }
  const factor = start / rows[rows.length - 1].close;
  return rows.map((row) => ({ ...row, open: row.open * factor, high: row.high * factor, low: row.low * factor, close: row.close * factor }));
}

function getHistory(symbol, range = state.range) {
  const key = `${symbol}:${range}`;
  if (state.histories[key]) return state.histories[key];
  const stock = getStock(symbol);
  const rowCount = RANGES[range] || 60;
  const seed = symbol.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) + range.length * 7;
  const change = quoteFor(symbol).change / 100;
  const target = quoteFor(symbol).price * (1 - change);
  const spanDays = { '1D': 1, '1W': 7, '1M': 30, '3M': 90, '1Y': 365, '5Y': 365 * 5 }[range] || 365;
  const data = randomWalk(target, rowCount, seed, range === '1D' ? .008 : .018, spanDays);
  data[data.length - 1].close = quoteFor(symbol).price;
  data[data.length - 1].high = Math.max(data[data.length - 1].high, quoteFor(symbol).high);
  data[data.length - 1].low = Math.min(data[data.length - 1].low, quoteFor(symbol).low);
  state.histories[key] = data;
  return data;
}

function saveState() {
  storage.setItem('market-pulse-watchlist', JSON.stringify(state.watchlist));
  storage.setItem('market-pulse-selected', JSON.stringify(state.selected));
}

function renderMarket() {
  const cards = INDICES.map((index, position) => {
    const liveIndex = state.live && state.indexQuotes?.[position];
    const price = liveIndex?.price ?? index.price;
    const change = liveIndex?.change ?? index.change;
    const trend = randomWalk(price * .992, 24, index.seed + Math.floor(Date.now() / 60000) % 20, .004).map((row) => row.close);
    const color = change >= 0 ? '#2fa777' : '#df7770';
    return `<article class="market-card"><div class="market-card-top"><span class="market-card-name">${index.name}</span><span class="market-card-symbol">${index.symbol}</span></div><div class="market-value-row"><strong class="market-value">${formatNumber(price)}</strong><span class="market-change ${change >= 0 ? 'positive' : 'negative'}">${change >= 0 ? '+' : ''}${Number(change).toFixed(2)}%</span></div><canvas class="sparkline" data-values="${trend.join(',')}" data-color="${color}" aria-label="${index.name} trend chart"></canvas></article>`;
  });
  $('#market-grid').innerHTML = cards.join('');
  document.querySelectorAll('.sparkline').forEach(drawSparkline);
  const date = new Date();
  const marketOpen = date.getDay() !== 0 && date.getDay() !== 6 && date.getHours() >= 9 && date.getHours() < 16;
  $('#market-status').textContent = marketOpen ? 'MARKET OPEN' : 'MARKET CLOSED';
  $('.market-session').innerHTML = state.indexQuotes?.length
    ? '<span class="live-dot"></span> Live index data'
    : '<span class="simulated-dot"></span> Simulated index data';
}

function drawSparkline(canvas) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width) return;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = rect.width * ratio;
  canvas.height = rect.height * ratio;
  const context = canvas.getContext('2d');
  context.scale(ratio, ratio);
  const values = canvas.dataset.values.split(',').map(Number);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const points = values.map((value, index) => ({ x: index / (values.length - 1) * rect.width, y: rect.height - 2 - (value - min) / (max - min || 1) * (rect.height - 5) }));
  context.beginPath();
  points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
  context.strokeStyle = canvas.dataset.color;
  context.lineWidth = 1.5;
  context.stroke();
}

function renderWatchlist() {
  $('#watch-count').textContent = String(state.watchlist.length).padStart(2, '0');
  $('#watchlist-list').innerHTML = state.watchlist.length ? state.watchlist.map((symbol) => {
    const stock = getStock(symbol);
    const quote = quoteFor(symbol);
    const positive = quote.change >= 0;
    return `<div class="watch-row" data-symbol="${escapeHtml(symbol)}" tabindex="0" role="button" aria-label="View ${escapeHtml(stock.name)}"><div class="watch-company"><span class="company-mark" style="color:${stock.color}">${escapeHtml(symbol[0])}</span><span><strong>${escapeHtml(stock.name)}</strong><small>${escapeHtml(symbol)}</small></span></div><div class="watch-price"><strong>${formatINR(quote.price)}</strong><small class="${positive ? 'positive-text' : 'negative-text'}">${positive ? '+' : ''}${Number(quote.change).toFixed(2)}%</small></div><button class="remove-stock" type="button" data-remove="${escapeHtml(symbol)}" aria-label="Remove ${escapeHtml(stock.name)}" title="Remove from watchlist">×</button></div>`;
  }).join('') : '<div class="empty-watchlist">Your watchlist is empty. Search for a stock to add it.</div>';

  document.querySelectorAll('.watch-row').forEach((row) => {
    row.addEventListener('click', () => selectStock(row.dataset.symbol));
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectStock(row.dataset.symbol); }
    });
  });
  document.querySelectorAll('.remove-stock').forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation();
    state.watchlist = state.watchlist.filter((symbol) => symbol !== button.dataset.remove);
    if (!state.watchlist.length) state.watchlist = [];
    saveState();
    renderWatchlist();
    updateSelectedWatchButton();
    showToast(`${getStock(button.dataset.remove).name} removed from watchlist`);
  }));
}

function updateSelectedWatchButton() {
  const isAdded = state.watchlist.includes(state.selected);
  $('#selected-watch-toggle').classList.toggle('active', isAdded);
  $('#selected-watch-toggle span').textContent = isAdded ? 'In watchlist' : 'Add to watchlist';
}

function selectStock(symbol) {
  if (!getStock(symbol)) return;
  state.selected = symbol;
  storage.setItem('market-pulse-selected', JSON.stringify(symbol));
  renderSelectedStock();
  closeSearch();
  loadStockQuote(symbol);
  loadLiveHistory();
}

function renderSelectedStock() {
  const stock = getStock(state.selected);
  const quote = quoteFor(state.selected);
  const positive = quote.change >= 0;
  $('#selected-mark').textContent = state.selected[0];
  $('#selected-mark').style.color = stock.color;
  $('#chart-title').textContent = stock.name;
  $('#selected-symbol').textContent = `${state.selected} · ${stock.sector}`;
  $('#selected-price').textContent = formatINR(quote.price);
  $('#selected-change').className = `selected-change ${positive ? 'positive' : 'negative'}`;
  $('#selected-change').innerHTML = `${positive ? '+' : '−'}${formatINR(Math.abs(quote.price * quote.change / (100 + quote.change)))} <span>(${positive ? '+' : ''}${Number(quote.change).toFixed(2)}%)</span> <small>today</small>`;
  $('#day-high').textContent = formatINR(quote.high);
  $('#day-low').textContent = formatINR(quote.low);
  $('#day-volume').textContent = quote.volume;
  $('#insight-stock-name').textContent = stock.name;
  updateSelectedWatchButton();
  renderWatchlist();
  renderChart();
}

function renderChart() {
  const canvas = $('#price-chart');
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 10 || rect.height < 10) return;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  const width = rect.width;
  const height = rect.height;
  const dark = document.body.classList.contains('dark');
  const textColor = dark ? '#89968f' : '#a6afaa';
  const gridColor = dark ? '#27312c' : '#eef1ef';
  const lineColor = '#38a77b';
  const data = getHistory(state.selected, state.range);
  const padding = { top: 12, right: 53, bottom: 8, left: 3 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  let min = Math.min(...data.map((row) => row.low));
  let max = Math.max(...data.map((row) => row.high));
  const gap = (max - min) * .15 || max * .01;
  min -= gap;
  max += gap;
  const x = (index) => padding.left + index / (data.length - 1) * chartWidth;
  const y = (value) => padding.top + (max - value) / (max - min) * chartHeight;
  ctx.font = '9px "DM Sans", sans-serif';
  ctx.textBaseline = 'middle';
  for (let index = 0; index < 4; index++) {
    const value = max - (max - min) * index / 3;
    const yPosition = y(value);
    ctx.beginPath();
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.moveTo(padding.left, yPosition);
    ctx.lineTo(width - 2, yPosition);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = textColor;
    ctx.textAlign = 'right';
    ctx.fillText(formatNumber(value), width - 2, yPosition);
  }
  if (state.chartType === 'candles') {
    const candleWidth = Math.max(2, Math.min(7, chartWidth / data.length * .58));
    data.forEach((row, index) => {
      const color = row.close >= row.open ? lineColor : '#df7770';
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x(index), y(row.high));
      ctx.lineTo(x(index), y(row.low));
      ctx.stroke();
      const top = Math.min(y(row.open), y(row.close));
      const bodyHeight = Math.max(1, Math.abs(y(row.open) - y(row.close)));
      ctx.fillRect(x(index) - candleWidth / 2, top, candleWidth, bodyHeight);
    });
  } else {
    const gradient = ctx.createLinearGradient(0, padding.top, 0, height);
    gradient.addColorStop(0, 'rgba(45, 166, 118, .16)');
    gradient.addColorStop(1, 'rgba(45, 166, 118, 0)');
    ctx.beginPath();
    data.forEach((row, index) => index ? ctx.lineTo(x(index), y(row.close)) : ctx.moveTo(x(index), y(row.close)));
    ctx.lineTo(x(data.length - 1), height);
    ctx.lineTo(x(0), height);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.beginPath();
    data.forEach((row, index) => index ? ctx.lineTo(x(index), y(row.close)) : ctx.moveTo(x(index), y(row.close)));
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.8;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  const lastRow = data[data.length - 1];
  ctx.beginPath();
  ctx.fillStyle = lineColor;
  ctx.arc(x(data.length - 1), y(lastRow.close), 3, 0, Math.PI * 2);
  ctx.fill();
  const firstDate = data[0].date;
  const lastDate = data[data.length - 1].date;
  $('#chart-start').textContent = firstDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  $('#chart-end').textContent = lastDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  const closes = data.map((row) => row.close);
  const yearData = state.histories[`${state.selected}:1Y`] || getHistory(state.selected, '1Y');
  const rangeHigh = Math.max(...yearData.map((row) => row.high));
  const rangeLow = Math.min(...yearData.map((row) => row.low));
  const returnValue = (lastRow.close / data[0].close - 1) * 100;
  const avg = closes.slice(-20).reduce((sum, value) => sum + value, 0) / Math.min(20, closes.length);
  const volatility = closes.slice(1).reduce((sum, price, index) => sum + Math.abs(price / closes[index] - 1), 0) / Math.max(1, closes.length - 1) * 100;
  const bullish = lastRow.close >= avg;
  $('#year-range').textContent = `${formatINR(rangeLow, 0)} — ${formatINR(rangeHigh, 0)}`;
  $('#high-low-value').textContent = `${formatINR(rangeLow, 0)} — ${formatINR(rangeHigh, 0)}`;
  $('#sma-value').textContent = formatINR(avg);
  $('#sma-foot').textContent = lastRow.close >= avg ? 'Price is above the moving average' : 'Price is below the moving average';
  $('#period-return').textContent = `${returnValue >= 0 ? '+' : ''}${returnValue.toFixed(2)}%`;
  $('#period-return').className = returnValue >= 0 ? 'positive-text' : 'negative-text';
  $('#return-foot').textContent = `Over the selected ${state.range} period`;
  $('#trend-signal').textContent = bullish ? 'Bullish' : 'Bearish';
  $('#trend-signal').classList.toggle('bearish', !bullish);
  $('#trend-foot').textContent = bullish ? 'Recent price above its average' : 'Recent price below its average';
  $('#support-level').textContent = formatINR(rangeLow, 0);
  $('#resistance-level').textContent = formatINR(rangeHigh, 0);
  $('#risk-level').textContent = volatility < .65 ? 'Lower' : volatility < 1.2 ? 'Moderate' : 'Higher';
  const stock = getStock(state.selected);
  const direction = returnValue >= 0 ? 'advanced' : 'declined';
  $('#insight-copy').textContent = `${stock.name} ${direction} ${Math.abs(returnValue).toFixed(1)}% over the selected ${state.range} period. The latest close is ${bullish ? 'above' : 'below'} its 20-session average. The observed range (${formatINR(rangeLow, 0)}–${formatINR(rangeHigh, 0)}) and recent price movement may help frame further research; past performance does not predict future returns.`;
  $('#chart-source').textContent = state.liveHistories.has(`${state.selected}:${state.range}`) ? 'LIVE MARKET DATA' : 'SIMULATED DATA';
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove('visible'), 2600);
}

function stockMatches(query) {
  const text = query.trim().toUpperCase();
  if (!text) return [];
  return Object.entries(STOCKS).filter(([symbol, stock]) => symbol.includes(text) || stock.name.toUpperCase().includes(text) || stock.sector.toUpperCase().includes(text)).slice(0, 6);
}

function renderSearchResults(query) {
  const resultBox = $('#search-results');
  const matches = stockMatches(query);
  if (query.trim() && !matches.some(([symbol]) => symbol === query.trim().toUpperCase()) && /^[A-Z0-9_-]{1,15}$/.test(query.trim().toUpperCase())) {
    const symbol = query.trim().toUpperCase();
    matches.push([symbol, getStock(symbol)]);
  }
  resultBox.innerHTML = matches.length ? matches.map(([symbol, stock]) => `<button class="search-result" type="button" data-symbol="${escapeHtml(symbol)}" role="option"><span><strong>${escapeHtml(stock.name)}</strong><small>${escapeHtml(symbol)} · ${escapeHtml(stock.sector)}</small></span><span class="result-action">${state.watchlist.includes(symbol) ? 'View' : '+ Add'}</span></button>`).join('') : '<div class="search-result"><span><strong>No stocks found</strong><small>Try a company name or symbol</small></span></div>';
  resultBox.classList.add('open');
  resultBox.querySelectorAll('[data-symbol]').forEach((button) => button.addEventListener('click', () => {
    const symbol = button.dataset.symbol;
    if (!state.watchlist.includes(symbol)) {
      state.watchlist.unshift(symbol);
      saveState();
      renderWatchlist();
      showToast(`${getStock(symbol).name} added to watchlist`);
    }
    selectStock(symbol);
    $('#stock-search').value = '';
  }));
}

function closeSearch() {
  $('#search-results').classList.remove('open');
}

function toggleWatchlist() {
  if (state.watchlist.includes(state.selected)) {
    state.watchlist = state.watchlist.filter((symbol) => symbol !== state.selected);
    showToast(`${getStock(state.selected).name} removed from watchlist`);
  } else {
    state.watchlist.unshift(state.selected);
    showToast(`${getStock(state.selected).name} added to watchlist`);
  }
  saveState();
  updateSelectedWatchButton();
  renderWatchlist();
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || `Request failed (${response.status})`);
  }
  return response.json();
}

async function loadLiveData() {
  try {
    const response = await fetchJson('/api/market');
    const quotes = response.stocks || [];
    quotes.forEach((quote) => {
      const symbol = quote.symbol?.replace(/\.NS$/, '');
      if (!symbol || !getStock(symbol)) return;
      state.quotes[symbol] = {
        price: quote.regularMarketPrice ?? quote.price ?? getStock(symbol).price,
        change: quote.regularMarketChangePercent ?? getStock(symbol).change,
        volume: quote.regularMarketVolume ? `${(quote.regularMarketVolume / 1e6).toFixed(2)}M` : getStock(symbol).volume,
        high: quote.regularMarketDayHigh ?? quote.regularMarketPrice,
        low: quote.regularMarketDayLow ?? quote.regularMarketPrice
      };
    });
    state.indexQuotes = (response.indices || []).map((quote, index) => ({
      price: quote.regularMarketPrice ?? INDICES[index].price,
      change: quote.regularMarketChangePercent ?? INDICES[index].change
    }));
    state.live = quotes.length > 0;
    state.marketErrorNotified = false;
    if (state.live) {
      renderMarket();
      renderSelectedStock();
      if (!state.liveHistories.has(`${state.selected}:${state.range}`)) loadLiveHistory();
    }
  } catch (error) {
    state.live = false;
    state.indexQuotes = null;
    renderMarket();
    if (!state.marketErrorNotified) {
      showToast(`Live market data unavailable: ${error.message} Showing simulated data.`);
      state.marketErrorNotified = true;
    }
  }
}

async function loadStockQuote(symbol) {
  try {
    const quote = await fetchJson(`/api/stock/${encodeURIComponent(symbol)}`);
    const stock = getStock(symbol);
    state.quotes[symbol] = {
      price: quote.regularMarketPrice ?? quote.price ?? stock.price,
      change: quote.regularMarketChangePercent ?? stock.change,
      volume: quote.regularMarketVolume ? `${(quote.regularMarketVolume / 1e6).toFixed(2)}M` : stock.volume,
      high: quote.regularMarketDayHigh ?? quote.regularMarketPrice ?? stock.price,
      low: quote.regularMarketDayLow ?? quote.regularMarketPrice ?? stock.price
    };
    state.live = true;
    renderMarket();
    renderSelectedStock();
    if (state.selected === symbol) loadLiveHistory();
  } catch (error) {
    if (state.selected === symbol) showToast(`Live quote unavailable for ${symbol}: ${error.message} Showing simulated data.`);
  }
}

async function loadLiveHistory() {
  if (!state.live) return;
  const symbol = state.selected;
  const range = state.range;
  const historyKey = `${symbol}:${range}`;
  try {
    const result = await fetchJson(`/api/stock/${encodeURIComponent(symbol)}/history?range=${range}`);
    const rows = (result.historicalData || []).map((row) => ({
      date: new Date(row.date),
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume
    })).filter((row) => Number.isFinite(row.close));
    if (rows.length) {
      state.histories[historyKey] = rows;
      state.liveHistories.add(historyKey);
      state.historyErrorNotified = false;
      if (state.selected === symbol && state.range === range) renderChart();
    }
  } catch (error) {
    if (!state.historyErrorNotified) {
      showToast(`Live history unavailable: ${error.message} Showing simulated chart data.`);
      state.historyErrorNotified = true;
    }
  }
}

function bindEvents() {
  $('#range-tabs').addEventListener('click', (event) => {
    const button = event.target.closest('[data-range]');
    if (!button) return;
    state.range = button.dataset.range;
    $('#range-tabs').querySelectorAll('.range-tab').forEach((tab) => tab.classList.toggle('active', tab === button));
    renderChart();
    loadLiveHistory();
  });
  $('#chart-type-toggle').addEventListener('click', () => {
    state.chartType = state.chartType === 'line' ? 'candles' : 'line';
    showToast(state.chartType === 'line' ? 'Line chart' : 'Candlestick chart');
    renderChart();
  });
  $('#selected-watch-toggle').addEventListener('click', toggleWatchlist);
  $('#add-stock-button').addEventListener('click', () => {
    $('#stock-search').focus();
    $('#stock-search').placeholder = 'Type a ticker to add...';
    showToast('Search a company name or ticker symbol');
  });
  $('#browse-stocks').addEventListener('click', () => {
    $('#stock-search').focus();
    $('#stock-search').placeholder = 'Search stocks to add...';
  });
  $('#stock-search').addEventListener('input', (event) => renderSearchResults(event.target.value));
  $('#stock-search').addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeSearch();
    if (event.key === 'Enter') {
      const first = $('#search-results').querySelector('[data-symbol]');
      if (first) first.click();
    }
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.search-box')) closeSearch();
  });
  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      $('#stock-search').focus();
    }
  });
  $('#theme-toggle').addEventListener('click', () => {
    state.dark = !state.dark;
    document.body.classList.toggle('dark', state.dark);
    storage.setItem('market-pulse-theme', state.dark ? 'dark' : 'light');
    $('#theme-toggle').setAttribute('aria-label', state.dark ? 'Switch to light mode' : 'Switch to dark mode');
    renderChart();
  });
  $('#menu-button').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  $('#price-chart').addEventListener('mousemove', (event) => {
    const canvas = event.currentTarget;
    const data = getHistory(state.selected, state.range);
    const box = canvas.getBoundingClientRect();
    const chartWidth = box.width - 56;
    const position = Math.max(0, Math.min(data.length - 1, Math.round((event.clientX - box.left - 3) / chartWidth * (data.length - 1))));
    const row = data[position];
    const tooltip = $('#chart-tooltip');
    tooltip.innerHTML = `${row.date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}<br><strong>${formatINR(row.close)}</strong>`;
    tooltip.style.left = `${Math.max(4, Math.min(box.width - 105, event.clientX - box.left + 8))}px`;
    tooltip.style.top = `${Math.max(3, event.clientY - box.top - 35)}px`;
    tooltip.style.display = 'block';
  });
  $('#price-chart').addEventListener('mouseleave', () => { $('#chart-tooltip').style.display = 'none'; });
  window.addEventListener('resize', () => {
    renderChart();
    document.querySelectorAll('.sparkline').forEach(drawSparkline);
  });
}

function updateClock() {
  const now = new Date();
  $('#local-clock').textContent = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }).format(now) + ' IST';
  $('#today-date').textContent = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(now);
}

function init() {
  document.body.classList.toggle('dark', state.dark);
  $('#theme-toggle').setAttribute('aria-label', state.dark ? 'Switch to light mode' : 'Switch to dark mode');
  $('#footer-year').textContent = new Date().getFullYear();
  $('#range-tabs').querySelectorAll('.range-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.range === state.range));
  if (!getStock(state.selected)) state.selected = 'RELIANCE';
  updateClock();
  renderMarket();
  renderSelectedStock();
  bindEvents();
  loadLiveData();
  loadLiveHistory();
  setInterval(updateClock, 30000);
  setInterval(async () => {
    Object.keys(state.quotes).forEach((symbol) => {
      const quote = state.quotes[symbol];
      const delta = (Math.random() - .5) * quote.price * .0007;
      quote.price += delta;
      quote.high = Math.max(quote.high, quote.price);
      quote.low = Math.min(quote.low, quote.price);
    });
    renderMarket();
    renderSelectedStock();
    await loadLiveData();
  }, 15000);
}

init();
