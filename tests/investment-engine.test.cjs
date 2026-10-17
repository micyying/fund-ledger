const assert = require('node:assert/strict');
const E = require('../investment-engine.js');
let checks=0;
const near=(actual,expected,label)=>{assert.ok(Math.abs(actual-expected)<1e-6,`${label}: ${actual} != ${expected}`);checks++;};
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const event=(id,type,x={})=>({id,type,account:'trade25',date:'2026-01-01',currency:'USD',settlement:'wallet',amount:1,fee:0,seq:Number(id.replace(/\D/g,''))||0,...x});
const calc=(events,x={},legacy=[],nav={})=>E.calculate({...E.blank(),events,...x},legacy,nav,'2026-10-17');
const fx={USD:{rate:7.75,date:'2026-10-17'}};
// Complete round trip: actual bank amounts and trade fees are counted only once.
let events=[event('1','exchange',{hkd:7800,usd:1000,direction:'toUSD',settlement:'external'}),event('2','buy',{symbol:'TEST',units:10,amount:997,fee:3}),event('3','sell',{symbol:'TEST',units:10,amount:1008,fee:3}),event('4','exchange',{hkd:7788.75,usd:1005,direction:'toHKD',settlement:'external'})];
let r=calc(events);near(r.total.net,-11.25,'real cash roundtrip');near(r.accounts.trade25.cash.USD.amount,0,'no residual USD');near(r.rows.find(x=>x.id==='3').nativeGain,5,'native profit');eq(r.total.estimated,false);
// Sold but not converted is an estimate and requires explicit valuation rate.
r=calc(events.slice(0,3));eq(r.total.net,null);r=calc(events.slice(0,3),{fx});near(r.total.net,-11.25,'unconverted marked estimate');eq(r.total.estimated,true);
// Fee confirmation, repeat prevention, month belongs to platform, and external payment.
const monthly=event('5','fee',{currency:'HKD',amount:25,settlement:'external',category:'platform',month:'2026-01',status:'pending'});
r=calc([...events,monthly]);near(r.total.net,-11.25,'pending ignored');near(r.total.pendingHKD,25,'pending shown');
r=calc([...events,{...monthly,status:'confirmed'}]);near(r.total.net,-36.25,'external fee counted once');
assert.throws(()=>E.normalize({...E.blank(),events:[monthly,{...monthly,id:'6'}]}),/同一平台/);checks++;
// Partial sales use average cost, and pooled proceeds do not count as new contributions.
events=[event('1','exchange',{hkd:15600,usd:2000,direction:'toUSD',settlement:'external'}),event('2','buy',{symbol:'TEST',units:10,amount:1000}),event('3','buy',{symbol:'TEST',units:10,amount:500}),event('4','sell',{symbol:'TEST',units:5,amount:500}),event('5','buy',{symbol:'OTHER',units:1,amount:500})];
r=calc(events,{fx,quotes:{'trade25:TEST:USD':{price:100,date:'2026-10-17'},'trade25:OTHER:USD':{price:500,date:'2026-10-17'}}});near(r.total.deposits,15600,'no reinvestment contribution');near(r.holdings[0].units,15,'partial units');near(r.holdings[0].basis,8775,'average HKD cost');near(r.total.net,3775,'portfolio conservation');near(r.accounts.trade25.cash.USD.amount,500,'cash retained');
// Cash funding + internal exchange counts a deposit only once.
events=[event('1','deposit',{currency:'HKD',amount:8000,settlement:'external'}),event('2','exchange',{hkd:7800,usd:1000,direction:'toUSD'}),event('3','exchange',{hkd:7750,usd:1000,direction:'toHKD'}),event('4','withdraw',{currency:'HKD',amount:7950,settlement:'external'})];r=calc(events);near(r.total.net,-50,'internal conversion conservation');near(r.total.deposits,8000,'deposit once');near(r.total.assets,0,'withdraw all');
// Direct HKD trade includes specified fees; stock gain can coexist with HKD loss.
events=[event('1','buy',{symbol:'T',units:10,amount:1000,fee:3,settlement:'external',hkd:7823.4}),event('2','sell',{symbol:'T',units:10,amount:1010,fee:3,settlement:'external',hkd:7804.25})];r=calc(events);near(r.total.net,-19.15,'direct bank deductions');near(r.rows[1].nativeGain,4,'direct native gain');
// Dividend withholding is net cash, never an external contribution.
events=[event('1','dividend',{amount:100,fee:30})];r=calc(events,{fx});near(r.accounts.trade25.cash.USD.amount,70,'dividend after tax');near(r.total.net,542.5,'dividend value');near(r.total.deposits,0,'dividend is income');
// Reject overdrafts and oversells, including backdated changes.
r=calc([event('1','buy',{symbol:'T',units:1,amount:100})]);eq(r.issues.length,1);eq(r.total.net,null);
r=calc([event('1','sell',{symbol:'T',units:1,amount:100})]);eq(r.issues.length,1);
// Legacy HKD funds and monthly charges join the same portfolio without modifying source.
const legacy=[{id:'L1',type:'buy',fundCode:'F',date:'2025-01-01',currency:'HKD',units:10,amount:1000,fee:0},{id:'L2',type:'sell',fundCode:'F',date:'2025-02-01',currency:'HKD',units:5,amount:600,fee:0}];const before=JSON.stringify(legacy);
r=calc([event('1','fee',{account:'flexinvest',currency:'HKD',amount:28,settlement:'external',status:'confirmed',category:'platform',month:'2025-01'})],{},legacy,{F:120});near(r.accounts.flexinvest.net,172,'legacy net and monthly fee');eq(JSON.stringify(legacy),before);near(r.holdings[0].basis,500,'legacy partial basis');
const usdLegacy=[{...legacy[0],currency:'USD'}];r=calc([],{fx},usdLegacy,{F:120});eq(r.total.net,null);r=calc([],{fx,legacyHKD:{L1:7800}},usdLegacy,{F:120});near(r.total.net,1500,'legacy actual conversion');r=calc([],{},legacy,{});eq(r.total.net,null);
// Monthly average threshold can switch off, and on again; never infer from invested capital.
eq(E.flexFee(9999).amount,0);eq(E.flexFee(10000).amount,28);eq(E.flexFee(200000).amount,28);eq(E.flexFee(200001).amount,null);eq(E.flexFee(undefined).amount,null);
eq(E.feeSuggestions({...E.blank(),flexMonthly:{'2026-01':11000,'2026-02':9000,'2026-03':10100}},'2026-01','2026-03').filter(x=>x.account==='flexinvest').map(x=>x.amount),[28,0,28]);
events=[event('1','buy',{symbol:'T',units:10,amount:1000,date:'2026-01-20',settlement:'external',hkd:7800}),event('2','sell',{symbol:'T',units:10,amount:1000,date:'2026-03-01'})];eq(E.trade25Active(events,'2026-01'),true);eq(E.trade25Active(events,'2026-02'),true);eq(E.trade25Active(events,'2026-03'),true);eq(E.trade25Active(events,'2026-04'),false);
// Backup roundtrip + merge deduplicates monthly charges; future schemas are rejected.
const d={...E.blank(),events:[monthly],fx,legacyHKD:{L1:7800},flexMonthly:{'2026-01':9000}};eq(E.normalize(JSON.parse(JSON.stringify(d))),E.normalize(d));eq(E.merge(d,{...d,events:[{...monthly,id:'other'}]}).events.length,1);assert.throws(()=>E.normalize({...d,schemaVersion:3}));checks++;
assert.throws(()=>E.months('2026-12','2026-01'));checks++;assert.throws(()=>E.validateEvent(event('1','exchange',{hkd:0,usd:100,direction:'toUSD'})));checks++;
console.log(`${checks} investment accounting checks passed`);
// Computed UI fields must never become persisted truth after editing a trade.
const clean=E.normalize({...E.blank(),events:[{...event('1','buy',{symbol:'T',units:1,amount:100,settlement:'external',hkd:780}),settledGain:999,nativeGain:999}]});assert.equal(clean.events[0].settledGain,undefined);assert.equal(clean.events[0].nativeGain,undefined);
assert.throws(()=>E.validateEvent(event('1','deposit',{currency:'USD',settlement:'wallet',amount:100})),/帳本外/);
// Atomic import rolls back every old string on mid-write quota failure.
const map=new Map([['a','old-a'],['b','old-b']]);let failOnce=true;
const storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>{if(k==='b'&&v==='new-b'&&failOnce){failOnce=false;throw Error('quota');}map.set(k,v);},removeItem:k=>map.delete(k)};
assert.throws(()=>E.atomicWrite(storage,{a:'new-a',b:'new-b',c:'new-c'}),/保留/);assert.deepEqual([...map],[['a','old-a'],['b','old-b']]);
E.atomicWrite(storage,{a:'new-a',b:'new-b'});assert.equal(map.get('b'),'new-b');
console.log('6 persistence and input-integrity checks passed');
