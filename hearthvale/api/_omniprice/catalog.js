// OmniPrice instrument catalogue. Every series comes from a source whose licence allows
// public display with attribution (see SOURCES). Index providers such as S&P, Dow Jones and
// Nasdaq forbid redistribution without a licence, so stock-market exposure uses ETFs from
// Twelve Data, and only when TWELVE_DATA_API_KEY is configured.

/** @typedef {'stocks'|'food'|'commodities'|'energy'|'wages'|'currencies'|'crypto'|'rates'} Category */
/** @typedef {'daily'|'weekly'|'monthly'|'quarterly'} Frequency */
/**
 * @typedef {object} Instrument
 * @property {string} id           Stable URL-safe id
 * @property {string} name
 * @property {Category} cat
 * @property {string} region       'US' | 'UK' | 'Global' | 'EU' …
 * @property {string} unit         Human unit, e.g. "$ per dozen"
 * @property {string} [prefix]     Value prefix, e.g. "$"
 * @property {string} [suffix]     Value suffix, e.g. "%"
 * @property {number} decimals
 * @property {Frequency} freq
 * @property {string} source       Key into SOURCES
 * @property {string} [note]
 * @property {string} [ccy]       ISO currency of money values (set automatically below)
 * @property {boolean} [minor]    Values are in minor units (cents)
 * @property {{kind:'fred', id:string, scale?:number}
 *   | {kind:'ons', path:string, scale?:number}
 *   | {kind:'ecb', base:string, quote:string}
 *   | {kind:'coingecko', coin:string}
 *   | {kind:'twelvedata', symbol:string}} feed
 */

export const CATEGORIES = [
  { id: 'stocks', name: 'Stocks & ETFs' },
  { id: 'food', name: 'Food & groceries' },
  { id: 'commodities', name: 'Commodities' },
  { id: 'energy', name: 'Energy' },
  { id: 'wages', name: 'Wages & earnings' },
  { id: 'currencies', name: 'Currencies' },
  { id: 'crypto', name: 'Crypto' },
  { id: 'rates', name: 'Inflation & rates' },
];

/** Attribution and licence for every upstream provider (shown in the app and on /terms/). */
export const SOURCES = {
  bls: { name: 'U.S. Bureau of Labor Statistics', via: 'FRED®, Federal Reserve Bank of St. Louis', licence: 'Public domain (U.S. Government work)', url: 'https://fred.stlouisfed.org/' },
  eia: { name: 'U.S. Energy Information Administration', via: 'FRED®, Federal Reserve Bank of St. Louis', licence: 'Public domain (U.S. Government work)', url: 'https://fred.stlouisfed.org/' },
  treasury: { name: 'Board of Governors of the Federal Reserve System', via: 'FRED®, Federal Reserve Bank of St. Louis', licence: 'Public domain (U.S. Government work)', url: 'https://fred.stlouisfed.org/' },
  imf: { name: 'International Monetary Fund, Primary Commodity Prices', via: 'FRED®, Federal Reserve Bank of St. Louis', licence: 'IMF data, reused with attribution under the IMF terms', url: 'https://www.imf.org/en/Research/commodity-prices' },
  oecd: { name: 'OECD', via: 'FRED®, Federal Reserve Bank of St. Louis', licence: 'CC BY 4.0', url: 'https://fred.stlouisfed.org/' },
  ons: { name: 'Office for National Statistics', licence: 'Open Government Licence v3.0', url: 'https://www.ons.gov.uk/' },
  ecb: { name: 'European Central Bank reference rates', via: 'Frankfurter', licence: 'ECB statistics, reused with attribution', url: 'https://www.frankfurter.app/' },
  coingecko: { name: 'CoinGecko', licence: 'CoinGecko API, free tier with attribution', url: 'https://www.coingecko.com/' },
  twelvedata: { name: 'Twelve Data', licence: 'Twelve Data API, non-commercial use with attribution', url: 'https://twelvedata.com/' },
};

