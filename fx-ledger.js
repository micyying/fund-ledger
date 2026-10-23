/* Standalone personal FX journal. Never reads or rewrites fund/investment stores. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FXLedger=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const CURRENCIES={CNY:'人民幣',USD:'美元',JPY:'日圓'};
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const blank=()=>({schemaVersion:1,records:[]});
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!isNaN(Date.parse(d))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
const positive=n=>n!==''&&n!=null&&Number.isFinite(Number(n))&&Number(n)>0;
function normalize(raw){
 if(!raw||raw.schemaVersion!==1||!Array.isArray(raw.records))throw Error('不支援的匯率備份版本；原資料未更動');
 const ids=new Set();return {schemaVersion:1,records:raw.records.map(r=>{
  if(!r||typeof r.id!=='string'||!r.id||ids.has(r.id))throw Error('換匯紀錄識別碼缺失或重複');ids.add(r.id);
  if(!Object.hasOwn(CURRENCIES,r.currency)||!['buy','sell'].includes(r.direction)||!['actual','memory'].includes(r.kind))throw Error('換匯幣別或紀錄類型不正確');
  if((r.kind==='actual'||r.date)&&(!validDate(r.date)||r.date>today()))throw Error('實際換匯日期須正確，且不可晚於今天');
  if(!positive(r.foreign)||!positive(r.hkd))throw Error('外幣及港幣金額須大於零');
  const feeHKD=Number(r.feeHKD||0);if(!Number.isFinite(feeHKD)||feeHKD<0||(r.direction==='buy'&&feeHKD>=Number(r.hkd)))throw Error('請核對已包含的港幣費用');
  return {id:r.id,currency:r.currency,direction:r.direction,kind:r.kind,date:r.date||'',foreign:Number(r.foreign),hkd:Number(r.hkd),feeHKD,place:String(r.place||''),note:String(r.note||'')};
 })};
}
function load(storage,key){const raw=storage.getItem(key);return raw===null?blank():normalize(JSON.parse(raw));}
function save(storage,key,data){const clean=normalize(data);storage.setItem(key,JSON.stringify(clean));return clean;}
function merge(a,b){const x=normalize(a),y=normalize(b),ids=new Set(x.records.map(r=>r.id));return normalize({...x,records:[...x.records,...y.records.filter(r=>!ids.has(r.id))]});}
function stats(data,currency){const rows=data.records.filter(r=>r.currency===currency&&r.direction==='buy'&&r.kind==='actual').sort((a,b)=>a.date.localeCompare(b.date));const totalForeign=rows.reduce((n,r)=>n+r.foreign,0),totalHKD=rows.reduce((n,r)=>n+r.hkd,0);return {rows,count:rows.length,totalForeign,totalHKD,average:totalForeign?totalHKD/totalForeign:null,low:rows.length?Math.min(...rows.map(r=>r.hkd/r.foreign)):null,high:rows.length?Math.max(...rows.map(r=>r.hkd/r.foreign)):null,last:rows.at(-1)||null};}
function compare(foreign,hkd,baseline){if(!positive(foreign)||!positive(hkd)||!positive(baseline))return null;const rate=Number(hkd)/Number(foreign),baseCost=Number(foreign)*Number(baseline),difference=Number(hkd)-baseCost;return {rate,baseCost,difference,percent:(rate/Number(baseline)-1)*100,verdict:Math.abs(difference)<0.005?'相若':difference<0?'較便宜':'較貴'};}
function reference(rows){if(!Array.isArray(rows))throw Error('參考匯率格式不正確');const out={};for(const c of Object.keys(CURRENCIES)){const r=rows.find(r=>String(r.base).toUpperCase()==='HKD'&&String(r.quote).toUpperCase()===c);if(!r||!positive(r.rate)||!validDate(r.date)||r.date>today())throw Error('參考匯率資料不完整');out[c]={rate:1/Number(r.rate),date:r.date};}return out;}
function atomicWrite(storage,changes){const old=Object.fromEntries(Object.keys(changes).map(k=>[k,storage.getItem(k)]));try{for(const[k,v]of Object.entries(changes))storage.setItem(k,v);}catch(e){for(const k of Object.keys(changes))storage.removeItem(k);for(const[k,v]of Object.entries(old))if(v!==null)storage.setItem(k,v);throw Error('儲存失敗，已保留原資料。');}}
return {CURRENCIES,today,blank,normalize,load,save,merge,stats,compare,reference,atomicWrite};
});
