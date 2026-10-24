(function(){
 const {useState,useEffect,useRef}=React,E=window.FXLedger;
 const num=(n,d=2)=>Number(n).toLocaleString('en-HK',{minimumFractionDigits:d,maximumFractionDigits:d});
 const money=n=>'HK$'+num(n),rateLabel=(r,c)=>r==null?'尚無紀錄':`HK$${num(r*(c==='JPY'?100:1),4)} / ${c==='JPY'?'100':'1'} ${c}`;
 const keyFor=account=>`fundLedger_${account}_fxJournalV1`;
 function Field({label,children}){return <label className="fx-field"><span>{label}</span>{React.cloneElement(children,{'aria-label':label})}</label>;}
 function Entry({initial,currency,onSave,onClose}){
  const [f,setF]=useState(()=>({id:crypto.randomUUID(),currency,direction:'buy',kind:'actual',date:E.today(),foreign:'',hkd:'',feeHKD:'',place:'',note:'',...initial})),[error,setError]=useState('');
  const banks=['中國銀行','匯豐','恆生'];
  const [customBank,setCustomBank]=useState(!!initial?.place&&!banks.includes(initial.place));
  const put=(k,v)=>setF(p=>({...p,[k]:v}));
  function submit(e){e.preventDefault();try{const row=E.normalize({schemaVersion:1,records:[f]}).records[0];onSave(row);}catch(e){setError(e.message);}}
  return <div className="fx-backdrop"><form className="fx-modal" role="dialog" aria-modal="true" aria-label="換匯紀錄表單" onSubmit={submit}>
   <h2>{initial?'編輯換匯':'新增換匯'}</h2><div className="fx-grid">
    <Field label="外幣"><select value={f.currency} onChange={e=>put('currency',e.target.value)}>{Object.entries(E.CURRENCIES).map(([k,n])=><option key={k} value={k}>{n} {k}</option>)}</select></Field>
    <Field label="換匯方向"><select value={f.direction} onChange={e=>put('direction',e.target.value)}><option value="buy">港幣買入外幣</option><option value="sell">外幣換回港幣</option></select></Field>
    <Field label={f.direction==='buy'?'實收外幣數量':'實付外幣數量'}><input inputMode="decimal" type="number" min="0.00000001" step="any" required value={f.foreign} onChange={e=>put('foreign',e.target.value)}/></Field>
    <Field label={f.direction==='buy'?'實付港幣總額（含費用）':'實收港幣淨額（已扣費用）'}><input inputMode="decimal" type="number" min="0.00000001" step="any" required value={f.hkd} onChange={e=>put('hkd',e.target.value)}/></Field>
    <Field label={f.kind==='actual'?'換匯日期':'大約日期（可留空）'}><input type="date" required={f.kind==='actual'} max={E.today()} value={f.date} onChange={e=>put('date',e.target.value)}/></Field>
    <Field label="銀行／兌換店（選填）"><select value={customBank?'other':f.place} onChange={e=>{setCustomBank(e.target.value==='other');put('place',e.target.value==='other'?'':e.target.value);}}><option value="">未指定</option>{banks.map(b=><option key={b}>{b}</option>)}<option value="other">其他銀行／兌換店</option></select></Field>
    {customBank&&<Field label="銀行／兌換店名稱"><input value={f.place} onChange={e=>put('place',e.target.value)}/></Field>}
   </div>
   <div className="fx-entry-rate">{Number(f.foreign)>0&&Number(f.hkd)>0?rateLabel(Number(f.hkd)/Number(f.foreign),f.currency):'填入實收、實付金額，自動計算匯率'}</div>
   <details className="fx-extra" open={initial&&(initial.kind==='memory'||initial.feeHKD>0||!!initial.note)?true:undefined}><summary>更多資料 <span>費用 · 備註 · 回憶補記</span></summary><div className="fx-grid">
    <Field label="紀錄可信度"><select value={f.kind} onChange={e=>put('kind',e.target.value)}><option value="actual">已核實交易</option><option value="memory">憑印象補記（參考用）</option></select></Field>
    <Field label="其中已包含的港幣費用（選填）"><input inputMode="decimal" type="number" min="0" step="any" value={f.feeHKD} onChange={e=>put('feeHKD',e.target.value)}/></Field>
    <Field label="備註"><textarea value={f.note} onChange={e=>put('note',e.target.value)} rows="2"/></Field>
   </div><p className="fx-muted">費用已包含在港幣總額內，不會重複加上。回憶補記不計入買入平均成本。</p></details>
   {error&&<p role="alert" className="fx-error">{error}</p>}<div className="fx-actions"><button type="button" onClick={onClose}>取消</button><button className="fx-primary" type="submit">儲存換匯</button></div>
  </form></div>;
 }
 function HistoryChart({rows,currency}){
  if(rows.length<2)return <p className="fx-muted">累積兩筆已核實買入後，會顯示個人換匯成本走勢。</p>;
  const shown=rows.slice(-30),rates=shown.map(r=>r.hkd/r.foreign),lo=Math.min(...rates),hi=Math.max(...rates),span=hi-lo||lo*.01;
  const pts=shown.map((r,i)=>({x:28+i*464/(shown.length-1),y:120-(r.hkd/r.foreign-lo)*90/span,r}));
  return <><svg className="fx-chart" viewBox="0 0 520 155" role="img" aria-label="個人已核實買入匯率走勢，越低越便宜"><path d="M28 22V125H492" fill="none" stroke="var(--border)"/><polyline points={pts.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="2"/>{pts.map(p=><circle key={p.r.id} cx={p.x} cy={p.y} r="4" fill="var(--accent)"><title>{p.r.date} · {rateLabel(p.r.hkd/p.r.foreign,currency)}</title></circle>)}<text x="28" y="149" fill="var(--text-3)" fontSize="11">{shown[0].date}</text><text x="492" y="149" textAnchor="end" fill="var(--text-3)" fontSize="11">{shown.at(-1).date}</text></svg><p className="fx-muted">最近 {shown.length} 筆實際買入，按交易先後排列；這是你的成交成本，不是市場每日走勢。</p></>;
 }
 function FXPage({account}){
  const [loaded]=useState(()=>{try{return {data:E.load(localStorage,keyFor(account)),error:''};}catch(e){return {data:E.blank(),error:'匯率資料未能讀取，已停止寫入：'+e.message};}});
  const [data,setData]=useState(loaded.data),[error,setError]=useState(loaded.error),[currency,setCurrency]=useState('CNY'),[editing,setEditing]=useState(null),[page,setPage]=useState(0);
  const [amount,setAmount]=useState('500'),[quote,setQuote]=useState(''),[quoteSource,setQuoteSource]=useState('銀行／兌換店報價'),[base,setBase]=useState('average'),[baseAmount,setBaseAmount]=useState(''),[baseHKD,setBaseHKD]=useState('');
  const [reference,setReference]=useState(()=>{try{const c=JSON.parse(localStorage.getItem('fundLedger_publicFxReferenceV1'));return c?E.reference(c):null;}catch(_){return null;}}),[busy,setBusy]=useState(false),[referenceError,setReferenceError]=useState('');
  const controller=useRef(null);
  useEffect(()=>()=>controller.current?.abort(),[]);
  const stats=E.stats(data,currency),memories=data.records.filter(r=>r.currency===currency&&r.kind==='memory'&&r.direction==='buy');
  const remembered=memories.find(r=>`memory:${r.id}`===base);
  const baseline=base==='average'?stats.average:base==='last'?(stats.last?stats.last.hkd/stats.last.foreign:null):base==='low'?stats.low:base==='manual'&&Number(baseAmount)>0?Number(baseHKD)/Number(baseAmount):remembered?remembered.hkd/remembered.foreign:null;
  const compared=E.compare(amount,quote,baseline);
  const history=data.records.filter(r=>r.currency===currency).map((r,i)=>({...r,index:i})).sort((a,b)=>(b.date||'').localeCompare(a.date||'')||b.index-a.index);
  const pages=Math.max(1,Math.ceil(history.length/20)),currentPage=Math.min(page,pages-1);
  function save(next){if(loaded.error)throw Error(loaded.error);const clean=E.save(localStorage,keyFor(account),next);setData(clean);setError('');}
  function changeCurrency(c){setCurrency(c);setAmount(c==='JPY'?'10000':c==='USD'?'100':'500');setQuote('');setQuoteSource('銀行／兌換店報價');setBase('average');setBaseAmount('');setBaseHKD('');setPage(0);}
  function saveRow(row){save({...data,records:data.records.some(r=>r.id===row.id)?data.records.map(r=>r.id===row.id?row:r):[...data.records,row]});setEditing(null);setPage(0);}
  function remove(row){if(!confirm('刪除這筆換匯紀錄？'))return;try{save({...data,records:data.records.filter(r=>r.id!==row.id)});}catch(e){setError(e.message);}}
  async function refresh(){setBusy(true);setReferenceError('');const c=new AbortController();controller.current=c;const timer=setTimeout(()=>c.abort(),12000);try{const r=await fetch('https://api.frankfurter.dev/v2/providers/ecb/rates?base=HKD&quotes=CNY,USD,JPY',{signal:c.signal});if(!r.ok)throw Error('服務暫時無法使用');const raw=await r.json(),next=E.reference(raw);setReference(next);try{localStorage.setItem('fundLedger_publicFxReferenceV1',JSON.stringify(raw));}catch(_){} }catch(e){setReferenceError('未能更新參考匯率；可直接填銀行報價比較。已保存的參考仍標示原日期。');}finally{clearTimeout(timer);setBusy(false);}}
  function useReference(c){if(c!==currency)changeCurrency(c);const n=c===currency?Number(amount):c==='JPY'?10000:c==='USD'?100:500;if(n>0){setQuote((n*reference[c].rate).toFixed(4));setQuoteSource(`ECB 每日參考 · ${reference[c].date}，未含銀行差價／費用`);}}
  return <div className="fx-page">
   <div className="fx-toolbar"><div><h2>匯率紀錄</h2><p className="fx-muted">記下成本，下次換匯心中有數。</p></div><button className="fx-primary" onClick={()=>setEditing({})}>＋ 新增換匯</button></div>
   {error&&<p className="fx-error" role="alert">{error}</p>}
   <div className="fx-actions" role="group" aria-label="選擇幣別">{Object.entries(E.CURRENCIES).map(([c,n])=><button className={currency===c?'fx-selected':''} key={c} onClick={()=>changeCurrency(c)}>{n} {c}</button>)}</div>
   <section className="fx-panel fx-calculator"><div className="fx-section-head"><h3>換匯計算機</h3><span className="fx-muted">港幣成本越低，越美麗</span></div>
    <div className="fx-calc-inputs"><Field label={`想買多少 ${currency}`}><input inputMode="decimal" type="number" min="0" step="any" value={amount} onChange={e=>{setAmount(e.target.value);setQuoteSource('手填報價，請核對總額');}}/></Field><Field label="報價需付港幣（含費用）"><input inputMode="decimal" type="number" min="0" step="any" value={quote} placeholder="0.00" onChange={e=>{setQuote(e.target.value);setQuoteSource('銀行／兌換店報價');}}/></Field>
    </div><div className="fx-base-select"><Field label="比較基準"><select value={base} onChange={e=>setBase(e.target.value)}><option value="average">我的實際買入平均成本</option><option value="last">上次實際買入</option><option value="low">歷史最便宜的實際買入</option><option value="manual">手填比較基準（不存為交易）</option>{memories.map(r=><option key={r.id} value={`memory:${r.id}`}>回憶參考：{r.date||'日期未知'} · {money(r.hkd)} / {num(r.foreign)} {currency}</option>)}</select></Field></div>
    {base==='manual'&&<div className="fx-grid" style={{marginTop:14}}><Field label="基準外幣數量"><input inputMode="decimal" type="number" min="0" step="any" value={baseAmount} onChange={e=>setBaseAmount(e.target.value)}/></Field><Field label="基準港幣金額"><input inputMode="decimal" type="number" min="0" step="any" value={baseHKD} onChange={e=>setBaseHKD(e.target.value)}/></Field></div>}
    {compared?<div className="fx-result"><div><strong>{compared.verdict}{Math.abs(compared.difference)>=.005?` ${num(Math.abs(compared.percent))}%`:''}</strong><span>{compared.difference<0?'少付':'多付'} {money(Math.abs(compared.difference))}</span></div><small>同樣買 {num(Number(amount))} {currency}，基準成本 {money(compared.baseCost)}</small></div>:<div className="fx-result fx-result-empty">{baseline>0?'填入港幣報價，即可比較差額':'先新增換匯紀錄，或選擇手填基準'}</div>}
    <details className="fx-extra"><summary>試算說明與市場參考</summary><p className="fx-muted">{quoteSource}。{base==='manual'||remembered?'目前採用手填或回憶基準。':'平均成本只計已核實買入。'}比較歷史成本，不預測升跌。{compared&&` 報價 ${rateLabel(compared.rate,currency)}；基準 ${rateLabel(baseline,currency)}。`}</p>
    {currency==='CNY'&&<div className="fx-example"><button onClick={()=>{setAmount('500');setQuote('590');setBase('manual');setBaseAmount('500');setBaseHKD('580');setQuoteSource('示例報價，非即時匯率');}}>試算這個例子</button><span>500 CNY：HK$580 → HK$590，不會新增交易。</span></div>}
    <div className="fx-toolbar"><h3>每日市場參考</h3><button disabled={busy} onClick={refresh}>{busy?'更新中…':'更新參考匯率'}</button></div>
    {reference&&<div className="fx-reference-grid"><button onClick={()=>useReference(currency)}><strong>{E.CURRENCIES[currency]} · {rateLabel(reference[currency].rate,currency)}</strong><br/>{reference[currency].date} · 帶入試算</button></div>}
    <p className="fx-muted">ECB 每日資料由 <a href="https://frankfurter.dev/" target="_blank" rel="noreferrer">Frankfurter</a> 提供，非即時成交價，未含銀行差價或費用；假日可能沿用上一工作日。</p>{referenceError&&<p role="status" className="fx-muted">{referenceError}</p>}</details>
   </section>
   <section className="fx-panel fx-benchmark"><div className="fx-section-head"><h3>我的換匯基準</h3><span className="fx-muted">港幣 / {currency==='JPY'?'100':'1'} {currency} · {stats.count} 筆買入</span></div><div className="fx-metrics">{[['平均成本',stats.average],['最便宜',stats.low],['上次買入',stats.last?stats.last.hkd/stats.last.foreign:null]].map(([label,value])=><div className="fx-metric" key={label}><span>{label}</span><strong>{value==null?'—':num(value*(currency==='JPY'?100:1),4)}</strong></div>)}</div>{!stats.count&&<p className="fx-muted">尚無紀錄，新增第一筆後自動建立基準。</p>}<details className="fx-extra"><summary>查看成本走勢與明細</summary><p className="fx-muted">已核實買入 {stats.count} 筆，共付 {money(stats.totalHKD)} · 買入 {num(stats.totalForeign)} {currency}。平均成本＝總港幣 ÷ 總外幣；回憶及換回港幣不計入。</p><HistoryChart rows={stats.rows} currency={currency}/></details></section>
   <section className="fx-panel"><h3>歷史換匯（{history.length} 筆）</h3><p className="fx-muted">平均成本只統計已核實買入；不代表目前外幣餘額或投資回報。</p><div className="fx-table-wrap"><table className="fx-table"><thead><tr><th>日期／狀態</th><th>外幣</th><th>港幣收付</th><th>實際匯率</th><th>操作</th></tr></thead><tbody>{history.slice(currentPage*20,currentPage*20+20).map(r=><tr key={r.id}><td>{r.date||'日期待補'}<small className={r.kind==='memory'?'fx-tag':''}>{r.kind==='memory'?'回憶參考':'已核實'} · {r.direction==='buy'?'買入外幣':'換回港幣'}</small><small>{r.place}</small></td><td>{num(r.foreign)} {r.currency}</td><td>{money(r.hkd)}{r.feeHKD>0&&<small>其中費用 {money(r.feeHKD)}</small>}</td><td>{rateLabel(r.hkd/r.foreign,r.currency)}<small className="fx-note-text">{r.note}</small></td><td><button aria-label={`編輯換匯 ${r.id}`} onClick={()=>setEditing(r)}>編輯</button> <button aria-label={`刪除換匯 ${r.id}`} onClick={()=>remove(r)}>刪除</button></td></tr>)}</tbody></table></div>{!history.length&&<p className="fx-muted">這個幣別還沒有紀錄。由第一筆實際換匯開始累積。</p>}{pages>1&&<div className="fx-actions"><button disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>上一頁</button><span>{currentPage+1} / {pages}</span><button disabled={currentPage+1>=pages} onClick={()=>setPage(currentPage+1)}>下一頁</button></div>}</section>
   {editing&&<Entry initial={Object.keys(editing).length?editing:null} currency={currency} onSave={saveRow} onClose={()=>setEditing(null)}/>}
  </div>;
 }
 window.FXPage=FXPage;
})();