const fred = (id, scale) => ({ kind: 'fred', id, ...(scale ? { scale } : {}) });
const ons = (path, scale) => ({ kind: 'ons', path, ...(scale ? { scale } : {}) });
const CPI = 'economy/inflationandpriceindices/timeseries';
const awe = (cdid) => ons(`employmentandlabourmarket/peopleinwork/earningsandworkinghours/timeseries/${cdid}/emp`);

/** Currencies the ECB publishes reference rates for (all usable as display currencies). */
export const CURRENCIES = {
  GBP: { name: 'British pound', plural: 'pounds', symbol: '£', dec: 2 },
  USD: { name: 'US dollar', plural: 'US dollars', symbol: '$', dec: 2 },
  EUR: { name: 'Euro', plural: 'euros', symbol: '€', dec: 2 },
  JPY: { name: 'Japanese yen', plural: 'yen', symbol: '¥', dec: 0 },
  CHF: { name: 'Swiss franc', plural: 'Swiss francs', symbol: 'CHF ', dec: 2 },
  CAD: { name: 'Canadian dollar', plural: 'Canadian dollars', symbol: 'C$', dec: 2 },
  AUD: { name: 'Australian dollar', plural: 'Australian dollars', symbol: 'A$', dec: 2 },
  NZD: { name: 'New Zealand dollar', plural: 'New Zealand dollars', symbol: 'NZ$', dec: 2 },
  CNY: { name: 'Chinese yuan', plural: 'yuan', symbol: 'CN¥', dec: 2 },
  HKD: { name: 'Hong Kong dollar', plural: 'Hong Kong dollars', symbol: 'HK$', dec: 2 },
  SGD: { name: 'Singapore dollar', plural: 'Singapore dollars', symbol: 'S$', dec: 2 },
  INR: { name: 'Indian rupee', plural: 'rupees', symbol: '₹', dec: 2 },
  KRW: { name: 'South Korean won', plural: 'won', symbol: '₩', dec: 0 },
  SEK: { name: 'Swedish krona', plural: 'Swedish kronor', symbol: 'SEK ', dec: 2 },
  NOK: { name: 'Norwegian krone', plural: 'Norwegian kroner', symbol: 'NOK ', dec: 2 },
  DKK: { name: 'Danish krone', plural: 'Danish kroner', symbol: 'DKK ', dec: 2 },
  PLN: { name: 'Polish złoty', plural: 'złoty', symbol: 'zł ', dec: 2 },
  CZK: { name: 'Czech koruna', plural: 'koruna', symbol: 'Kč ', dec: 2 },
  HUF: { name: 'Hungarian forint', plural: 'forint', symbol: 'Ft ', dec: 0 },
  RON: { name: 'Romanian leu', plural: 'lei', symbol: 'lei ', dec: 2 },
  ISK: { name: 'Icelandic króna', plural: 'krónur', symbol: 'ISK ', dec: 0 },
  TRY: { name: 'Turkish lira', plural: 'lira', symbol: '₺', dec: 2 },
  ZAR: { name: 'South African rand', plural: 'rand', symbol: 'R ', dec: 2 },
  MXN: { name: 'Mexican peso', plural: 'Mexican pesos', symbol: 'MX$', dec: 2 },
  BRL: { name: 'Brazilian real', plural: 'reais', symbol: 'R$', dec: 2 },
  ILS: { name: 'Israeli shekel', plural: 'shekels', symbol: '₪', dec: 2 },
  THB: { name: 'Thai baht', plural: 'baht', symbol: '฿', dec: 2 },
  MYR: { name: 'Malaysian ringgit', plural: 'ringgit', symbol: 'RM ', dec: 2 },
  PHP: { name: 'Philippine peso', plural: 'Philippine pesos', symbol: '₱', dec: 2 },
  IDR: { name: 'Indonesian rupiah', plural: 'rupiah', symbol: 'Rp ', dec: 0 },
};

/** Decimals that suit a quote currency's typical exchange-rate size. */
const RATE_DECIMALS = { JPY: 2, INR: 2, KRW: 1, HUF: 2, ISK: 2, IDR: 0, PHP: 2, THB: 3, TRY: 3, CZK: 3, ZAR: 3, MXN: 3, RON: 4 };

