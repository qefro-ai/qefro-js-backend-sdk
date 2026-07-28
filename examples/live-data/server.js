import 'dotenv/config';
import { Qefro } from '@qefro-ai/backend';

/**
 * Realtime data example — tools that fetch live data from public keyless APIs
 * at invoke time (crypto prices via CoinGecko, FX rates via Frankfurter,
 * weather via Open-Meteo). Shows upstream timeouts and graceful error shapes.
 */

const port = Number(process.env.PORT || 8088);
const app = new Qefro({ signingSecret: process.env.QEFRO_SIGNING_SECRET || 'dev-secret' });

const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 6000);

function asString(value, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

/** Fetch JSON with a hard timeout so tool calls never hang the agent. */
async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`upstream ${res.status}`);
  }
  return res.json();
}

/** Uniform failure shape the agent can relay to the user. */
function upstreamError(source, err) {
  return {
    ok: false,
    source,
    error: 'upstream_unavailable',
    message: `Live data from ${source} is unavailable right now (${err.message}). Please try again shortly.`,
  };
}

app.tool(
  {
    name: 'crypto_price',
    description: 'Live cryptocurrency spot price in USD (CoinGecko). Example coins: bitcoin, ethereum, kadena.',
    auth: 'none',
    timeout: 15,
    input_schema: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'CoinGecko coin id, e.g. bitcoin' },
      },
      required: ['coin'],
    },
  },
  async (ctx) => {
    const coin = asString(ctx.parameters?.coin, 'bitcoin').toLowerCase();
    try {
      const data = await fetchJson(
        `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coin)}&vs_currencies=usd&include_24hr_change=true`,
      );
      const row = data[coin];
      if (!row) {
        return { ok: false, coin, error: 'unknown_coin', message: `No CoinGecko listing for "${coin}".` };
      }
      return {
        ok: true,
        coin,
        price_usd: row.usd,
        change_24h_pct: Number((row.usd_24h_change ?? 0).toFixed(2)),
        as_of: new Date().toISOString(),
      };
    } catch (err) {
      return upstreamError('CoinGecko', err);
    }
  },
);

app.tool(
  {
    name: 'fx_rate',
    description: 'Live foreign-exchange rate between two currencies (Frankfurter/ECB).',
    auth: 'none',
    timeout: 15,
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'ISO currency code, e.g. USD' },
        to: { type: 'string', description: 'ISO currency code, e.g. INR' },
        amount: { type: 'number', description: 'Amount to convert (default 1)' },
      },
      required: ['from', 'to'],
    },
  },
  async (ctx) => {
    const from = asString(ctx.parameters?.from, 'USD').toUpperCase();
    const to = asString(ctx.parameters?.to, 'INR').toUpperCase();
    const amount = Number(ctx.parameters?.amount) > 0 ? Number(ctx.parameters.amount) : 1;
    try {
      const data = await fetchJson(
        `https://api.frankfurter.app/latest?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}&amount=${amount}`,
      );
      const converted = data.rates?.[to];
      if (converted === undefined) {
        return { ok: false, error: 'unknown_currency', message: `Cannot convert ${from} to ${to}.` };
      }
      return { ok: true, from, to, amount, converted, rate_date: data.date };
    } catch (err) {
      return upstreamError('Frankfurter', err);
    }
  },
);

app.tool(
  {
    name: 'weather_now',
    description: 'Current weather for a city (Open-Meteo geocoding + forecast).',
    auth: 'none',
    timeout: 15,
    input_schema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name, e.g. Chennai' },
      },
      required: ['city'],
    },
  },
  async (ctx) => {
    const city = asString(ctx.parameters?.city, 'Chennai');
    try {
      const geo = await fetchJson(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`,
      );
      const place = geo.results?.[0];
      if (!place) {
        return { ok: false, city, error: 'unknown_city', message: `Could not find "${city}".` };
      }
      const wx = await fetchJson(
        `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code`,
      );
      return {
        ok: true,
        city: `${place.name}, ${place.country_code}`,
        temperature_c: wx.current?.temperature_2m,
        humidity_pct: wx.current?.relative_humidity_2m,
        wind_kmh: wx.current?.wind_speed_10m,
        as_of: wx.current?.time,
      };
    } catch (err) {
      return upstreamError('Open-Meteo', err);
    }
  },
);

const handle = await app.listen({ port });
console.log('Live-data example listening');
console.log(`  Webhook URL: ${handle.url}`);
console.log('  Tools: crypto_price, fx_rate, weather_now (all public, live upstream data)');
