/* v2 accounting: actual cash flows are authoritative. No network or implicit storage access. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.InvestmentLedger = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const EPS = 1e-7;
  const ACCOUNTS = { trade25: 'Trade25', flexinvest: 'FlexInvest' };
  const TYPES = ['buy', 'sell', 'dividend', 'exchange', 'deposit', 'withdraw', 'fee'];
  const EVENT_FIELDS = ['id','type','account','date','currency','settlement','amount','fee','units','symbol','name','price','hkd','usd','direction','feeHKD','feeParts','seq','category','month','status','note'];
  const blank = () => ({ schemaVersion: 2, events: [], legacyHKD: {}, quotes: {}, fx: {}, flexMonthly: {} });
  const number = v => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v));
  const positive = v => number(v) && Number(v) > 0;
  function dateOK(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v; }
  const monthOK = v => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
  function validateEvent(e) {
    if (!e || typeof e !== 'object' || !e.id || typeof e.id !== 'string') throw Error('紀錄缺少識別碼');
    if (!Object.hasOwn(ACCOUNTS, e.account) || !TYPES.includes(e.type) || !dateOK(e.date)) throw Error('平台、交易類型或日期不正確');
    if (!['HKD', 'USD'].includes(e.currency)) throw Error('新增紀錄只支援 HKD 或 USD');
    if (!positive(e.amount)) throw Error('金額須大於零');
    if (!number(e.fee || 0) || Number(e.fee || 0) < 0) throw Error('費用不能是負數');
    if (!['wallet', 'external'].includes(e.settlement)) throw Error('請選擇結算方式');
    if (['deposit', 'withdraw'].includes(e.type) && e.settlement !== 'external') throw Error('入金／提取須使用帳本外結算');
    if (e.seq !== undefined && (!Number.isFinite(e.seq) || e.seq < 0)) throw Error('同日順序須為非負數字');
    if (e.type === 'buy' || e.type === 'sell') {
      if (!e.symbol || typeof e.symbol !== 'string' || !positive(e.units)) throw Error('請填代碼及正數股數／單位');
      if (e.type === 'sell' && Number(e.fee || 0) >= Number(e.amount)) throw Error('賣出費用須少於成交金額');
    }
    if (e.type === 'dividend' && Number(e.fee || 0) >= Number(e.amount)) throw Error('扣稅及費用須少於派息總額');
    if (e.currency !== 'HKD' && e.settlement === 'external' && e.type !== 'exchange' && !positive(e.hkd)) throw Error('請填實際港幣總扣款／淨收款（包括所有費用）');
    if (e.type === 'exchange' && (!positive(e.hkd) || !positive(e.usd) || !['toUSD', 'toHKD'].includes(e.direction))) throw Error('請填換匯方向、港幣與美元實收／實付金額');
    if (e.type === 'fee') {
      if (!['confirmed', 'pending'].includes(e.status)) throw Error('請選擇已扣款或待核實');
      if (e.category === 'platform' && !monthOK(e.month)) throw Error('平台月費須填所屬月份');
    }
    if (!['buy','sell','dividend'].includes(e.type) && Number(e.fee || 0) !== 0) throw Error('此類紀錄請把費用包含在實收／實付金額，或另記費用');
    if (e.feeParts) {
      if (!Array.isArray(e.feeParts) || e.feeParts.some(p => !p || !number(p.amount) || Number(p.amount) < 0)) throw Error('費用明細格式不正確');
      if (Math.abs(e.feeParts.reduce((n, p) => n + Number(p.amount), 0) - Number(e.fee || 0)) > 0.005) throw Error('費用明細與總額不一致');
    }
    if (e.feeHKD !== undefined && e.feeHKD !== '' && (!number(e.feeHKD) || Number(e.feeHKD) < 0 || Number(e.feeHKD) > Number(e.hkd))) throw Error('已包含的換匯費不能超過港幣金額');
    return e;
  }
  const feeKey = e => e.type === 'fee' && e.category === 'platform' ? `${e.account}:${e.month}` : null;
  function normalize(raw) {
    if (raw == null) return blank();
    if (raw.schemaVersion !== 2 || !Array.isArray(raw.events)) throw Error('不支援這個投資帳本版本，原有資料未改動');
    const out = blank(), ids = new Set(), fees = new Set();
    out.events = raw.events.map((e, i) => {
      validateEvent(e);
      if (ids.has(e.id)) throw Error('有重複的交易識別碼');
      ids.add(e.id);
      const k = feeKey(e);
      if (k && fees.has(k)) throw Error('同一平台同一月份不可重複記月費');
      if (k) fees.add(k);
      return { ...Object.fromEntries(EVENT_FIELDS.filter(k => Object.hasOwn(e,k)).map(k => [k,e[k]])), seq: Number.isFinite(e.seq) ? e.seq : i };
    });
    for (const field of ['legacyHKD', 'quotes', 'fx', 'flexMonthly']) {
      if (raw[field] != null && (typeof raw[field] !== 'object' || Array.isArray(raw[field]))) throw Error('備份設定格式不正確');
      out[field] = Object.fromEntries(Object.entries(raw[field] || {}).filter(([k]) => !['__proto__', 'constructor', 'prototype'].includes(k)));
    }
    for (const v of Object.values(out.legacyHKD)) if (!positive(v)) throw Error('舊交易的港幣收付金額須大於零');
    for (const v of Object.values(out.quotes)) if (!v || !positive(v.price) || !dateOK(v.date)) throw Error('現價須附有正確日期');
    for (const v of Object.values(out.fx)) if (!v || !positive(v.rate) || !dateOK(v.date)) throw Error('估值匯率須附有正確日期');
    for (const [m, v] of Object.entries(out.flexMonthly)) if (!monthOK(m) || !number(v) || Number(v) < 0) throw Error('每月平均持倉市值格式不正確');
    return out;
  }
  function merge(a, b) {
    const left = normalize(a), right = normalize(b), ids = new Set(left.events.map(e => e.id));
    const fees = new Set(left.events.map(feeKey).filter(Boolean));
    const events = [...left.events];
    for (const e of right.events) {
      if (ids.has(e.id) || (feeKey(e) && fees.has(feeKey(e)))) continue;
      events.push(e); ids.add(e.id); if (feeKey(e)) fees.add(feeKey(e));
    }
    return normalize({ schemaVersion: 2, events, ...Object.fromEntries(['legacyHKD', 'quotes', 'fx', 'flexMonthly'].map(k => [k, { ...right[k], ...left[k] }])) });
  }
  function atomicWrite(storage, changes) {
    const previous = Object.fromEntries(Object.keys(changes).map(k => [k, storage.getItem(k)]));
    try { for (const [k, value] of Object.entries(changes)) storage.setItem(k, value); }
    catch (err) {
      // Free only keys in this transaction before restoring their exact prior values.
      for (const k of Object.keys(changes)) storage.removeItem(k);
      for (const [k, value] of Object.entries(previous)) if (value !== null) storage.setItem(k, value);
      throw Error('儲存空間不足或無法寫入；已保留匯入前資料。' + err.message);
    }
  }
  function months(from, to) {
    if (!monthOK(from) || !monthOK(to) || from > to) throw Error('請選擇正確的起止月份');
    const out = []; let m = from;
    while (m <= to && out.length < 121) {
      out.push(m); const [y, n] = m.split('-').map(Number); m = n === 12 ? `${y + 1}-01` : `${y}-${String(n + 1).padStart(2, '0')}`;
    }
    if (out.length > 120) throw Error('每次最多補記 120 個月');
    return out;
  }
  function flexFee(avg) {
    if (!number(avg) || Number(avg) < 0) return { amount: null, reason: '待補每月平均持倉市值' };
    if (Number(avg) < 10000) return { amount: 0, reason: '月平均低於 HK$10,000，免月費' };
    if (Number(avg) <= 200000) return { amount: 28, reason: '月平均 HK$10,000–200,000' };
    return { amount: null, reason: '超過 HK$200,000，按年率 0.8% 計；請依銀行帳單填實際金額' };
  }
  function trade25Active(events, month) {
    const end = month + '-31', units = new Map();
    for (const e of [...events].sort((a, b) => a.date.localeCompare(b.date) || (a.seq || 0) - (b.seq || 0))) {
      if (e.account !== 'trade25' || !['buy', 'sell'].includes(e.type) || e.date > end) continue;
      if (e.date.slice(0, 7) === month) return true;
      const key = `${e.symbol}:${e.currency}`;
      units.set(key, (units.get(key) || 0) + (e.type === 'buy' ? 1 : -1) * Number(e.units));
    }
    return [...units.values()].some(v => v > EPS);
  }
  function feeSuggestions(data, from, to) {
    const d = normalize(data), keys = new Set(d.events.map(feeKey).filter(Boolean));
    return months(from, to).flatMap(month => {
      const flex = flexFee(d.flexMonthly[month]);
      return [
        { account: 'trade25', month, amount: trade25Active(d.events, month) ? 25 : null, reason: trade25Active(d.events, month) ? '當月曾交易或持股' : '未找到當月交易／持股；請核對是否漏記' },
        { account: 'flexinvest', month, ...flex },
      ].map(r => ({ ...r, exists: keys.has(`${r.account}:${r.month}`) }));
    });
  }
  function calculate(raw, legacy = [], nav = {}, asOf = new Date().toISOString().slice(0, 10)) {
    const d = normalize(raw), issues = [], missing = [], rows = [], holdings = new Map();
    const accounts = Object.fromEntries(Object.keys(ACCOUNTS).map(k => [k, { id: k, deposits: 0, withdrawals: 0, feesHKD: 0, feeDetails: [], pendingHKD: 0, assets: 0, complete: true, cash: { HKD: { amount: 0, basis: 0 }, USD: { amount: 0, basis: 0 } }, nativeGain: {}, settledGain: 0 }]));
    const mark = (a, message) => { a.complete = false; missing.push(message); };
    const rate = c => c === 'HKD' ? 1 : (d.fx[c] && d.fx[c].date <= asOf ? Number(d.fx[c].rate) : null);
    const getHolding = (a, symbol, currency, legacySource = false) => {
      const key = `${a.id}:${legacySource ? 'legacy:' : ''}${symbol}:${currency}`;
      if (!holdings.has(key)) holdings.set(key, { key, account: a.id, symbol, currency, units: 0, nativeCost: 0, basis: 0, basisKnown: true, legacy: legacySource });
      return holdings.get(key);
    };
    function takeCash(a, ccy, amount) {
      const c = a.cash[ccy];
      if (!c || amount > c.amount + EPS) throw Error(`${ccy} 現金不足；請先補入金／換匯，或選直接以港幣結算`);
      const cost = c.amount > EPS ? c.basis * amount / c.amount : 0;
      c.amount -= amount; c.basis -= cost;
      if (Math.abs(c.amount) < EPS) { c.amount = 0; c.basis = 0; }
      return cost;
    }
    function addCash(a, ccy, amount, basis) { a.cash[ccy].amount += amount; a.cash[ccy].basis += basis; }
    const ordered = d.events.map((e, i) => ({ ...e, seq: e.seq ?? i })).sort((a, b) => a.date.localeCompare(b.date) || a.seq - b.seq);
    for (const e of ordered) {
      const a = accounts[e.account];
      if (e.type === 'fee' && e.status === 'pending') {
        const r = rate(e.currency); if (r) a.pendingHKD += Number(e.amount) * r;
        rows.push({ ...e, pending: true }); continue;
      }
      if (e.date > asOf) { rows.push({ ...e, future: true }); continue; }
      const amount = Number(e.amount), fee = Number(e.fee || 0), external = e.settlement === 'external';
      const row = { ...e };
      try {
        if (e.type === 'exchange') {
          const hkd = Number(e.hkd), usd = Number(e.usd);
          if (e.direction === 'toUSD') {
            if (external) a.deposits += hkd; else takeCash(a, 'HKD', hkd);
            addCash(a, 'USD', usd, hkd);
          } else {
            const basis = takeCash(a, 'USD', usd);
            if (external) a.withdrawals += hkd; else addCash(a, 'HKD', hkd, hkd);
            row.settledGain = hkd - basis; a.settledGain += row.settledGain;
          }
          a.feeDetails.push({currency: 'HKD', amount: Number(e.feeHKD || 0)});
        } else if (e.type === 'deposit') {
          const cost = e.currency === 'HKD' ? amount : Number(e.hkd);
          a.deposits += cost; addCash(a, e.currency, amount, cost);
        } else if (e.type === 'withdraw') {
          const value = e.currency === 'HKD' ? amount : Number(e.hkd);
          const cost = takeCash(a, e.currency, amount);
          a.withdrawals += value; row.settledGain = value - cost; a.settledGain += row.settledGain;
        } else if (e.type === 'buy') {
          const total = amount + fee;
          const cost = external ? (e.currency === 'HKD' ? total : Number(e.hkd)) : takeCash(a, e.currency, total);
          if (external) a.deposits += cost;
          const h = getHolding(a, e.symbol, e.currency);
          h.units += Number(e.units); h.nativeCost += total; h.basis += cost;
          a.feeDetails.push({currency: e.currency, amount: fee, hkd: external ? cost * fee / total : null});
          row.hkdCost = cost;
        } else if (e.type === 'sell') {
          const h = getHolding(a, e.symbol, e.currency);
          if (Number(e.units) > h.units + EPS) throw Error('賣出股數超過當時持倉');
          const fraction = Number(e.units) / h.units, nativeCost = h.nativeCost * fraction, basis = h.basis * fraction;
          const net = amount - fee;
          h.units -= Number(e.units); h.nativeCost -= nativeCost; h.basis -= basis;
          row.nativeGain = net - nativeCost;
          a.nativeGain[e.currency] = (a.nativeGain[e.currency] || 0) + row.nativeGain;
          if (external) {
            const hkd = e.currency === 'HKD' ? net : Number(e.hkd);
            a.withdrawals += hkd; row.settledGain = hkd - basis; a.settledGain += row.settledGain;
            a.feeDetails.push({currency: e.currency, amount: fee, hkd: hkd / net * fee});
          } else {
            // USD carries unrecovered historical HKD principal, including prior investment outcomes.
            // This is cash-flow attribution, not tax basis or a pure FX-profit calculation.
            addCash(a, e.currency, net, e.currency === 'HKD' ? net : basis);
            if (e.currency === 'HKD') { row.settledGain = net - basis; a.settledGain += row.settledGain; }
            a.feeDetails.push({currency: e.currency, amount: fee});
          }
          row.hkdCost = basis;
        } else if (e.type === 'dividend') {
          const net = amount - fee;
          if (external) { const hkd = e.currency === 'HKD' ? net : Number(e.hkd); a.withdrawals += hkd; a.feeDetails.push({currency: e.currency, amount: fee, hkd: hkd / net * fee}); }
          else { addCash(a, e.currency, net, e.currency === 'HKD' ? net : 0); a.feeDetails.push({currency: e.currency, amount: fee}); }
          a.nativeGain[e.currency] = (a.nativeGain[e.currency] || 0) + net;
        } else if (e.type === 'fee') {
          if (external) { const cost = e.currency === 'HKD' ? amount : Number(e.hkd); a.deposits += cost; a.feeDetails.push({currency: e.currency, amount, hkd: cost}); }
          else { takeCash(a, e.currency, amount); a.feeDetails.push({currency: e.currency, amount}); }
        }
        rows.push(row);
      } catch (err) { a.complete = false; issues.push({ id: e.id, message: `${e.date} ${e.symbol || e.type}：${err.message}` }); rows.push({...row, error: err.message}); }
    }
    // Legacy funds keep their original records and cost method. Only HKD overrides are additive.
    for (const t of [...legacy].sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
      if (t.date > asOf) continue;
      const a = accounts.flexinvest, ccy = t.currency || 'HKD', fee = Number(t.fee || 0), amount = Number(t.amount);
      if (!Number.isFinite(amount) || amount < 0 || !['buy', 'sell', 'dividend'].includes(t.type)) { mark(a, `舊交易 ${t.id} 格式待核對`); continue; }
      const h = getHolding(a, t.fundCode, ccy, true);
      const nativeNet = t.type === 'buy' ? amount + fee : amount - fee;
      const hkd = ccy === 'HKD' ? nativeNet : (positive(d.legacyHKD[t.id]) ? Number(d.legacyHKD[t.id]) : null);
      if (hkd === null) { mark(a, `${t.date} ${t.fundCode} 待補實際港幣收付`); h.basisKnown = false; }
      if (t.type === 'buy') {
        h.units += Number(t.units); h.nativeCost += nativeNet; h.basis += hkd || 0; a.deposits += hkd || 0;
      } else if (t.type === 'sell') {
        if (Number(t.units) > h.units + EPS || !h.units) { mark(a, `${t.date} ${t.fundCode} 舊紀錄賣出超過持倉`); continue; }
        const fraction = Number(t.units) / h.units, cost = h.nativeCost * fraction, basis = h.basis * fraction;
        h.units -= Number(t.units); h.nativeCost -= cost; h.basis -= basis;
        a.withdrawals += hkd || 0; a.nativeGain[ccy] = (a.nativeGain[ccy] || 0) + nativeNet - cost;
        if (hkd !== null && h.basisKnown) a.settledGain += hkd - basis;
      } else { a.withdrawals += hkd || 0; a.nativeGain[ccy] = (a.nativeGain[ccy] || 0) + nativeNet; }
      a.feeDetails.push({currency: ccy, amount: fee, hkd: hkd !== null && nativeNet > 0 ? fee * hkd / nativeNet : null});
    }
    for (const h of holdings.values()) {
      if (h.units < EPS) { h.units = 0; continue; }
      const a = accounts[h.account];
      const q = h.legacy ? (positive(nav[h.symbol]) ? { price: Number(nav[h.symbol]), date: '原基金頁淨值' } : null) : d.quotes[h.key];
      const r = rate(h.currency);
      h.price = q && (h.legacy || q.date <= asOf) ? Number(q.price) : null;
      h.priceDate = q?.date; h.value = h.price ? h.price * h.units : null;
      h.valueHKD = h.value !== null && r ? h.value * r : null;
      h.unrealizedHKD = h.valueHKD !== null && h.basisKnown ? h.valueHKD - h.basis : null;
      if (h.valueHKD === null) mark(a, `${h.symbol} 待補現價或 ${h.currency} 估值匯率`);
      else a.assets += h.valueHKD;
    }
    for (const a of Object.values(accounts)) {
      a.feesComplete = true; a.feesNative = {};
      for (const f of a.feeDetails) {
        if (!f.amount) continue;
        a.feesNative[f.currency] = (a.feesNative[f.currency] || 0) + f.amount;
        const converted = f.hkd != null ? f.hkd : rate(f.currency) ? f.amount * rate(f.currency) : null;
        if (converted === null) a.feesComplete = false; else a.feesHKD += converted;
      }
      for (const [ccy, cash] of Object.entries(a.cash)) {
        if (cash.amount > EPS) { const r = rate(ccy); if (!r) mark(a, `${ACCOUNTS[a.id]} ${ccy} 現金待補估值匯率`); else a.assets += cash.amount * r; }
      }
      a.net = a.complete ? a.withdrawals + a.assets - a.deposits : null;
      a.open = [...holdings.values()].some(h => h.account === a.id && h.units > EPS && h.currency !== 'HKD') || a.cash.USD.amount > EPS;
      a.estimated = [...holdings.values()].some(h => h.account === a.id && h.units > EPS) || a.cash.USD.amount > EPS;
    }
    const all = Object.values(accounts), complete = all.every(a => a.complete);
    const sum = k => all.reduce((n, a) => n + a[k], 0);
    return { accounts, holdings: [...holdings.values()], rows, issues, missing: [...new Set(missing)], total: { complete, net: complete ? sum('withdrawals') + sum('assets') - sum('deposits') : null, deposits: sum('deposits'), withdrawals: sum('withdrawals'), assets: sum('assets'), feesHKD: sum('feesHKD'), feesComplete: all.every(a => a.feesComplete), feesNative: all.reduce((out,a) => {for (const [c,n] of Object.entries(a.feesNative)) out[c]=(out[c]||0)+n; return out;},{}), pendingHKD: sum('pendingHKD'), estimated: all.some(a => a.estimated) } };
  }
  return { blank, normalize, merge, atomicWrite, calculate, validateEvent, feeSuggestions, flexFee, trade25Active, feeKey, months, dateOK, ACCOUNTS };
});