const pair = (base, quote) => ({
  id: `${base}-${quote}`.toLowerCase(),
  name: `${base} / ${quote}`,
  cat: 'currencies',
  region: base,
  unit: `${CURRENCIES[quote].plural} per ${CURRENCIES[base].name.replace(/^Euro$/, 'euro')}`,
  prefix: CURRENCIES[quote].symbol,
  decimals: RATE_DECIMALS[quote] ?? 4,
  freq: 'daily',
  source: 'ecb',
  feed: { kind: 'ecb', base, quote },
});

const CURRENCY_PAIRS = [
  ...Object.keys(CURRENCIES).filter((c) => c !== 'GBP').map((q) => pair('GBP', q)),
  ...['EUR', 'AUD', 'JPY', 'CNY', 'INR', 'CAD', 'CHF', 'MXN', 'BRL', 'KRW', 'TRY', 'ZAR', 'SGD', 'HKD'].map((c) => (c === 'EUR' || c === 'AUD' ? pair(c, 'USD') : pair('USD', c))),
  ...['CHF', 'JPY', 'PLN', 'SEK', 'NOK', 'CZK', 'HUF', 'TRY', 'CNY'].map((q) => pair('EUR', q)),
];

/** @type {Instrument[]} */
export const INSTRUMENTS = [
  // ── Stocks & ETFs (Twelve Data; needs TWELVE_DATA_API_KEY; max 8 to fit the free tier's per-minute limit)
  { id: 'spy', name: 'S&P 500 ETF (SPY)', cat: 'stocks', region: 'US', unit: '$ per share', prefix: '$', decimals: 2, freq: 'daily', source: 'twelvedata', note: 'An ETF that tracks the S&P 500 index.', feed: { kind: 'twelvedata', symbol: 'SPY' } },
  { id: 'qqq', name: 'Nasdaq-100 ETF (QQQ)', cat: 'stocks', region: 'US', unit: '$ per share', prefix: '$', decimals: 2, freq: 'daily', source: 'twelvedata', note: 'An ETF that tracks the Nasdaq-100 index.', feed: { kind: 'twelvedata', symbol: 'QQQ' } },
  { id: 'dia', name: 'Dow Jones ETF (DIA)', cat: 'stocks', region: 'US', unit: '$ per share', prefix: '$', decimals: 2, freq: 'daily', source: 'twelvedata', note: 'An ETF that tracks the Dow Jones Industrial Average.', feed: { kind: 'twelvedata', symbol: 'DIA' } },
  { id: 'aapl', name: 'Apple (AAPL)', cat: 'stocks', region: 'US', unit: '$ per share', prefix: '$', decimals: 2, freq: 'daily', source: 'twelvedata', feed: { kind: 'twelvedata', symbol: 'AAPL' } },
  { id: 'msft', name: 'Microsoft (MSFT)', cat: 'stocks', region: 'US', unit: '$ per share', prefix: '$', decimals: 2, freq: 'daily', source: 'twelvedata', feed: { kind: 'twelvedata', symbol: 'MSFT' } },
  { id: 'nvda', name: 'NVIDIA (NVDA)', cat: 'stocks', region: 'US', unit: '$ per share', prefix: '$', decimals: 2, freq: 'daily', source: 'twelvedata', feed: { kind: 'twelvedata', symbol: 'NVDA' } },
  { id: 'amzn', name: 'Amazon (AMZN)', cat: 'stocks', region: 'US', unit: '$ per share', prefix: '$', decimals: 2, freq: 'daily', source: 'twelvedata', feed: { kind: 'twelvedata', symbol: 'AMZN' } },
  { id: 'googl', name: 'Alphabet (GOOGL)', cat: 'stocks', region: 'US', unit: '$ per share', prefix: '$', decimals: 2, freq: 'daily', source: 'twelvedata', feed: { kind: 'twelvedata', symbol: 'GOOGL' } },

  // ── Food: US average retail prices (BLS)
  { id: 'us-eggs', name: 'Eggs, dozen', cat: 'food', region: 'US', unit: '$ per dozen (grade A, large)', prefix: '$', decimals: 2, freq: 'monthly', source: 'bls', feed: fred('APU0000708111') },
  { id: 'us-bread', name: 'White bread', cat: 'food', region: 'US', unit: '$ per lb', prefix: '$', decimals: 2, freq: 'monthly', source: 'bls', feed: fred('APU0000702111') },
  { id: 'us-milk', name: 'Whole milk', cat: 'food', region: 'US', unit: '$ per gallon', prefix: '$', decimals: 2, freq: 'monthly', source: 'bls', feed: fred('APU0000709112') },
  { id: 'us-beef', name: 'Ground beef', cat: 'food', region: 'US', unit: '$ per lb (100% beef)', prefix: '$', decimals: 2, freq: 'monthly', source: 'bls', feed: fred('APU0000703112') },
  { id: 'us-chicken', name: 'Whole chicken', cat: 'food', region: 'US', unit: '$ per lb', prefix: '$', decimals: 2, freq: 'monthly', source: 'bls', feed: fred('APU0000706111') },
  { id: 'us-coffee', name: 'Ground coffee', cat: 'food', region: 'US', unit: '$ per lb (100% ground roast)', prefix: '$', decimals: 2, freq: 'monthly', source: 'bls', feed: fred('APU0000717311') },
  { id: 'us-bananas', name: 'Bananas', cat: 'food', region: 'US', unit: '$ per lb', prefix: '$', decimals: 2, freq: 'monthly', source: 'bls', feed: fred('APU0000711211') },
  { id: 'us-tomatoes', name: 'Tomatoes', cat: 'food', region: 'US', unit: '$ per lb (field grown)', prefix: '$', decimals: 2, freq: 'monthly', source: 'bls', feed: fred('APU0000712311') },
  { id: 'us-cheese', name: 'Cheddar cheese', cat: 'food', region: 'US', unit: '$ per lb', prefix: '$', decimals: 2, freq: 'monthly', source: 'bls', feed: fred('APU0000710212') },
  // ── Food: UK consumer price indices by category (ONS)
  { id: 'uk-food', name: 'UK food prices', cat: 'food', region: 'UK', unit: 'CPI index, 2015 = 100', decimals: 1, freq: 'monthly', source: 'ons', note: 'The ONS stopped publishing average prices per item in 2025, so UK food is tracked as price indices.', feed: ons(`${CPI}/d7c8/mm23`) },
  { id: 'uk-bread-cereals', name: 'UK bread & cereals', cat: 'food', region: 'UK', unit: 'CPI index, 2015 = 100', decimals: 1, freq: 'monthly', source: 'ons', feed: ons(`${CPI}/d7d5/mm23`) },
  { id: 'uk-meat', name: 'UK meat', cat: 'food', region: 'UK', unit: 'CPI index, 2015 = 100', decimals: 1, freq: 'monthly', source: 'ons', feed: ons(`${CPI}/d7d6/mm23`) },
  { id: 'uk-dairy', name: 'UK milk, cheese & eggs', cat: 'food', region: 'UK', unit: 'CPI index, 2015 = 100', decimals: 1, freq: 'monthly', source: 'ons', feed: ons(`${CPI}/d7d8/mm23`) },
  { id: 'uk-fruit', name: 'UK fruit', cat: 'food', region: 'UK', unit: 'CPI index, 2015 = 100', decimals: 1, freq: 'monthly', source: 'ons', feed: ons(`${CPI}/d7da/mm23`) },
  { id: 'uk-veg', name: 'UK vegetables', cat: 'food', region: 'UK', unit: 'CPI index, 2015 = 100', decimals: 1, freq: 'monthly', source: 'ons', feed: ons(`${CPI}/d7db/mm23`) },
  { id: 'uk-soft-drinks', name: 'UK non-alcoholic drinks', cat: 'food', region: 'UK', unit: 'CPI index, 2015 = 100', decimals: 1, freq: 'monthly', source: 'ons', feed: ons(`${CPI}/d7c9/mm23`) },

  // ── Commodities: world prices (IMF, monthly)
  { id: 'wheat', name: 'Wheat', cat: 'commodities', region: 'Global', unit: '$ per tonne', prefix: '$', decimals: 0, freq: 'monthly', source: 'imf', feed: fred('PWHEAMTUSDM') },
  { id: 'maize', name: 'Maize (corn)', cat: 'commodities', region: 'Global', unit: '$ per tonne', prefix: '$', decimals: 0, freq: 'monthly', source: 'imf', feed: fred('PMAIZMTUSDM') },
  { id: 'rice', name: 'Rice', cat: 'commodities', region: 'Global', unit: '$ per tonne', prefix: '$', decimals: 0, freq: 'monthly', source: 'imf', feed: fred('PRICENPQUSDM') },
  { id: 'soybeans', name: 'Soybeans', cat: 'commodities', region: 'Global', unit: '$ per tonne', prefix: '$', decimals: 0, freq: 'monthly', source: 'imf', feed: fred('PSOYBUSDM') },
  { id: 'coffee', name: 'Coffee (arabica)', cat: 'commodities', region: 'Global', unit: 'US cents per lb', suffix: '¢', decimals: 1, freq: 'monthly', source: 'imf', feed: fred('PCOFFOTMUSDM') },
  { id: 'cocoa', name: 'Cocoa', cat: 'commodities', region: 'Global', unit: '$ per tonne', prefix: '$', decimals: 0, freq: 'monthly', source: 'imf', feed: fred('PCOCOUSDM') },
  { id: 'sugar', name: 'Sugar', cat: 'commodities', region: 'Global', unit: 'US cents per lb', suffix: '¢', decimals: 2, freq: 'monthly', source: 'imf', feed: fred('PSUGAISAUSDM') },
  { id: 'beef', name: 'Beef', cat: 'commodities', region: 'Global', unit: 'US cents per lb', suffix: '¢', decimals: 1, freq: 'monthly', source: 'imf', feed: fred('PBEEFUSDM') },
  { id: 'olive-oil', name: 'Olive oil', cat: 'commodities', region: 'Global', unit: '$ per tonne', prefix: '$', decimals: 0, freq: 'monthly', source: 'imf', feed: fred('POLVOILUSDM') },
  { id: 'copper', name: 'Copper', cat: 'commodities', region: 'Global', unit: '$ per tonne', prefix: '$', decimals: 0, freq: 'monthly', source: 'imf', feed: fred('PCOPPUSDM') },
  { id: 'aluminium', name: 'Aluminium', cat: 'commodities', region: 'Global', unit: '$ per tonne', prefix: '$', decimals: 0, freq: 'monthly', source: 'imf', feed: fred('PALUMUSDM') },
  { id: 'iron-ore', name: 'Iron ore', cat: 'commodities', region: 'Global', unit: '$ per tonne', prefix: '$', decimals: 1, freq: 'monthly', source: 'imf', feed: fred('PIORECRUSDM') },

  // ── Energy (EIA)
  { id: 'brent', name: 'Brent crude oil', cat: 'energy', region: 'Global', unit: '$ per barrel', prefix: '$', decimals: 2, freq: 'daily', source: 'eia', feed: fred('DCOILBRENTEU') },
  { id: 'wti', name: 'WTI crude oil', cat: 'energy', region: 'US', unit: '$ per barrel', prefix: '$', decimals: 2, freq: 'daily', source: 'eia', feed: fred('DCOILWTICO') },
  { id: 'natgas', name: 'Natural gas (Henry Hub)', cat: 'energy', region: 'US', unit: '$ per million BTU', prefix: '$', decimals: 2, freq: 'daily', source: 'eia', feed: fred('DHHNGSP') },
  { id: 'us-petrol', name: 'US petrol (regular)', cat: 'energy', region: 'US', unit: '$ per gallon', prefix: '$', decimals: 2, freq: 'weekly', source: 'eia', feed: fred('GASREGW') },

  // ── Wages & earnings
  { id: 'us-hourly-pay', name: 'US average hourly pay', cat: 'wages', region: 'US', unit: '$ per hour (private sector)', prefix: '$', decimals: 2, freq: 'monthly', source: 'bls', feed: fred('CES0500000003') },
  { id: 'us-weekly-pay', name: 'US average weekly pay', cat: 'wages', region: 'US', unit: '$ per week (private sector)', prefix: '$', decimals: 0, freq: 'monthly', source: 'bls', feed: fred('CES0500000011') },
  { id: 'uk-weekly-pay', name: 'UK average weekly pay', cat: 'wages', region: 'UK', unit: '£ per week (whole economy, total pay)', prefix: '£', decimals: 0, freq: 'monthly', source: 'ons', feed: ons('employmentandlabourmarket/peopleinwork/earningsandworkinghours/timeseries/kab9/emp') },
  { id: 'us-median-weekly', name: 'US median weekly pay', cat: 'wages', region: 'US', unit: '$ per week (full-time, median)', prefix: '$', decimals: 0, freq: 'quarterly', source: 'bls', feed: fred('LEU0252881500Q') },
  { id: 'uk-real-weekly-pay', name: 'UK real weekly pay', cat: 'wages', region: 'UK', unit: '£ per week, adjusted for inflation (2015 prices)', prefix: '£', decimals: 0, freq: 'monthly', source: 'ons', note: 'Average weekly pay with inflation removed, so it shows what pay can buy.', feed: awe('a3wx') },
  { id: 'us-min-wage', name: 'US federal minimum wage', cat: 'wages', region: 'US', unit: '$ per hour', prefix: '$', decimals: 2, freq: 'monthly', source: 'bls', note: 'Many states set a higher minimum.', feed: fred('FEDMINNFRWG') },
  { id: 'us-worker-pay', name: 'US production & non-supervisory pay', cat: 'wages', region: 'US', unit: '$ per hour', prefix: '$', decimals: 2, freq: 'monthly', source: 'bls', feed: fred('AHETPI') },
  // UK average weekly pay by sector (ONS AWE). Seasonally adjusted where the ONS publishes it.
  ...[
    ['kac4', 'Private sector'], ['kac7', 'Public sector'], ['k5bz', 'Services'], ['k5ca', 'Manufacturing'], ['k5cd', 'Construction'],
    ['k5cg', 'Retail, hotels & restaurants'], ['k5c4', 'Finance & business services'],
  ].map(([cdid, sector]) => ({ id: `uk-pay-${cdid}`, name: `UK pay: ${sector}`, cat: 'wages', region: 'UK', unit: '£ per week (total pay, seasonally adjusted)', prefix: '£', decimals: 0, freq: 'monthly', source: 'ons', feed: awe(cdid) })),
  ...[
    ['k58u', 'Health & social work'], ['k58r', 'Education'], ['k58c', 'Hospitality (accommodation & food)'], ['k589', 'Retail'],
    ['k58i', 'Financial & insurance'], ['k5e9', 'Information & communication'], ['k5ec', 'Professional & scientific'], ['k58f', 'Transport & storage'],
    ['k5ei', 'Arts & entertainment'], ['k57a', 'Agriculture, forestry & fishing'], ['k57y', 'Energy & water supply'], ['k58o', 'Public administration'],
  ].map(([cdid, sector]) => ({ id: `uk-pay-${cdid}`, name: `UK pay: ${sector}`, cat: 'wages', region: 'UK', unit: '£ per week (total pay, not seasonally adjusted)', prefix: '£', decimals: 0, freq: 'monthly', source: 'ons', note: 'Not seasonally adjusted, so bonus months (often March) show as spikes.', feed: awe(cdid) })),
  // US average hourly pay by industry (BLS Current Employment Statistics)
  ...[
    ['CES3000000003', 'Manufacturing'], ['CES2000000003', 'Construction'], ['CES4200000003', 'Retail'], ['CES4142000003', 'Wholesale'],
    ['CES7000000003', 'Leisure & hospitality'], ['CES6500000003', 'Education & health'], ['CES5500000003', 'Finance'],
    ['CES5000000003', 'Information & tech'], ['CES6000000003', 'Professional & business services'], ['CES4300000003', 'Transport & warehousing'],
    ['CES1000000003', 'Mining & logging'], ['CES8000000003', 'Other services'],
  ].map(([id, industry]) => ({ id: `us-pay-${industry.toLowerCase().replace(/[^a-z]+/g, '-').replace(/-$/, '')}`, name: `US pay: ${industry}`, cat: 'wages', region: 'US', unit: '$ per hour (all employees)', prefix: '$', decimals: 2, freq: 'monthly', source: 'bls', feed: fred(id) })),

  // ── Currencies (ECB reference rates): every ECB currency against the pound, plus the main dollar and euro pairs
  ...CURRENCY_PAIRS,

  // ── Crypto (CoinGecko, last 365 days)
  { id: 'btc', name: 'Bitcoin', cat: 'crypto', region: 'Global', unit: '$ per coin', prefix: '$', decimals: 0, freq: 'daily', source: 'coingecko', note: 'Crypto history is limited to the last 365 days.', feed: { kind: 'coingecko', coin: 'bitcoin' } },
  { id: 'eth', name: 'Ethereum', cat: 'crypto', region: 'Global', unit: '$ per coin', prefix: '$', decimals: 0, freq: 'daily', source: 'coingecko', note: 'Crypto history is limited to the last 365 days.', feed: { kind: 'coingecko', coin: 'ethereum' } },
  { id: 'sol', name: 'Solana', cat: 'crypto', region: 'Global', unit: '$ per coin', prefix: '$', decimals: 2, freq: 'daily', source: 'coingecko', note: 'Crypto history is limited to the last 365 days.', feed: { kind: 'coingecko', coin: 'solana' } },
  { id: 'xrp', name: 'XRP', cat: 'crypto', region: 'Global', unit: '$ per coin', prefix: '$', decimals: 3, freq: 'daily', source: 'coingecko', note: 'Crypto history is limited to the last 365 days.', feed: { kind: 'coingecko', coin: 'ripple' } },

  // ── Inflation & interest rates
  { id: 'uk-cpi', name: 'UK consumer prices (CPI)', cat: 'rates', region: 'UK', unit: 'CPI index, 2015 = 100', decimals: 1, freq: 'monthly', source: 'ons', feed: ons(`${CPI}/d7bt/mm23`) },
  { id: 'uk-inflation', name: 'UK inflation rate', cat: 'rates', region: 'UK', unit: 'CPI, % change on a year earlier', suffix: '%', decimals: 1, freq: 'monthly', source: 'ons', feed: ons(`${CPI}/d7g7/mm23`) },
  { id: 'us-cpi', name: 'US consumer prices (CPI)', cat: 'rates', region: 'US', unit: 'CPI-U index, 1982–84 = 100', decimals: 1, freq: 'monthly', source: 'bls', feed: fred('CPIAUCSL') },
  { id: 'us-fed-funds', name: 'US Federal Funds rate', cat: 'rates', region: 'US', unit: '% per year', suffix: '%', decimals: 2, freq: 'monthly', source: 'treasury', feed: fred('FEDFUNDS') },
  { id: 'us-10y', name: 'US 10-year Treasury yield', cat: 'rates', region: 'US', unit: '% per year', suffix: '%', decimals: 2, freq: 'daily', source: 'treasury', feed: fred('DGS10') },
  { id: 'uk-10y', name: 'UK 10-year gilt yield', cat: 'rates', region: 'UK', unit: '% per year (monthly average)', suffix: '%', decimals: 2, freq: 'monthly', source: 'oecd', feed: fred('IRLTLT01GBM156N') },
];

// Money amounts get a currency so they can be shown in another one ($ → USD, £ → GBP, US cents → USD
// minor units). Exchange rates, indices and percentages are never converted.
for (const i of INSTRUMENTS) {
  if (i.cat === 'currencies' || i.cat === 'rates') continue;
  if (i.prefix === '$') i.ccy = 'USD';
  else if (i.prefix === '£') i.ccy = 'GBP';
  else if (/^US cents/.test(i.unit)) Object.assign(i, { ccy: 'USD', minor: true });
}

export const byId = new Map(INSTRUMENTS.map((i) => [i.id, i]));

/** Used for "minutes of work" on US food prices. */
export const US_HOURLY_PAY_ID = 'us-hourly-pay';
