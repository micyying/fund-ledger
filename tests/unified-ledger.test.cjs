const assert = require('node:assert/strict');
const E = require('../investment-engine.js');
const U = require('../unified-ledger.js');
let checks = 0;
const eq = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const legacy = (id, x = {}) => ({ id, type: 'buy', fundCode: 'F', platform: 'flexinvest', house: '滙豐', date: '2026-01-01', units: 10, amount: 100, fee: 1, currency: 'HKD', nav: 10, ...x });
const event = (id, x = {}) => ({ id, type: 'buy', symbol: 'AAPL', account: 'trade25', date: '2026-01-02', units: 1, amount: 100, fee: 2, currency: 'USD', price: 100, settlement: 'wallet', seq: 12, ...x });
const frozen = value => { if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); } return value; };

// A presentation union keeps each record in its original store, with edit dispatch metadata.
const original = frozen([legacy('L1'), legacy('L2', { type: 'dividend', units: 0, amount: 5 })]);
const data = frozen({ events: [event('E1'), event('X', { type: 'exchange' }), event('M', { type: 'fee' })], quotes: { 'trade25:AAPL:USD': { price: 120, date: '2026-02-01' } } });
const maps = frozen({ navMap: { F: 11, AAPL: 115 }, fundNames: { F: '原有基金' }, priceHistory: { AAPL: [{ date: '2026-01-01', price: 90 }] }, trackingMap: { F: { targets: [{ code: 'T' }] } } });
const before = JSON.stringify({ original, data, maps });
let result = U.build(original, data, maps);
eq(result.transactions.length, 3);
eq(result.transactions[0].id, 'L1');
eq(result.transactions[0].source, 'legacy');
eq(result.transactions[0].sourceId, 'L1');
eq(result.transactions[2].id, 'v2:E1');
eq(result.transactions[2].investmentEventId, 'E1');
eq(result.transactions[2].sourceId, 'E1');
eq(result.transactions[2].settlement, 'wallet');
eq(result.transactions[2].seq, 12);
eq(result.transactions[2].nav, 100);
eq(result.navMap.AAPL, 120);
eq(result.navSourceMap.AAPL, { type: 'investment-quote', date: '2026-02-01' });
eq(result.priceHistory.AAPL, [{ date: '2026-01-01', price: 90 }, { date: '2026-02-01', price: 120 }]);
eq(JSON.stringify({ original, data, maps }), before);
result.transactions[0].note = 'temporary view edit';
result.trackingMap.F.targets[0].code = 'other';
eq(JSON.stringify({ original, data, maps }), before);

// Same source ID in different stores is distinct; no duplicate cash or fee row is projected.
result = U.build([legacy('same')], { events: [event('same')] });
eq(result.transactions.map(row => row.id), ['same', 'v2:same']);
eq(result.transactions.map(row => row.symbol), ['F', 'AAPL']);

// Same symbol on another platform or in another currency becomes a separate position.
const collisionLegacy = [legacy('L1', { fundCode: 'SAME', currency: 'USD' }), legacy('L2', { fundCode: 'SAME', currency: 'HKD' })];
const collisionEvents = { events: [event('E1', { symbol: 'SAME' }), event('E2', { symbol: 'SAME', type: 'sell', units: 0.5 })], quotes: { 'trade25:SAME:USD': { price: 21, date: '2026-03-01' } } };
result = U.build(collisionLegacy, collisionEvents, { navMap: { SAME: 10 }, fundNames: { SAME: '共同名稱' }, trackingMap: { SAME: { stockRatio: 50 } } });
eq(Object.keys(result.instruments).length, 3);
eq(result.transactions.map(row => row.fundCode), ['SAME@@flexinvest@@USD', 'SAME@@flexinvest@@HKD', 'SAME@@trade25@@USD', 'SAME@@trade25@@USD']);
eq(result.transactions.map(row => row.symbol), ['SAME', 'SAME', 'SAME', 'SAME']);
eq(result.navMap['SAME@@flexinvest@@HKD'], undefined);
eq(result.navMap['SAME@@flexinvest@@USD'], undefined);
eq(result.navMap['SAME@@trade25@@USD'], 21);
eq(result.fundNames['SAME@@flexinvest@@USD'], '共同名稱');
eq(result.trackingMap['SAME@@trade25@@USD'], { stockRatio: 50 });
eq(U.displayCode('SAME@@trade25@@USD'), 'SAME');

