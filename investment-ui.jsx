/* Supplemental exchange, fees and HKD comparison inside the unified fund records. */
(function () {
  const { useState, useMemo } = React;
  const E = window.InvestmentLedger;
  const money = (n, c = 'HKD') => n == null || !Number.isFinite(n) ? '待補資料' : `${c === 'HKD' ? 'HK$' : c === 'USD' ? 'US$' : c + ' '}${n.toLocaleString('en-HK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const ident = () => 'v2-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const names = { buy: '買入', sell: '賣出', exchange: '換匯', deposit: '入金', withdraw: '提取', dividend: '股息／派息', fee: '費用' };
  function Field({ label, children, hint }) { return <label className="iv-field"><span>{label}</span>{React.Children.map(children, child => React.isValidElement(child) && ["input","select"].includes(child.type) ? React.cloneElement(child, {"aria-label":label}) : child)}{hint && <small>{hint}</small>}</label>; }
  function Metric({ label, value, hint, gain }) { return <div className="iv-metric"><span>{label}</span><strong className={gain == null ? '' : gain >= 0 ? 'iv-pos' : 'iv-neg'}>{value}</strong>{hint && <small>{hint}</small>}</div>; }
  function EventForm({ initial, onSave, onClose, symbols, allowedTypes }) {
    const [f, setF] = useState(() => ({ id: ident(), account: 'trade25', type: 'buy', date: today(), currency: 'USD', settlement: 'wallet', symbol: '', name: '', units: '', price: '', amount: '', fee: '', hkd: '', usd: '', direction: 'toUSD', status: 'pending', category: 'platform', month: today().slice(0,7), note: '', seq: Date.now(), ...initial }));
    const [error, setError] = useState('');
    const [detail, setDetail] = useState(!!initial?.feeParts);
    const [parts, setParts] = useState(() => Object.fromEntries((initial?.feeParts || []).map(p => [p.label,p.amount])));
    const put = (k,v) => setF(p => ({ ...p, [k]: v }));
    const isTrade = ['buy','sell'].includes(f.type), hasFee = isTrade || f.type === 'dividend';
    const totalFee = detail ? Object.values(parts).reduce((n,v) => n + Number(v || 0),0) : Number(f.fee || 0);
    const net = Number(f.amount || 0) + (f.type === 'buy' ? totalFee : -totalFee);
    const requireHKD = f.type !== 'exchange' && f.currency !== 'HKD' && (f.settlement === 'external' || ['deposit','withdraw'].includes(f.type));
    function submit(ev) {
      ev.preventDefault();
      try {
        const e = { ...f, symbol: f.symbol.trim().toUpperCase(), amount: Number(f.type === 'exchange' ? f.usd : f.amount), fee: hasFee ? totalFee : 0, units: Number(f.units || 0), seq: Number(f.seq) };
        if (detail && hasFee) e.feeParts = Object.entries(parts).map(([label,amount]) => ({ label, amount: Number(amount || 0) })); else delete e.feeParts;
        if (['deposit','withdraw'].includes(e.type)) e.settlement = 'external';
        if (e.date > today() && !(e.type === 'fee' && e.status === 'pending')) throw Error('實際交易／扣款日期不可晚於今天');
        E.validateEvent(e); onSave(e);
      } catch (err) { setError(err.message); }
    }
    return <div className="iv-backdrop"><form className="iv-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-label="投資紀錄">
      <div className="iv-title"><h2>{initial?.existing ? '編輯紀錄' : '新增紀錄'}</h2><button type="button" onClick={onClose} aria-label="關閉投資紀錄">✕</button></div>
      <div className="iv-grid">
        <Field label="紀錄類型"><select value={f.type} onChange={e => put('type',e.target.value)}>{Object.entries(names).filter(([v])=>!allowedTypes||allowedTypes.includes(v)).map(([v,n]) => <option key={v} value={v}>{n}</option>)}</select></Field>
        <Field label="平台"><select value={f.account} onChange={e => put('account',e.target.value)}>{Object.entries(E.ACCOUNTS).map(([k,n]) => <option key={k} value={k}>{n}</option>)}</select></Field>
        <Field label={f.type === 'fee' ? (f.status === 'confirmed' ? '實際扣款日期' : '預計扣款日期') : '交易／換匯日期'}><input required type="date" value={f.date} onChange={e => put('date',e.target.value)} /></Field>
        {f.type !== 'exchange' && <Field label="成交／扣費幣別"><select value={f.currency} onChange={e => put('currency',e.target.value)}><option>USD</option><option>HKD</option></select></Field>}
        {isTrade && <><Field label="股票／ETF 代碼"><input required list="iv-symbols" value={f.symbol} placeholder="例如 AAPL、VOO" onChange={e => put('symbol',e.target.value)} /><datalist id="iv-symbols">{symbols.map(v => <option key={v} value={v}/>)}</datalist></Field>
          <Field label="股數／單位"><input required min="0.00000001" step="any" type="number" value={f.units} onChange={e => setF(p=>({...p,units:e.target.value,...(Number(p.price)>0?{amount:String(Number(p.price)*Number(e.target.value))}:{})}))} /></Field><Field label="每股成交價（選填，可計算總額）"><input min="0" step="any" type="number" value={f.price||''} onChange={e=>setF(p=>({...p,price:e.target.value,...(Number(p.units)>0?{amount:String(Number(p.units)*Number(e.target.value))}:{})}))} /></Field></>}
        {f.type === 'exchange' ? <>
          <Field label="換匯方向"><select value={f.direction} onChange={e => put('direction',e.target.value)}><option value="toUSD">港幣 → 美元</option><option value="toHKD">美元 → 港幣</option></select></Field>
          <Field label={f.direction === 'toUSD' ? '實付港幣總額（含換匯費）' : '實收港幣淨額（已扣換匯費）'}><input required min="0.01" step="any" type="number" value={f.hkd} onChange={e => put('hkd',e.target.value)} /></Field>
          <Field label={f.direction === 'toUSD' ? '實收美元' : '實付美元'}><input required min="0.01" step="any" type="number" value={f.usd} onChange={e => put('usd',e.target.value)} /></Field>
          <Field label="上述港幣已包含的明收換匯費（選填）" hint="僅作費用分析，不再扣一次；匯差已在實收實付中反映。"><input min="0" step="any" type="number" value={f.feeHKD || ''} onChange={e => put('feeHKD',e.target.value)} /></Field>
        </> : <Field label={f.type === 'fee' ? '費用金額' : isTrade ? '成交總額（未含費用）' : f.type === 'dividend' ? '派息總額（未扣稅）' : '實際入金／提取金額'}><input required min="0.00000001" step="any" type="number" value={f.amount} onChange={e => put('amount',e.target.value)} /></Field>}
        {!['deposit','withdraw'].includes(f.type) && <Field label="結算方式"><select value={f.settlement} onChange={e => put('settlement',e.target.value)}>
          <option value="wallet">使用／存入本帳本現金餘額</option>
          <option value="external">直接以帳本外港幣付款／收款</option>
        </select></Field>}
        {requireHKD && <Field label={['sell','dividend','withdraw'].includes(f.type) ? '實收港幣淨額（已扣全部費用）' : '實付港幣總額（已含全部費用）'} hint="填銀行實際扣款／入帳金額；不要再把費用加一次。"><input required min="0.01" step="any" type="number" value={f.hkd} onChange={e => put('hkd',e.target.value)} /></Field>}
        {f.type === 'fee' && <>
          <Field label="費用分類"><select value={f.category} onChange={e => put('category',e.target.value)}><option value="platform">平台月費</option><option value="management">戶口另扣管理費</option><option value="other">其他費用</option></select></Field>
          {f.category === 'platform' && <Field label="費用所屬月份"><input required type="month" value={f.month} onChange={e => put('month',e.target.value)} /></Field>}
          <Field label="扣款狀態"><select value={f.status} onChange={e => put('status',e.target.value)}><option value="pending">待核實（不扣減實際回報）</option><option value="confirmed">已確認扣款</option></select></Field>
        </>}
      </div>
      {hasFee && <div className="iv-panel"><label className="iv-check"><input type="checkbox" checked={detail} onChange={e => { if (e.target.checked && !Object.keys(parts).length && f.fee) setParts({其他: f.fee}); setDetail(e.target.checked); }} />分項記錄費用（均以 {f.currency} 計）</label>
        {detail ? <div className="iv-grid">{['佣金','平台交易費','政府／交易所費','股息預扣稅','其他'].map(k => <Field key={k} label={k}><input min="0" step="any" type="number" value={parts[k] ?? ''} onChange={e => setParts(p => ({...p,[k]:e.target.value}))} /></Field>)}</div> : <Field label={f.type === 'dividend' ? '預扣稅及費用總額' : '交易費用總額'}><input min="0" step="any" type="number" value={f.fee} onChange={e => put('fee',e.target.value)} /></Field>}
        <p>費用 {money(totalFee,f.currency)} · {f.type === 'buy' ? '合共支付' : '淨收'} {money(net,f.currency)}</p>
      </div>}
      <p className="iv-note">先換美元再買：先記換匯，再選「使用現金餘額」。直接扣港幣買：選「帳本外港幣」，不用再記同一筆換匯。基金淨值已含的內部管理費，不要另記支出。</p>
      <details><summary>備註與同日順序</summary><Field label="備註"><input value={f.note} onChange={e => put('note',e.target.value)} /></Field><Field label="同日順序（數字小的先處理）"><input type="number" step="any" required value={f.seq} onChange={e => put('seq',e.target.value)} /></Field></details>
      {error && <p role="alert" className="iv-error">{error}</p>}
      <div className="iv-actions"><button type="button" onClick={onClose}>取消</button><button className="iv-primary" type="submit">儲存紀錄</button></div>
    </form></div>;
  }
  function QuoteEditor({ holding, quote, onSave }) {
    const [price,setPrice] = useState(quote?.price || ''), [date,setDate] = useState(quote?.date || today());
    return <form className="iv-inline" onSubmit={e => { e.preventDefault(); onSave({price:Number(price),date}); }}><input aria-label={`${holding.symbol} 現價`} placeholder="現價" required type="number" min="0.00000001" step="any" value={price} onChange={e=>setPrice(e.target.value)} /><input aria-label={`${holding.symbol} 現價日期`} required type="date" max={today()} value={date} onChange={e=>setDate(e.target.value)} /><button>更新</button></form>;
  }
  function RateEditor({ currency, value, onSave }) {
    const [rate,setRate] = useState(value?.rate || ''), [date,setDate] = useState(value?.date || today());
    return <form className="iv-inline" onSubmit={e => {e.preventDefault();onSave({rate:Number(rate),date});}}><span>1 {currency} =</span><input aria-label={`${currency} 港幣匯率`} placeholder="港幣" required min="0.00000001" step="any" type="number" value={rate} onChange={e=>setRate(e.target.value)} /><input aria-label={`${currency} 匯率日期`} required max={today()} type="date" value={date} onChange={e=>setDate(e.target.value)} /><button>儲存匯率</button></form>;
  }
  function FeePlanner({ data, legacy, onChange, onEdit }) {
    const [from,setFrom] = useState(() => [...legacy.map(t=>t.date?.slice(0,7)), ...data.events.map(e=>e.date.slice(0,7))].filter(Boolean).sort()[0] || today().slice(0,7));
    const [to,setTo] = useState(today().slice(0,7)), [error,setError] = useState('');
    let list = []; try { list = E.feeSuggestions(data,from,to,legacy); } catch (_) {}
    function add(rows) {
      try {
        const events = rows.filter(r=>!r.exists && r.amount > 0).map((r,i)=>({id:ident(),type:'fee',account:r.account,date:r.month+'-01',currency:'HKD',amount:r.amount,fee:0,settlement:'external',status:'pending',category:'platform',month:r.month,note:'月費補記：待與銀行扣款核對',seq:Date.now()+i}));
        if (!events.length) throw Error('沒有可新增的月份；已存在、免費或資料不足的月份不會重複加入');
        onChange({...data,events:[...data.events,...events]}); setError('');
      } catch(e) {setError(e.message);}
    }
    return <details className="iv-panel iv-fees"><summary>月費補記與核對</summary><p className="iv-note">FlexInvest 按每月每日平均持倉市值判斷；減持後符合免月費條件的月份不再加 HK$28。月中賣出未必立即免當月費。Trade25 當月曾交易或持股才計 HK$25。以下先建立待核實紀錄，不代表銀行已扣款。</p>
      <div className="iv-inline"><Field label="開始月份"><input type="month" value={from} onChange={e=>setFrom(e.target.value)} /></Field><Field label="結束月份"><input type="month" max={today().slice(0,7)} value={to} onChange={e=>setTo(e.target.value)} /></Field><button onClick={()=>{try{E.months(from,to);add(list);}catch(e){setError(e.message);}}}>加入可判斷的待核實月費</button></div>
      {list.length ? <div className="iv-table-wrap"><table><thead><tr><th>月份</th><th>FlexInvest 月平均市值（HKD）</th><th>FlexInvest</th><th>Trade25</th></tr></thead><tbody>{list.filter(r=>r.account==='flexinvest').map(r=>{const trade=list.find(t=>t.month===r.month&&t.account==='trade25');return <tr key={r.month}><td>{r.month}</td><td><input className="iv-average" aria-label={`${r.month} FlexInvest 平均市值`} type="number" min="0" step="any" placeholder="填銀行月平均，非投入本金" defaultValue={data.flexMonthly[r.month] ?? ''} key={`${r.month}:${data.flexMonthly[r.month]}`} onBlur={e=>{const next={...data.flexMonthly};if(e.target.value==='') delete next[r.month];else next[r.month]=Number(e.target.value);try{onChange({...data,flexMonthly:next});}catch(err){setError(err.message);}}} /></td><td>{r.exists?(r.amount===0?'已記錄；本月符合免月費，請核對原紀錄':'已記錄'):r.amount===0?'免月費':r.amount==null?'待核實':money(r.amount)}<small>{r.reason}</small></td><td>{trade.exists?'已記錄':trade.amount==null?'未找到持股／交易':money(trade.amount)}</td></tr>;})}</tbody></table></div>:<p className="iv-error">請選正確的月份範圍（最多 120 個月）。</p>}
      <div className="iv-actions"><button onClick={()=>add(list.filter(r=>r.account==='flexinvest' && data.flexMonthly[r.month]===undefined).map(r=>({...r,amount:28})))}>缺資料月份先按 HK$28 建立待核實項目</button><button onClick={()=>onEdit({type:'fee',account:'flexinvest',currency:'HKD',amount:28,settlement:'external'})}>手動補一筆實際月費</button></div>
      <p className="iv-note">達 HK$10,000 至 HK$200,000：HK$28／月；超過 HK$200,000 按年率 0.8% 計，請填銀行實扣金額。Trade25 每月首 HK$250,000 交易額免佣，代收費仍須按通知書記錄。<a href="https://www.hsbc.com.hk/zh-hk/investments/products/mutual-funds/flexinvest/" target="_blank" rel="noreferrer">FlexInvest 條款</a> · <a href="https://www.hsbc.com.hk/zh-hk/investments/products/stocks/trade25/" target="_blank" rel="noreferrer">Trade25 條款</a>（2026-10-17 核對）</p>
      {error&&<p className="iv-error" role="alert">{error}</p>}
    </details>;
  }
  function InvestmentTools({data,onChange,legacy,nav,loadError}) {
    const [editing,setEditing]=useState(null),[error,setError]=useState(''),[filter,setFilter]=useState('all'),[page,setPage]=useState(0);
    const result=useMemo(()=>E.calculate(data,legacy,nav,today()),[data,legacy,nav]);
    const summary=filter==='all'?result.total:result.accounts[filter];
    const rows=[...data.events].filter(e=>!['buy','sell','dividend'].includes(e.type)).sort((a,b)=>b.date.localeCompare(a.date)||(b.seq||0)-(a.seq||0));
    const currencies=[...new Set(['USD',...legacy.map(t=>t.currency).filter(c=>c&&c!=='HKD')])];
    function save(next) {if(loadError)throw Error(loadError);onChange(E.normalize(next));}
    function saveEvent(e) {
      const clean={...e};delete clean.existing;
      const next={...data,events:data.events.some(t=>t.id===e.id)?data.events.map(t=>t.id===e.id?clean:t):[...data.events,clean]};
      const after=E.calculate(next,legacy,nav,today());
      const issue=after.issues.find(i=>!result.issues.some(j=>j.id===i.id&&j.message===i.message));
      if(issue)throw Error(issue.message);
      save(next);setEditing(null);setError('');
    }
    function remove(e){if(!confirm(`刪除 ${e.date} 的${names[e.type]}紀錄？`))return;try{const next={...data,events:data.events.filter(t=>t.id!==e.id)};const after=E.calculate(next,legacy,nav,today());if(after.issues.some(i=>!result.issues.some(j=>j.id===i.id&&j.message===i.message)))throw Error('請先核對後續交易，這筆現金仍被使用。');save(next);}catch(err){setError(err.message);}}
    const safeSave=next=>{try{save(next);setError('');}catch(err){setError(err.message);}};
    return <div className="iv-app iv-integrated">
      <div className="iv-toolbar"><span className="iv-note">基金、美股使用同一份交易紀錄</span><button onClick={()=>setEditing({type:'exchange',account:'trade25',settlement:'external'})}>記錄換匯</button><button onClick={()=>setEditing({type:'fee',account:'flexinvest',currency:'HKD',amount:28,settlement:'external'})}>補記費用</button></div>
      {(error||loadError)&&<p className="iv-error" role="alert">{loadError||error}</p>}
      <details className="iv-panel iv-comparison"><summary>換匯、月費與港幣對照</summary>
        <p className="iv-note">每筆交易可填實付／實收港幣。持倉及尚未換回的美元按下方匯率估值；實際換回後，以銀行入帳為準。</p>
        <div className="iv-switch">{[['all','全部平台'],...Object.entries(E.ACCOUNTS)].map(([k,n])=><button key={k} className={filter===k?'selected':''} onClick={()=>setFilter(k)}>{n}</button>)}</div>
        <div className="iv-net"><span>扣費後港幣淨回報{summary.estimated?' · 含估值':''}</span><strong className={summary.net==null?'':summary.net>=0?'iv-pos':'iv-neg'}>{money(summary.net)}</strong></div>
        <div className="iv-metrics"><Metric label="累計港幣投入" value={money(summary.deposits)} hint={summary.complete?'含另付費用':'已知金額；仍有資料待補'}/><Metric label="已取回港幣" value={money(summary.withdrawals)}/><Metric label="剩餘資產折合港幣" value={summary.complete?money(summary.assets):'待補資料'}/><Metric label="費用折合港幣" value={summary.feesComplete?money(summary.feesHKD):'待補匯率'} hint="已反映在淨回報，不另扣一次"/></div>
        <p className="iv-note">淨回報 = 已取回 ＋ 剩餘資產 − 累計投入。待核實月費 {money(summary.pendingHKD)} 尚未扣減。</p>
        {!!result.issues.length&&<div className="iv-error">{result.issues.map((i,n)=><p key={n}>{i.message}</p>)}</div>}
        {!!result.missing.length&&<details><summary>有 {result.missing.length} 項待補資料</summary>{result.missing.map((m,i)=><p key={i} className="iv-note">{m}</p>)}</details>}
        <details><summary>估值匯率與現金餘額</summary>{currencies.map(c=><RateEditor key={`${c}:${data.fx[c]?.rate}`} currency={c} value={data.fx[c]} onSave={q=>safeSave({...data,fx:{...data.fx,[c]:q}})}/>)}
          {Object.values(result.accounts).filter(a=>filter==='all'||a.id===filter).map(a=><p key={a.id}>{a.label}：{money(a.cash.HKD.amount)} ／ {money(a.cash.USD.amount,'USD')}</p>)}
          <button onClick={()=>setEditing({type:'deposit',account:'trade25'})}>補記入金</button> <button onClick={()=>setEditing({type:'withdraw',account:'trade25'})}>記錄提取</button>
        </details>
        <FeePlanner data={data} legacy={legacy} onChange={safeSave} onEdit={setEditing}/>
        <details className="iv-cash-records"><summary>換匯與費用紀錄（{rows.length}）</summary>
          {rows.slice(page*20,page*20+20).map(e=><div className="iv-cash-row" key={e.id}><div><strong>{names[e.type]} · {E.ACCOUNTS[e.account]}</strong><small>{e.date} {e.type==='fee'?(e.status==='pending'?'待核實':'已扣款'):''} {e.note||''}</small></div><span>{e.type==='exchange'?`${money(Number(e.hkd))} ／ ${money(Number(e.usd),'USD')}`:money(Number(e.amount),e.currency)}</span><button aria-label={`編輯 ${e.id}`} onClick={()=>setEditing({...e,existing:true})}>編輯</button><button aria-label={`刪除 ${e.id}`} onClick={()=>remove(e)}>刪除</button></div>)}
          {rows.length>20&&<div className="iv-actions"><button disabled={page===0} onClick={()=>setPage(page-1)}>上一頁</button><span>{page+1} / {Math.ceil(rows.length/20)}</span><button disabled={(page+1)*20>=rows.length} onClick={()=>setPage(page+1)}>下一頁</button></div>}
        </details>
      </details>
      {editing&&<EventForm initial={editing} allowedTypes={['exchange','fee','deposit','withdraw']} symbols={[]} onSave={saveEvent} onClose={()=>setEditing(null)}/>}
    </div>;
  }
  window.InvestmentTools=InvestmentTools;
})();
