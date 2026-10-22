/* Read-only presentation of the original transaction store and v2 trade events.
 * Persist edits to sourceId/investmentEventId, never persist these projected rows.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./investment-engine.js'));
  else root.UnifiedLedger = factory(root.InvestmentLedger);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (E) {
  'use strict';
  const TRADE_TYPES = new Set(['buy', 'sell', 'dividend']);
  const MAP_FIELDS = ['navMap', 'fundNames', 'priceHistory', 'navSourceMap', 'trackingMap'];
  const PRICE_FIELDS = new Set(['navMap', 'priceHistory', 'navSourceMap']);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const displayCode = value => String(value || '').split('@@')[0];
  const clone = value => {
    if (Array.isArray(value)) return value.map(clone);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  };
  const numeric = value => value === '' || value == null ? null : Number.isFinite(Number(value)) ? Number(value) : null;
  const platformFor = transaction => E.platformForTransaction(transaction);

  function build(legacyTransactions = [], investmentData = {}, maps = {}) {
    const now = new Date();
    const asOf = maps.asOf || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const events = Array.isArray(investmentData.events) ? investmentData.events : [];
    const sourceRows = [];
    for (const [index, t] of (Array.isArray(legacyTransactions) ? legacyTransactions : []).entries()) {
      if (!t || !TRADE_TYPES.has(t.type)) continue;
      const platformId = platformFor(t), symbol = String(t.fundCode || '');
      sourceRows.push({
        ...clone(t), source: 'legacy', sourceId: t.id, platformId,
        account: platformId, symbol, currency: t.currency || 'HKD', seq: Number.isFinite(t.seq) ? t.seq : index,
        originalHouse: t.house || '', house: E.ACCOUNTS[platformId] || t.house || platformId,
      });
    }
    for (const [index, e] of events.entries()) {
      if (!e || !TRADE_TYPES.has(e.type)) continue;
      const platformId = e.account, symbol = String(e.symbol || ''), price = numeric(e.price);
      sourceRows.push({
        ...clone(e), id: 'v2:' + e.id, source: 'investment', sourceId: e.id,
        investmentEventId: e.id, platformId, account: platformId, symbol, seq: Number.isFinite(e.seq) ? e.seq : index,
        house: E.ACCOUNTS[platformId] || platformId, currency: e.currency || 'HKD',
        nav: e.type === 'dividend' ? null : price,
        units: e.type === 'dividend' ? 0 : Number(e.units || 0),
        amount: Number(e.amount || 0), fee: Number(e.fee || 0), refNo: e.refNo || '',
      });
    }

    const combinations = new Map(), currencies = new Map(), legacyCurrencies = new Map();
    for (const row of sourceRows) {
      const key = row.symbol || '未指定資產';
      if (!combinations.has(key)) combinations.set(key, new Set());
      combinations.get(key).add(row.platformId + '@@' + row.currency);
      if (!currencies.has(key)) currencies.set(key, new Set());
      currencies.get(key).add(row.currency);
      if (row.source === 'legacy') {
        if (!legacyCurrencies.has(key)) legacyCurrencies.set(key, new Set());
        legacyCurrencies.get(key).add(row.currency);
      }
    }
    const instruments = Object.create(null);
    const transactions = sourceRows.map(row => {
      const shownSymbol = row.symbol || '未指定資產';
      const compositeKey = `${shownSymbol}@@${row.platformId}@@${row.currency}`;
      const fundCode = combinations.get(shownSymbol).size > 1 ? compositeKey : shownSymbol;
      if (!own(instruments, fundCode)) {
        instruments[fundCode] = {
          key: fundCode, fundCode, compositeKey, symbol: row.symbol,
          displayCode: shownSymbol, platformId: row.platformId, account: row.platformId,
          currency: row.currency, house: row.house, quoteKey: `${row.platformId}:${row.symbol}:${row.currency}`,
          hasLegacy: false, hasInvestment: false, sourceIds: [], investmentEventIds: [],
        };
      }
      const instrument = instruments[fundCode];
      instrument.sourceIds.push({ source: row.source, id: row.sourceId });
      if (row.source === 'legacy') instrument.hasLegacy = true;
      else {
        instrument.hasInvestment = true;
        instrument.investmentEventIds.push(row.investmentEventId);
        if (row.name) instrument.name = row.name;
      }
      return { ...row, fundCode, displayCode: shownSymbol, positionKey: compositeKey, future: String(row.date) > asOf };
    });

    const projected = Object.fromEntries(MAP_FIELDS.map(field => [field, clone(maps[field] || {})]));
    for (const instrument of Object.values(instruments)) {
      const { fundCode, compositeKey, symbol, quoteKey } = instrument;
      const q = investmentData.quotes && investmentData.quotes[quoteKey];
      const quote = q && numeric(q.price) > 0 && E.dateOK(q.date) && q.date <= asOf ? q : null;
      // Bare prices predate platform keys. Attribute them only when their original
      // denomination is unambiguous; HKD NAV/history must never value a USD position.
      const sourceCurrencies = legacyCurrencies.get(symbol || '未指定資產') || currencies.get(symbol || '未指定資產');
      const barePriceMatches = sourceCurrencies.size === 1 && sourceCurrencies.has(instrument.currency);
      for (const field of MAP_FIELDS) {
        const source = maps[field] || {};
        const hasExact = own(source, compositeKey);
        if (hasExact) projected[field][fundCode] = clone(source[compositeKey]);
        else if (own(source, symbol) && (!PRICE_FIELDS.has(field) || barePriceMatches)) projected[field][fundCode] = clone(source[symbol]);
        if (field === 'fundNames' && !own(projected[field], fundCode) && instrument.name) {
          projected[field][fundCode] = instrument.name;
        }
        if (quote && field === 'navMap' && !hasExact) projected[field][fundCode] = Number(quote.price);
        if (quote && field === 'navSourceMap' && !hasExact && !own(maps.navMap || {}, compositeKey)) {
          projected[field][fundCode] = { type: 'investment-quote', date: quote.date };
        }
        if (quote && field === 'priceHistory') {
          const history = Array.isArray(projected[field][fundCode]) ? projected[field][fundCode] : [];
          const index = history.findIndex(point => point.date === quote.date);
          const point = { date: quote.date, price: Number(quote.price) };
          // A platform-specific history point is an intentional manual override.
          if (index === -1) history.push(point);
          else if (!hasExact) history[index] = point;
          projected[field][fundCode] = history.sort((a, b) => String(a.date).localeCompare(String(b.date)));
        }
      }
    }
    // Original charts keep stable order for equal dates. Establish the same sequence
    // as accounting before handing them a union of records from separate stores.
    transactions.sort((a, b) => String(a.date).localeCompare(String(b.date)) || (a.seq || 0) - (b.seq || 0));
    return { transactions, instruments, ...projected };
  }
  return { build, displayCode };
});
