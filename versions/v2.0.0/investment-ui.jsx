/* Separate v2 UI; legacy fund entry/OCR remain available in the original tabs. */
(function () {
  const { useState, useMemo } = React;
  const E = window.InvestmentLedger;
  const money = (n, c = 'HKD') => n == null || !Number.isFinite(n) ? '待補資料' : `${c === 'HKD' ? 'HK$' : c === 'USD' ? 'US$' : c + ' '}${n.toLocaleString('en-HK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const ident = () => 'v2-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const names = { buy: '買入', sell: '賣出', exchange: '換匯', deposit: '入金', withdraw: '提取', dividend: '股息／派息', fee: '費用' };
  function Field({ label, children, hint }) { return <label className="iv-field"><span>{label}</span>{React.Children.map(children, child => React.isValidElement(child) && ["input","select"].includes(child.type) ? React.cloneElement(child, {"aria-label":label}) : child)}{hint && <small>{hint}</small>}</label>; }
  function Metric({ label, value, hint, gain }) { return <div className="iv-metric"><span>{label}</span><strong className={gain == null ? '' : gain >= 0 ? 'iv-pos' : 'iv-neg'}>{value}</strong>{hint && <small>{hint}</small>}</div>; }
  function EventForm({ initial, onSave, onClose, symbols }) {
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
        <Field label="紀錄類型"><select value={f.type} onChange={e => put('type',e.target.value)}>{Object.entries(names).map(([v,n]) => <option key={v} value={v}>{n}</option>)}</select></Field>
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
    let list = []; try { list = E.feeSuggestions(data,from,to); } catch (_) {}
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
  function InvestmentPage({ data, onChange, legacy, nav, fundNames, onBackup, onImport, onLegacy, onOldBackup, loadError }) {
    const [filter,setFilter] = useState('all'), [editing,setEditing] = useState(null), [error,setError] = useState(''), [page,setPage] = useState(0);
    const result = useMemo(()=>E.calculate(data,legacy,nav,today()),[data,legacy,nav]);
    const summary = filter==='all'?result.total:result.accounts[filter];
    const holdings = result.holdings.filter(h=>h.units>0 && (filter==='all'||h.account===filter));
    const rows = [...result.rows].filter(r=>filter==='all'||r.account===filter).reverse();
    const currencies = [...new Set(['USD',...legacy.map(t=>t.currency).filter(c=>c&&c!=='HKD')])];
    function save(next) { if(loadError) throw Error('先處理資料讀取錯誤，避免覆蓋原始資料'); const normalized=E.normalize(next); onChange(normalized); }
    function saveEvent(e) {
      const clean={...e};delete clean.existing;
      const next={...data,events:data.events.some(t=>t.id===e.id)?data.events.map(t=>t.id===e.id?clean:t):[...data.events,clean]};
      const checked=E.calculate(next,legacy,nav,today());
      if(checked.issues.length) throw Error(checked.issues[0].message);
      save(next);setEditing(null);setError('');
    }
    function remove(e) {
      if(!confirm(`刪除 ${e.date} 的${names[e.type]}紀錄？`))return;
      try {const next={...data,events:data.events.filter(t=>t.id!==e.id)};const checked=E.calculate(next,legacy,nav,today());if(checked.issues.length)throw Error('刪除會令後續交易無法對帳：'+checked.issues[0].message);save(next);}catch(err){setError(err.message);}
    }
    const safeSave = next => {try{save(next);setError('');}catch(err){setError(err.message);}};
    return <div className="iv-app">
      <section className="iv-hero"><div className="iv-title"><div><span className="iv-eyebrow">INVESTMENT LEDGER · v2.0</span><h2>最後，港幣賺了多少？</h2><p>基金、美股、美元現金與費用，一起對帳。</p></div><div className="iv-actions"><button onClick={onBackup}>完整備份</button><button onClick={onImport}>還原備份</button></div></div>
        <div className="iv-switch">{[['all','全部投資'],['trade25','Trade25'],['flexinvest','FlexInvest']].map(([k,n])=><button key={k} className={filter===k?'selected':''} onClick={()=>{setFilter(k);setPage(0);}}>{n}</button>)}</div>
        <div className="iv-net"><span>{summary.estimated?'扣費後港幣淨回報 · 含估值':'扣費後港幣淨回報'}</span><strong className={summary.net==null?'':summary.net>=0?'iv-pos':'iv-neg'}>{money(summary.net)}</strong><small>{summary.net==null?'缺少的資料補齊前，不顯示可能誤導的總盈虧。':summary.estimated?'尚有持倉或美元現金；換匯及售出後，以實收金額為準。':'目前已沒有需估值的持倉或外幣現金。'}</small></div>
        <div className="iv-metrics"><Metric label="累計港幣投入" value={money(summary.deposits)} hint={summary.complete?"含帳本外另付費用":"已知金額；仍有資料待補"}/><Metric label="已取回港幣" value={money(summary.withdrawals)}/><Metric label="剩餘資產折合港幣" value={summary.complete?money(summary.assets):'待補資料'}/><Metric label="費用折合港幣" value={summary.feesComplete?money(summary.feesHKD):"待補估值匯率"} hint={Object.entries(summary.feesNative).map(([c,n])=>money(n,c)).join(" ＋ ") || "已反映在盈虧，勿再扣一次"}/></div>
        <p className="iv-note">淨回報 = 已取回 ＋ 剩餘資產 − 累計投入。費用分析按實付比例或估值匯率折算，已含在盈虧，不重複扣減。待核實月費 {money(summary.pendingHKD)} 尚未扣減。</p>
      </section>
      {(error||loadError)&&<p role="alert" className="iv-error">{loadError||error}</p>}
      {!!result.issues.length&&<div className="iv-error" role="alert">{result.issues.map(i=><p key={i.id}>{i.message}</p>)}</div>}
      {!!result.missing.length&&<details className="iv-panel"><summary>有 {result.missing.length} 項待補資料</summary>{result.missing.map((m,i)=><p key={i}>{m}</p>)}</details>}
      <div className="iv-toolbar"><button className="iv-primary" onClick={()=>setEditing({type:'buy'})}>＋ 買入美股／ETF</button><button onClick={()=>setEditing({type:'sell'})}>賣出</button><button onClick={()=>setEditing({type:'exchange',settlement:'external'})}>記錄換匯</button><button onClick={()=>setEditing({type:'dividend'})}>股息</button><button onClick={()=>setEditing({type:'deposit',currency:'HKD',settlement:'external'})}>入金／提取</button><button onClick={()=>setEditing({type:'fee',currency:'HKD',settlement:'external',category:'other'})}>其他費用</button></div>
      <section className="iv-panel"><h2>現金與估值匯率</h2><div className="iv-metrics">{Object.values(result.accounts).filter(a=>filter==='all'||a.id===filter).map(a=><div key={a.id}><h3>{E.ACCOUNTS[a.id]}</h3><p>港幣現金 {money(a.cash.HKD.amount)}</p><p>美元現金 {money(a.cash.USD.amount,'USD')}</p><small>美元資金未回收港幣本金 {money(a.cash.USD.basis)}</small></div>)}</div>
        {currencies.map(c=><div key={c}><RateEditor currency={c} value={data.fx[c]} onSave={v=>safeSave({...data,fx:{...data.fx,[c]:v}})}/>{data.fx[c]&&<small>估值匯率截至 {data.fx[c].date}，手動填寫；不改動歷史成本。{data.fx[c].date<today()?' 尚非今日匯率。':''}</small>}</div>)}
        <p className="iv-note">美元資金池保留未回收的港幣本金；賣股所得繼續投資不會重算新投入。換回港幣時顯示的已結算差額，包含之前投資收益及匯率影響，不能當作純匯兌收益或報稅成本。估值未預扣未來賣出費；實際兌換以淨收港幣記錄。</p>
      </section>
      <section className="iv-panel"><div className="iv-title"><h2>持倉與港幣投入</h2><button onClick={onLegacy}>原基金紀錄／更新淨值</button></div>{holdings.length?<div className="iv-table-wrap"><table><thead><tr><th>資產</th><th>股數／單位</th><th>分攤港幣本金</th><th>目前市值</th><th>港幣估算盈虧</th><th>現價</th></tr></thead><tbody>{holdings.map(h=><tr key={h.key}><td>{fundNames[h.symbol]||h.symbol}<small>{h.symbol} · {E.ACCOUNTS[h.account]}</small></td><td>{h.units.toLocaleString('en-HK',{maximumFractionDigits:6})}</td><td>{money(h.basisKnown?h.basis:null)}</td><td>{money(h.value,h.currency)}</td><td className={h.unrealizedHKD>=0?'iv-pos':'iv-neg'}>{money(h.unrealizedHKD)}</td><td>{h.legacy?<small>沿用基金頁淨值<br/>請在原基金頁核對日期</small>:<><QuoteEditor key={h.key+JSON.stringify(data.quotes[h.key]||{})} holding={h} quote={data.quotes[h.key]} onSave={v=>safeSave({...data,quotes:{...data.quotes,[h.key]:v}})}/><small>{h.priceDate?`截至 ${h.priceDate}`:'未填現價'}</small></>}</td></tr>)}</tbody></table></div>:<p>尚無持倉。先記錄換匯或直接以港幣買入。</p>}</section>
      <FeePlanner data={data} legacy={legacy} onChange={save} onEdit={setEditing}/>
      <section className="iv-panel"><h2>美股、換匯與費用紀錄</h2><p className="iv-note">同日紀錄按「同日順序」處理。原有基金交易仍在基金頁；本頁自動計入其港幣回報，毋須重複新增。</p>{rows.length?<><div className="iv-table-wrap"><table><thead><tr><th>日期／平台</th><th>內容</th><th>金額</th><th>結果／狀態</th><th>操作</th></tr></thead><tbody>{rows.slice(page*15,page*15+15).map(r=><tr key={r.id}><td>{r.date}<small>{E.ACCOUNTS[r.account]}</small></td><td>{names[r.type]} {r.symbol||''}<small>{r.month&&r.type==='fee'?`所屬 ${r.month} · `:''}{r.note}</small></td><td>{r.type==='exchange'?<>{money(Number(r.hkd))}<small>{r.direction==='toUSD'?'換得':'由'} {money(Number(r.usd),'USD')}</small></>:<>{money(Number(r.amount),r.currency)}{Number(r.fee)>0&&<small>費用 {money(Number(r.fee),r.currency)}</small>}</>}</td><td>{r.error?<span className="iv-neg">{r.error}</span>:r.pending?<span className="iv-badge">待核實，未扣減</span>:r.future?'未來日期，未計入':r.type==='fee'?<span className="iv-badge">已確認扣款</span>:<>{r.nativeGain!=null&&<small>原幣交易盈虧 {money(r.nativeGain,r.currency)}</small>}{r.settledGain!=null?<small>已結算差額 {money(r.settledGain)}</small>:r.type==='sell'?<small>{r.currency === "USD" ? "美元留存；港幣回報仍為估值" : "港幣已存入現金餘額"}</small>:null}</>}</td><td><button aria-label={`編輯 ${r.id}`} onClick={()=>setEditing({...r,existing:true})}>{r.pending?'核對扣款':'編輯'}</button><button aria-label={`刪除 ${r.id}`} onClick={()=>remove(r)}>刪除</button></td></tr>)}</tbody></table></div><div className="iv-actions"><button disabled={page===0} onClick={()=>setPage(p=>p-1)}>上一頁</button><span>{page+1} / {Math.max(1,Math.ceil(rows.length/15))}</span><button disabled={(page+1)*15>=rows.length} onClick={()=>setPage(p=>p+1)}>下一頁</button></div></>:<p>尚無 v2.0 紀錄。</p>}</section>
      {!!legacy.filter(t=>t.currency&&t.currency!=='HKD').length&&<details className="iv-panel"><summary>補齊舊外幣基金的實際港幣收付</summary><p className="iv-note">買入填含費用總扣款；賣出／派息填扣費後淨收款。若當年仍收取外幣而未換回，不要填今天的匯率當實收；先保留待補，原幣紀錄仍可查看。</p>{legacy.filter(t=>t.currency&&t.currency!=='HKD').map(t=><form className="iv-inline" key={t.id} onSubmit={e=>{e.preventDefault();const v=new FormData(e.target).get('hkd');safeSave({...data,legacyHKD:{...data.legacyHKD,[t.id]:Number(v)}});}}><span>{t.date} {t.fundCode} {names[t.type]} {money(Number(t.amount),t.currency)}</span><input name="hkd" aria-label={`${t.id} 實際港幣`} type="number" min="0.01" step="any" required defaultValue={data.legacyHKD[t.id]??''} placeholder="實際港幣收付"/><button>儲存</button></form>)}</details>}
      <details className="iv-panel"><summary>備份與計算說明</summary><p>舊基金沿用平均成本；HKD 交易按原有金額及手續費計算。原基金交易在港幣回報頁視為直接投入／取回，不產生本頁現金餘額。若把贖回款再放進美股帳本，按實際入金記錄；取回與投入會互相抵銷。</p><p>完整 JSON 備份包含基金及 v2.0 現金、換匯、月費、現價和匯率。原 CSV 只包含基金交易，不是完整備份。資料仍儲存在本機瀏覽器，不會自動跨裝置同步。</p><button onClick={onOldBackup}>下載升級前基金備份</button></details>
      {editing&&<EventForm initial={editing} symbols={[...new Set(data.events.map(e=>e.symbol).filter(Boolean))]} onSave={saveEvent} onClose={()=>setEditing(null)}/>}
    </div>;
  }
  window.InvestmentPage = InvestmentPage;
})();
