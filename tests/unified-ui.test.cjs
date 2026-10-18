const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const E = require('../investment-engine.js');
const url = process.env.TEST_BASE_URL || 'http://127.0.0.1:8768/';
const out = process.env.TEST_OUTPUT_DIR || '/private/tmp/fund-ledger-unified-qa';
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const legacy = [
      { id: 'L-flex', date: '2026-01-01', fundCode: 'FLEX1', house: '滙豐', type: 'buy', currency: 'HKD', units: 10, amount: 1000, fee: 0, nav: 100, note: 'legacy-flex-marker' },
      { id: 'L-hang', date: '2026-01-01', fundCode: 'HANG1', house: '恆生', platformId: 'hangseng', type: 'buy', currency: 'HKD', units: 10, amount: 500, fee: 0, nav: 50, note: 'legacy-hang-marker' },
    ];
    const data = {
      ...E.blank(),
      events: [
        { id: 'E-aapl', type: 'buy', account: 'trade25', date: '2026-01-02', currency: 'USD', settlement: 'external', symbol: 'AAPL', name: '蘋果測試', units: 10, price: 100, amount: 1000, fee: 1, feeParts: [{ label: '佣金', amount: 1 }], hkd: 7807.8, seq: 12, note: 'v2-aapl-marker' },
        { id: 'E-fee', type: 'fee', account: 'flexinvest', date: '2026-02-01', currency: 'HKD', settlement: 'external', amount: 28, fee: 0, category: 'platform', month: '2026-01', status: 'confirmed', seq: 13, note: 'preserved-monthly-fee' },
      ],
      quotes: { 'trade25:AAPL:USD': { price: 110, date: '2026-02-01' } },
      fx: { USD: { rate: 7.8, date: '2026-02-01' } },
    };
    await context.addInitScript(({ legacy, data }) => {
      if (localStorage.getItem('unifiedTestSeed')) return;
      localStorage.setItem('fundLedger_currentAccount', JSON.stringify('Demo'));
      localStorage.setItem('fundLedger_activeTab_v2', JSON.stringify('overview'));
      localStorage.setItem('fundLedger_Demo_transactions', JSON.stringify(legacy));
      localStorage.setItem('fundLedger_Demo_currentNav', JSON.stringify({ FLEX1: 105, HANG1: 55 }));
      localStorage.setItem('fundLedger_Demo_fundNames', JSON.stringify({ FLEX1: '原基金測試', HANG1: '恆生測試' }));
      localStorage.setItem('fundLedger_Demo_investmentLedgerV2', JSON.stringify(data));
      localStorage.setItem('unifiedTestSeed', '1');
    }, { legacy, data });
    const state = (subject = page) => subject.evaluate(() => ({
      transactions: JSON.parse(localStorage.getItem('fundLedger_Demo_transactions') || '[]'),
      data: JSON.parse(localStorage.getItem('fundLedger_Demo_investmentLedgerV2') || '{}'),
    }));
    const txRow = marker => page.locator('.fl-row').filter({ hasText: marker });
    const tradeForm = () => page.getByRole('dialog', { name: '基金交易', exact: true });
    const save = async form => {
      await form.getByRole('button', { name: /^(新增交易|儲存變更)$/ }).click();
      await form.waitFor({ state: 'hidden' });
    };
    const note = form => form.getByLabel(/^備註/);
    const assertNoOverflow = async label => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, label);

    await page.goto(url);
    await page.getByRole('button', { name: '手動新增', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '港幣回報', exact: true }).count(), 0, 'the split navigation is removed');
    await txRow('legacy-flex-marker').waitFor();
    await txRow('legacy-hang-marker').waitFor();
    await txRow('v2-aapl-marker').waitFor();
    assert.equal(await txRow('v2-aapl-marker').count(), 1, 'v2 trade appears once in original ledger');
    assert.match(await page.locator('body').innerText(), /匯豐 Trade25/);
    assert.match(await page.locator('body').innerText(), /匯豐 FlexInvest/);
    assert.match(await page.locator('body').innerText(), /恆生/);
    assert.deepEqual((await state()).transactions, legacy, 'view construction never migrates original records');

    // Edit the original source without changing ID, issuer, platform or foreign metadata.
    await txRow('legacy-flex-marker').getByRole('button', { name: /編輯/ }).click();
    let form = tradeForm(); await form.waitFor();
    await note(form).fill('legacy-edited-marker'); await save(form);
    let saved = await state();
    assert.equal(saved.transactions.length, 2);
    assert.equal(saved.transactions.find(t => t.id === 'L-flex').note, 'legacy-edited-marker');
    assert.equal(saved.data.events.length, 2);

    // Editing a projected v2 row must dispatch back to its existing event.
    await txRow('v2-aapl-marker').getByRole('button', { name: /編輯/ }).click();
    form = tradeForm(); await form.waitFor();
    await note(form).fill('v2-edited-marker'); await save(form);
    saved = await state();
    assert.equal(saved.transactions.length, 2, 'v2 edit must not append a legacy copy');
    assert.equal(saved.data.events.length, 2);
    const edited = saved.data.events.find(e => e.id === 'E-aapl');
    assert.equal(edited.note, 'v2-edited-marker');
    assert.equal(edited.hkd, 7807.8);
    assert.equal(edited.settlement, 'external');
    assert.deepEqual(edited.feeParts, [{ label: '佣金', amount: 1 }]);
    assert.equal(edited.seq, 12);

    // New USD records use the familiar form, with actual historical HKD amounts.
    await page.getByRole('button', { name: '手動新增', exact: true }).click();
    form = tradeForm(); await form.waitFor();
    await form.getByLabel(/^平台$/).selectOption('trade25');
    await form.getByLabel(/^(基金|股票).*代碼/).fill('MSFT');
    await form.getByLabel(/^交易日期$/).fill('2026-03-01');
    await form.getByLabel(/^幣別$/).fill('USD');
    await form.getByLabel('單位／股數', { exact: true }).fill('2');
    await form.getByLabel('交易總額（未含費用）', { exact: true }).fill('200');
    await form.getByLabel(/^實付港幣/).fill('1560');
    await note(form).fill('new-usd-buy-marker'); await save(form);
    await txRow('new-usd-buy-marker').waitFor();
    await page.getByRole('button', { name: '手動新增', exact: true }).click();
    form = tradeForm(); await form.waitFor();
    await form.getByLabel(/^平台$/).selectOption('trade25');
    await form.getByLabel(/^(基金|股票).*代碼/).fill('MSFT');
    await form.getByLabel('交易類型', { exact: true }).selectOption('sell');
    await form.getByLabel(/^交易日期$/).fill('2026-03-02');
    await form.getByLabel(/^幣別$/).fill('USD');
    await form.getByLabel('單位／股數', { exact: true }).fill('1');
    await form.getByLabel('交易總額（未含費用）', { exact: true }).fill('120');
    await form.getByLabel(/^實收港幣/).fill('930');
    await note(form).fill('new-usd-sell-marker'); await save(form);
    saved = await state();
    const allTrades = [...saved.transactions, ...saved.data.events];
    const newBuy = allTrades.find(t => t.note === 'new-usd-buy-marker');
    const newSell = allTrades.find(t => t.note === 'new-usd-sell-marker');
    assert.equal(newBuy.hkdAmount ?? newBuy.hkd, 1560);
    assert.equal(newSell.hkdAmount ?? newSell.hkd, 930);
    assert.equal(E.platformForTransaction(newBuy), 'trade25');
    const account = E.calculate(saved.data, saved.transactions, { FLEX1: 105, HANG1: 55 }, '2026-10-18');
    assert.deepEqual(account.issues, []);
    assert.equal(account.rows.find(r => r.id === newSell.id)?.settledGain, 150, 'partial sale compares HKD receipts to matching historical cost');

    // JSON backup contains source arrays exactly once, never flattened view copies.
    await page.getByRole('button', { name: /^下載$/ }).click();
    const downloadP = page.waitForEvent('download');
    await page.getByRole('button', { name: '下載備份文件', exact: true }).click();
    const download = await downloadP, backupPath = out + '/unified-backup.json';
    await download.saveAs(backupPath);
    const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    assert.deepEqual(backup.transactions, saved.transactions);
    assert.deepEqual(backup.investmentLedger, saved.data);
    assert.equal(backup.transactions.filter(t => t.investmentEventId).length, 0);
    assert.equal(backup.investmentLedger.events.filter(e => e.id === 'E-aapl').length, 1);
    assert.equal(backup.investmentLedger.events.find(e => e.id === 'E-fee').amount, 28);

    await page.reload();
    await txRow('legacy-edited-marker').waitFor(); await txRow('v2-edited-marker').waitFor();
    await txRow('new-usd-buy-marker').waitFor(); await txRow('new-usd-sell-marker').waitFor();
    assert.deepEqual(await state(), saved, 'source records survive reload exactly');
    await page.locator('input[type=file][accept="application/json,.json"]').setInputFiles(backupPath);
    await page.getByRole('button', { name: '合併（保留目前資料，加入備份中沒有的紀錄）', exact: true }).click();
    assert.deepEqual(await state(), saved, 'JSON merge never writes projected v2 trades into the original source');
    assert.equal((await state()).transactions.some(t => t.source || t.investmentEventId), false);
    await page.getByRole('button', { name: /^下載$/ }).click();
    const csvDownloadP=page.waitForEvent('download');
    await page.getByRole('button',{name:'下載 CSV',exact:true}).click();
    const csvDownload=await csvDownloadP, csvPath=out+'/unified.csv';await csvDownload.saveAs(csvPath);
    assert.match(fs.readFileSync(csvPath,'utf8'),/平台代號/);
    await page.reload();await page.getByRole('button',{name:'手動新增',exact:true}).waitFor();
    await page.locator('input[type=file][accept=".csv,text/csv"]').setInputFiles(csvPath);
    await page.getByRole('button',{name:'合併（保留目前資料，加入備份中沒有的紀錄）',exact:true}).click();
    assert.deepEqual(await state(),saved,'CSV source IDs prevent duplicating v2 or original trades');
    await assertNoOverflow('desktop body overflow');
    await page.screenshot({ path: out + '/desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await assertNoOverflow('mobile body overflow');
    await page.screenshot({ path: out + '/mobile.png', fullPage: true });
    await page.getByRole('button', { name: '手動新增', exact: true }).click();
    form = tradeForm(); await form.waitFor();
    await assertNoOverflow('mobile form body overflow');
    await page.screenshot({ path: out + '/mobile-form.png', fullPage: true });
    await form.getByRole('button', { name: '取消', exact: true }).click();

    // Fresh-browser replacement restores both stores without depending on projection history.
    const restoredContext = await browser.newContext();
    await restoredContext.addInitScript(() => localStorage.setItem('fundLedger_currentAccount', JSON.stringify('Demo')));
    const restored = await restoredContext.newPage();
    restored.on('pageerror', error => errors.push(error.message));
    await restored.goto(url); await restored.getByRole('button', { name: '手動新增', exact: true }).waitFor();
    await restored.locator('input[type=file][accept="application/json,.json"]').setInputFiles(backupPath);
    await restored.getByRole('button', { name: '取代（清空目前資料，改用備份內容）', exact: true }).click();
    assert.deepEqual(await state(restored), saved, 'fresh JSON restore preserves both original stores');
    assert.equal(await restored.locator('.fl-row').filter({ hasText: 'v2-edited-marker' }).count(), 1);
    await restoredContext.close();

    // A same-day v2 buy must precede an original-store sale by explicit sequence.
    const cashContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const crossLegacy = [{ id: 'L-order-sell', type: 'sell', platformId: 'trade25', fundCode: 'ORDER', date: '2026-04-01', currency: 'USD', units: 1, amount: 120, fee: 1, settlement: 'external', hkdAmount: 928.2, seq: 2, note: 'same-day-sell-marker' }];
    const crossData = { ...E.blank(), events: [
      { id: 'E-order-buy', type: 'buy', account: 'trade25', symbol: 'ORDER', date: '2026-04-01', currency: 'USD', units: 1, amount: 100, fee: 1, settlement: 'external', hkd: 787.8, seq: 1 },
      { id: 'E-wallet-buy', type: 'buy', account: 'trade25', symbol: 'WALLET', date: '2026-04-02', currency: 'USD', units: 10, amount: 1000, fee: 0, settlement: 'external', hkd: 7800, seq: 3 },
    ], fx: { USD: { rate: 7.8, date: '2026-04-02' } }, quotes: { 'trade25:WALLET:USD': { price: 100, date: '2026-04-02' } } };
    await cashContext.addInitScript(({ crossLegacy, crossData }) => {
      if (localStorage.getItem('crossTestSeed')) return;
      localStorage.setItem('fundLedger_currentAccount', JSON.stringify('Demo'));
      localStorage.setItem('fundLedger_Demo_transactions', JSON.stringify(crossLegacy));
      localStorage.setItem('fundLedger_Demo_investmentLedgerV2', JSON.stringify(crossData));
      localStorage.setItem('crossTestSeed', '1');
    }, { crossLegacy, crossData });
    const cashPage = await cashContext.newPage();
    cashPage.on('pageerror', error => errors.push(error.message));
    await cashPage.goto(url);
    const sameDayRow = cashPage.locator('.fl-row').filter({ hasText: 'same-day-sell-marker' });
    await sameDayRow.waitFor(); assert.match(await sameDayRow.innerText(), /\+USD18(?:\.|\s|$)/);
    await cashPage.getByRole('button',{name:'已實現損益明細 USD',exact:true}).click();
    const realizedModal = cashPage.getByRole('heading', { name: '已實現損益明細', exact: true }).locator('..').locator('..');
    assert.match(await realizedModal.innerText(), /\+USD18(?:\.|\s|$)/, 'date-only realized modal respects source sequence');
    await realizedModal.getByRole('button', { name: '關閉', exact: true }).click();

    // The main form can sell into USD cash, then the integrated control exchanges it in parts.
    await cashPage.getByRole('button', { name: '手動新增', exact: true }).click();
    const cashForm = cashPage.getByRole('dialog', { name: '基金交易', exact: true });
    await cashForm.getByLabel('平台', { exact: true }).selectOption('trade25');
    await cashForm.getByLabel('基金／股票代碼', { exact: true }).fill('WALLET');
    await cashForm.getByLabel('交易類型', { exact: true }).selectOption('sell');
    await cashForm.getByLabel('交易日期', { exact: true }).fill('2026-04-03');
    await cashForm.getByLabel('單位／股數', { exact: true }).fill('2');
    await cashForm.getByLabel('交易總額（未含費用）', { exact: true }).fill('210');
    await cashForm.getByLabel('交易費用／預扣稅總額（原幣）', { exact: true }).fill('5');
    await cashForm.getByLabel('結算方式', { exact: true }).selectOption('wallet');
    await cashForm.getByLabel('備註', { exact: true }).fill('wallet-sale-marker');
    await cashForm.getByRole('button', { name: '新增交易', exact: true }).click();
    await cashForm.waitFor({ state: 'hidden' });
    let cashState = await state(cashPage), accounting = E.calculate(cashState.data, cashState.transactions, {}, '2026-10-18');
    assert.deepEqual(accounting.issues, []);
    assert.equal(accounting.accounts.trade25.cash.USD.amount, 205);
    assert.equal(accounting.accounts.trade25.cash.USD.basis, 1560);
    async function exchange(usd, hkd, date) {
      await cashPage.getByRole('button', { name: '記錄換匯', exact: true }).click();
      const fxForm = cashPage.getByRole('dialog', { name: '投資紀錄', exact: true });
      await fxForm.getByLabel('交易／換匯日期', { exact: true }).fill(date);
      await fxForm.getByLabel('換匯方向', { exact: true }).selectOption('toHKD');
      await fxForm.getByLabel('實付美元', { exact: true }).fill(String(usd));
      await fxForm.getByLabel('實收港幣淨額（已扣換匯費）', { exact: true }).fill(String(hkd));
      await fxForm.getByRole('button', { name: '儲存紀錄', exact: true }).click();
      await fxForm.waitFor({ state: 'hidden' });
    }
    await exchange(100, 775, '2026-04-04');
    cashState = await state(cashPage); accounting = E.calculate(cashState.data, cashState.transactions, {}, '2026-10-18');
    assert.equal(accounting.accounts.trade25.cash.USD.amount, 105);
    assert.ok(Math.abs(accounting.accounts.trade25.cash.USD.basis - 1560 * 105 / 205) < 1e-8);
    await exchange(105, 813.75, '2026-04-05');
    cashState = await state(cashPage); accounting = E.calculate(cashState.data, cashState.transactions, {}, '2026-10-18');
    assert.deepEqual(accounting.issues, []);
    assert.equal(accounting.accounts.trade25.cash.USD.amount, 0);
    assert.equal(accounting.accounts.trade25.cash.USD.basis, 0);
    assert.ok(Math.abs(accounting.total.net - 169.15) < 1e-8);
    await cashPage.getByText('換匯、月費與港幣對照', { exact: true }).click();
    assert.match(await cashPage.locator('.iv-net').innerText(), /169.15/);
    await cashPage.reload(); await cashPage.getByRole('button', { name: '手動新增', exact: true }).waitFor();
    assert.deepEqual(await state(cashPage), cashState);
    await cashContext.close();
    assert.deepEqual(errors, [], 'no browser runtime errors');
    console.log('Unified UI passed: platforms, both sources, source edits, actual HKD buy/sell, partial-cost accounting, raw backup merge/fresh restore, same-day cross-store ordering, USD wallet sale + partial FX roundtrip, reload, mobile layout, no runtime errors.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