// Composite manual overrides win, even when a later view only contains one position.
const override = frozen({ navMap: { SAME: 10, 'SAME@@trade25@@USD': 25 }, fundNames: { SAME: '共同名稱', 'SAME@@trade25@@USD': '平台名稱' }, priceHistory: { 'SAME@@trade25@@USD': [{ date: '2026-03-01', price: 24 }] }, navSourceMap: { 'SAME@@trade25@@USD': { type: 'screenshot-estimate' } } });
result = U.build(collisionLegacy, collisionEvents, override);
eq(result.navMap['SAME@@trade25@@USD'], 25);
eq(result.fundNames['SAME@@trade25@@USD'], '平台名稱');
eq(result.priceHistory['SAME@@trade25@@USD'], [{ date: '2026-03-01', price: 24 }]);
eq(result.navSourceMap['SAME@@trade25@@USD'], { type: 'screenshot-estimate' });
result = U.build([], collisionEvents, override);
eq(result.transactions[0].fundCode, 'SAME');
eq(result.navMap.SAME, 25);
eq(result.fundNames.SAME, '平台名稱');

// Both stores may describe one position without adding a second position or losing source rows.
result = U.build([legacy('L1', { fundCode: 'F', currency: 'HKD' })], { events: [event('E1', { symbol: 'F', account: 'flexinvest', currency: 'HKD', name: '基金名稱' })] });
eq(result.transactions.length, 2);
eq(Object.keys(result.instruments), ['F']);
eq(result.instruments.F.hasLegacy, true);
eq(result.instruments.F.hasInvestment, true);
eq(result.fundNames.F, '基金名稱');

// A symbol-less historical dividend still appears once with enough metadata to edit it.
result = U.build([], { events: [event('D', { type: 'dividend', symbol: '', amount: 5 })] });
eq(result.transactions[0].fundCode, '未指定資產');
eq(result.transactions[0].symbol, '');
eq(result.transactions[0].nav, null);
eq(result.transactions[0].investmentEventId, 'D');
eq(result.transactions[0].units, 0);

// Bare legacy HKD metadata belongs only to HKD; a USD quote seeds a separate history.
const hkdLegacy = [legacy('HKD', { fundCode: 'MULTI', currency: 'HKD' })];
const usdEvent = { events: [event('USD', { symbol: 'MULTI' })] };
const currencyMaps = frozen({ navMap: { MULTI: 100 }, priceHistory: { MULTI: [{ date: '2026-01-01', price: 90 }] }, navSourceMap: { MULTI: { type: 'screenshot-estimate' } }, fundNames: { MULTI: '共用名稱' } });
result = U.build(hkdLegacy, usdEvent, currencyMaps);
eq(result.navMap['MULTI@@flexinvest@@HKD'], 100);
eq(result.priceHistory['MULTI@@flexinvest@@HKD'], [{ date: '2026-01-01', price: 90 }]);
eq(result.navMap['MULTI@@trade25@@USD'], undefined);
eq(result.priceHistory['MULTI@@trade25@@USD'], undefined);
eq(result.navSourceMap['MULTI@@trade25@@USD'], undefined);
eq(result.fundNames['MULTI@@trade25@@USD'], '共用名稱');
result = U.build(hkdLegacy, { ...usdEvent, quotes: { 'trade25:MULTI:USD': { price: 15, date: '2026-03-01' } } }, currencyMaps);
eq(result.navMap['MULTI@@trade25@@USD'], 15);
eq(result.priceHistory['MULTI@@trade25@@USD'], [{ date: '2026-03-01', price: 15 }]);
eq(result.navSourceMap['MULTI@@trade25@@USD'], { type: 'investment-quote', date: '2026-03-01' });
// The same currency on another platform may safely reuse the original price.
result = U.build(hkdLegacy, { events: [event('HKD2', { symbol: 'MULTI', currency: 'HKD' })] }, currencyMaps);
eq(result.navMap['MULTI@@trade25@@HKD'], 100);
// With two v2 currencies and no original rows, the old bare quote is ambiguous.
result = U.build([], { events: [event('USD', { symbol: 'MULTI' }), event('HKD', { symbol: 'MULTI', currency: 'HKD' })] }, currencyMaps);
eq(result.navMap['MULTI@@trade25@@USD'], undefined);
eq(result.navMap['MULTI@@trade25@@HKD'], undefined);

// Stable same-day order crosses storage sources, so old date-only charts see buys before sells.
result = U.build([legacy('late', { type: 'sell', fundCode: 'ORDER', platformId: 'trade25', date: '2026-03-01', seq: 2 })], { events: [event('early', { symbol: 'ORDER', currency: 'HKD', date: '2026-03-01', seq: 1 })] });
eq(result.transactions.map(row => row.id), ['v2:early', 'late']);

// Future quotes do not become timeless canonical NAV; future rows remain available to correct.
result = U.build([], { events: [event('future', { date: '2026-11-01' })], quotes: { 'trade25:AAPL:USD': { price: 999, date: '2026-11-01' } } }, { asOf: '2026-10-18' });
eq(result.navMap.AAPL, undefined);
eq(result.priceHistory.AAPL, undefined);
eq(result.transactions[0].future, true);

// A replay is deterministic and does not re-add source rows or quote points.
eq(U.build(collisionLegacy, collisionEvents, override), U.build(collisionLegacy, collisionEvents, override));
assert.equal(typeof E.platformForTransaction, 'function');
console.log(`${checks} unified ledger projection checks passed`);
