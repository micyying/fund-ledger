// Archived v2.0 UI regression. Current unified UI: unified-ui.test.cjs
const {chromium} = require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const E=require('../investment-engine.js');
const url=process.env.TEST_BASE_URL||'http://127.0.0.1:8768/versions/v2.0.0/';
const out=process.env.TEST_OUTPUT_DIR||'/private/tmp/fund-ledger-v2-qa';
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const legacy=[{id:'legacy-1',date:'2026-01-01',fundCode:'U50004',house:'HSBC',type:'buy',currency:'HKD',units:1000,amount:10000,fee:0}];
 await context.addInitScript(({legacy})=>{
  if(!localStorage.getItem('ivTestSeed')){
   localStorage.setItem('fundLedger_currentAccount',JSON.stringify('Demo'));
   localStorage.setItem('fundLedger_Demo_transactions',JSON.stringify(legacy));
   localStorage.setItem('fundLedger_Demo_currentNav',JSON.stringify({U50004:11}));
   localStorage.setItem('fundLedger_Demo_fundNames',JSON.stringify({U50004:'測試基金'}));
   localStorage.setItem('ivTestSeed','1');
  }
 },{legacy});
 await page.goto(url);await page.getByRole('heading',{name:'最後，港幣賺了多少？'}).waitFor();
 assert.match(await page.locator('.iv-net').innerText(),/1,000.00/);
 assert.deepEqual(JSON.parse(await page.evaluate(()=>localStorage.getItem('fundLedger_Demo_preV2Backup'))).transactions,legacy);
 await page.getByRole('button',{name:'Trade25',exact:true}).click();
 const open = async name=>{await page.getByRole('button',{name,exact:true}).click();return page.getByRole('dialog',{name:'投資紀錄'});};
 const set = async (d,name,value)=>d.getByLabel(name,{exact:true}).fill(value);
 let d=await open('記錄換匯');await set(d,'交易／換匯日期','2026-01-01');await set(d,'實付港幣總額（含換匯費）','7800');await set(d,'實收美元','1000');await d.getByRole('button',{name:'儲存紀錄'}).click();await d.waitFor({state:'hidden'});
 d=await open('＋ 買入美股／ETF');await set(d,'交易／換匯日期','2026-01-02');await set(d,'股票／ETF 代碼','AAPL');await set(d,'股數／單位','10');await set(d,'成交總額（未含費用）','997');await set(d,'交易費用總額','3');await d.getByRole('button',{name:'儲存紀錄'}).click();await d.waitFor({state:'hidden'});
 await page.getByLabel('USD 港幣匯率',{exact:true}).fill('7.75');await page.getByRole('button',{name:'儲存匯率'}).click();
 await page.getByLabel('AAPL 現價',{exact:true}).fill('100.8');await page.getByRole('button',{name:'更新',exact:true}).click();
 d=await open('賣出');await set(d,'交易／換匯日期','2026-01-03');await set(d,'股票／ETF 代碼','AAPL');await set(d,'股數／單位','11');await set(d,'成交總額（未含費用）','1008');await set(d,'交易費用總額','3');await d.getByRole('button',{name:'儲存紀錄'}).click();assert.match(await d.innerText(),/賣出股數超過/);await set(d,'股數／單位','10');await d.getByRole('button',{name:'儲存紀錄'}).click();await d.waitFor({state:'hidden'});
 assert.match(await page.locator('.iv-net').innerText(),/-11.25/);
 d=await open('記錄換匯');await set(d,'交易／換匯日期','2026-01-04');await d.getByLabel('換匯方向',{exact:true}).selectOption('toHKD');await set(d,'實收港幣淨額（已扣換匯費）','7788.75');await set(d,'實付美元','1005');await d.getByRole('button',{name:'儲存紀錄'}).click();await d.waitFor({state:'hidden'});
 assert.match(await page.locator('.iv-net').innerText(),/-11.25/);assert.doesNotMatch(await page.locator('.iv-net').innerText(),/含估值/);
 await page.getByText('月費補記與核對',{exact:true}).click();await page.getByLabel('開始月份',{exact:true}).fill('2026-01');await page.getByLabel('結束月份',{exact:true}).fill('2026-02');
 await page.getByLabel('2026-01 FlexInvest 平均市值').fill('12000');await page.getByLabel('2026-01 FlexInvest 平均市值').blur();await page.getByLabel('2026-02 FlexInvest 平均市值').fill('9000');await page.getByLabel('2026-02 FlexInvest 平均市值').blur();
 assert.match(await page.locator('.iv-fees').innerText(),/免月費/);
 await page.getByRole('button',{name:'加入可判斷的待核實月費'}).click();
 let state=JSON.parse(await page.evaluate(()=>localStorage.getItem('fundLedger_Demo_investmentLedgerV2')));assert.equal(state.events.filter(e=>e.type==='fee').length,2);assert.equal(state.events.filter(e=>e.type==='fee'&&e.month==='2026-02').length,0);
 assert.match(await page.locator('.iv-net').innerText(),/-11.25/);
 await page.getByRole('button',{name:'加入可判斷的待核實月費'}).click();state=JSON.parse(await page.evaluate(()=>localStorage.getItem('fundLedger_Demo_investmentLedgerV2')));assert.equal(state.events.filter(e=>e.type==='fee').length,2);
 const tradeFee=state.events.find(e=>e.account==='trade25'&&e.type==='fee');await page.getByRole('button',{name:`編輯 ${tradeFee.id}`,exact:true}).click();d=page.getByRole('dialog',{name:'投資紀錄'});await d.getByLabel('扣款狀態').selectOption('confirmed');await set(d,'實際扣款日期','2026-02-10');await d.getByRole('button',{name:'儲存紀錄'}).click();await d.waitFor({state:'hidden'});assert.match(await page.locator('.iv-net').innerText(),/-36.25/);
 const downloadP=page.waitForEvent('download');await page.getByRole('button',{name:'完整備份',exact:true}).click();const download=await downloadP;const backupPath=out+'/roundtrip.json';await download.saveAs(backupPath);const backup=JSON.parse(fs.readFileSync(backupPath));assert.equal(backup.version,7);assert.equal(backup.investmentLedger.events.length,6);assert.deepEqual(backup.transactions,legacy);
 // Close the export sheet before reload.
 await page.reload();await page.getByRole('heading',{name:'最後，港幣賺了多少？'}).waitFor();await page.getByRole('button',{name:'Trade25',exact:true}).click();assert.match(await page.locator('.iv-net').innerText(),/-36.25/);
 assert.deepEqual(JSON.parse(await page.evaluate(()=>localStorage.getItem('fundLedger_Demo_transactions'))),legacy);
 // Round-trip through the actual file input, merge must not duplicate events or monthly fees.
 await page.locator('input[type=file][accept="application/json,.json"]').setInputFiles(backupPath);await page.getByRole('button',{name:'合併（保留目前資料，加入備份中沒有的紀錄）',exact:true}).click();
 state=JSON.parse(await page.evaluate(()=>localStorage.getItem('fundLedger_Demo_investmentLedgerV2')));assert.equal(state.events.length,6);
 // Importing an old backup in replacement mode preserves all v2 events.
 const old=out+'/legacy.json';fs.writeFileSync(old,JSON.stringify({version:6,transactions:legacy,navMap:{U50004:11}}));await page.locator('input[type=file][accept="application/json,.json"]').setInputFiles(old);await page.getByRole('button',{name:'取代（清空目前資料，改用備份內容）',exact:true}).click();
 assert.equal(JSON.parse(await page.evaluate(()=>localStorage.getItem('fundLedger_Demo_investmentLedgerV2'))).events.length,6);
 await page.screenshot({path:out+'/desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:out+'/mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'mobile body overflow');
 d=await open('＋ 買入美股／ETF');await page.screenshot({path:out+'/mobile-form.png',fullPage:true});await d.getByRole('button',{name:'關閉投資紀錄'}).click();
 await page.getByRole('button',{name:'基金紀錄',exact:true}).click();await page.getByRole('button',{name:'手動新增',exact:true}).waitFor();assert.match(await page.locator('body').innerText(),/測試基金|U50004/);
 assert.deepEqual(errors,[]);
 // Separate fresh browser: import the complete backup into an empty v2 account.
 const ctx2=await browser.newContext();const p2=await ctx2.newPage();await ctx2.addInitScript(()=>localStorage.setItem('fundLedger_currentAccount',JSON.stringify('Demo')));await p2.goto(url);await p2.getByRole('heading',{name:'最後，港幣賺了多少？'}).waitFor();await p2.locator('input[type=file][accept="application/json,.json"]').setInputFiles(backupPath);await p2.getByRole('button',{name:'取代（清空目前資料，改用備份內容）',exact:true}).click();await p2.getByRole('button',{name:'Trade25',exact:true}).click();assert.match(await p2.locator('.iv-net').innerText(),/-36.25/);await ctx2.close();
 console.log('UI passed: actual forms, oversell, FX roundtrip, fee thresholds, no duplicates, confirmation, save/reload, JSON merge/replace, legacy preservation, mobile layout, legacy tab; no page errors.');await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
