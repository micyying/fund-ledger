const {chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{
 const b=await chromium.launch({channel:'chrome',headless:true});
 try{
 const c=await b.newContext({viewport:{width:390,height:844}}),p=await c.newPage(),errs=[];
 p.on('pageerror',e=>errs.push(e.message));await p.goto(process.env.TEST_BASE_URL||'http://127.0.0.1:8768/');
 await p.getByPlaceholder('設定新密碼（至少 12 字元）').fill('SyntheticTestOnly2026');await p.getByPlaceholder('再輸入一次新密碼').fill('SyntheticTestOnly2026');await p.getByRole('button',{name:'設定密碼並開啟'}).click();await p.getByRole('button',{name:'手動新增',exact:true}).waitFor();
 await p.getByText('換匯、月費與港幣對照',{exact:true}).click();assert.match(await p.locator('.iv-net').innerText(),/HK\$0.00/);
 await p.getByText('估值匯率與現金餘額',{exact:true}).click();await p.getByRole('button',{name:'補記入金',exact:true}).click();let d=p.getByRole('dialog',{name:'投資紀錄'});await d.getByLabel('成交／扣費幣別',{exact:true}).selectOption('HKD');await d.getByLabel('實際入金／提取金額',{exact:true}).fill('100');await d.getByRole('button',{name:'儲存紀錄'}).click();await d.waitFor({state:'hidden'});const before=await p.evaluate(()=>localStorage.getItem('fundLedger_Micy_investmentLedgerV2'));
 await p.getByRole('button',{name:'切換帳號',exact:true}).click();await p.getByRole('button',{name:/Demo/}).click();await p.getByRole('button',{name:'手動新增',exact:true}).waitFor();assert.equal(await p.evaluate(()=>localStorage.getItem('fundLedger_Demo_investmentLedgerV2')),null);assert.equal(await p.evaluate(()=>localStorage.getItem('fundLedger_Micy_investmentLedgerV2')),before);
 await p.getByRole('button',{name:'記錄換匯',exact:true}).click();d=p.getByRole('dialog',{name:'投資紀錄'});assert.equal(await p.evaluate(()=>!!document.elementFromPoint(40,window.innerHeight-20).closest('.iv-backdrop')),true,'modal must cover nav');await d.getByRole('button',{name:'關閉投資紀錄'}).click();
 await p.evaluate(()=>localStorage.setItem('fundLedger_Demo_investmentLedgerV2','{"schemaVersion":99,"events":[]}'));await p.reload();await p.getByRole('button',{name:'手動新增',exact:true}).waitFor();assert.match(await p.locator('.iv-error').innerText(),/不支援/);await p.getByRole('button',{name:'補記費用',exact:true}).click();d=p.getByRole('dialog',{name:'投資紀錄'});await d.getByRole('button',{name:'儲存紀錄'}).click();assert.match(await d.innerText(),/不支援|停止新紀錄/);assert.equal(await p.evaluate(()=>localStorage.getItem('fundLedger_Demo_investmentLedgerV2')),'{"schemaVersion":99,"events":[]}');assert.deepEqual(errs,[]);
 console.log('Unified account isolation, modal layering and unknown-schema write protection passed.');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1);});
