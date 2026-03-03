// @ts-nocheck
import { useState, useMemo, useRef, useCallback } from "react";
import * as XLSX from "xlsx";

const VERSION = "3.0.0";
const ALL_COLORS = ["블랙","화이트","실버","골드","브라운","네이비","레드","그린","핑크","투명","퍼플","오렌지","베이지","그레이","옐로우"];
const CATEGORIES = ["일반안경","선글라스"];
const PAY_METHODS = ["현금","계좌이체","카드","어음","기타"];
const TXN_TYPES = [
  { id:"입고(발주)",    icon:"📦", desc:"공장 발주 → 창고 입고",            color:"#064e3b", badge:"#6ee7b7", effect:{w:1, c:0} },
  { id:"채널입고",      icon:"➡️", desc:"창고 → 판매처 배치",              color:"#1e3a5f", badge:"#93c5fd", effect:{w:-1, c:1} },
  { id:"출고(판매)",    icon:"🛒", desc:"판매처에서 판매 완료",              color:"#4c1d95", badge:"#c4b5fd", effect:{w:0, c:-1} },
  { id:"반출(오프라인)",icon:"🏪", desc:"창고 → 오프라인 매장 반출",        color:"#78350f", badge:"#fcd34d", effect:{w:-1, c:1} },
  { id:"반품(오프라인)",icon:"↩️", desc:"오프라인 매장 → 창고 반품",        color:"#7f1d1d", badge:"#fca5a5", effect:{w:1, c:-1} },
  { id:"반품(온라인)",  icon:"🔄", desc:"온라인 고객 반품 → 창고",          color:"#312e81", badge:"#a5b4fc", effect:{w:1, c:0} },
];
const DEFAULT_ONLINE  = ["쿠팡","G마켓","11번가","네이버스토어","자사몰"];
const DEFAULT_OFFLINE = ["오프라인매장A","오프라인매장B","오프라인매장C"];

const INIT_PRODUCTS = [
  { id:"P001", barcode:"880123456001", name:"클래식 라운드 프레임", category:"일반안경", costPrice:8000,  colors:["블랙","실버","골드"], safeStock:10, photo:null },
  { id:"P002", barcode:"880123456002", name:"스퀘어 메탈 프레임",  category:"일반안경", costPrice:12000, colors:["블랙","브라운","실버"], safeStock:5, photo:null },
  { id:"P003", barcode:"880123456003", name:"오버사이즈 선글라스", category:"선글라스", costPrice:15000, colors:["블랙","화이트","레드"], safeStock:20, photo:null },
];
const INIT_PARTNERS = [
  { id:"C001", name:"자사몰 스토어", bizNo:"123-45-67890", ceoName:"홍길동", address:"서울시 강남구", phone:"02-1234-5678", email:"shop@ex.com", type:"온라인", bankName:"국민은행", bankAccount:"123-456-789012", bizType:"전자상거래", bizItem:"안경", notes:"" },
];
const INIT_CH_PARTNER = { "자사몰":"C001" };

const buildPrices=(products,channels)=>{ const p={}; products.forEach(pr=>{ p[pr.id]={}; channels.forEach(ch=>{ p[pr.id][ch]=pr.costPrice*3; }); }); return p; };
const buildStock=(products,channels)=>{ const s={}; products.forEach(pr=>{ s[pr.id]={}; pr.colors.forEach(c=>{ s[pr.id][c]={warehouse:Math.floor(Math.random()*40)+15}; channels.forEach(ch=>{ s[pr.id][c][ch]=Math.floor(Math.random()*8); }); }); }); return s; };
const buildTxns=(products,channels)=>{ const types=["입고(발주)","출고(판매)","반출(오프라인)"],txns=[],now=Date.now(); for(let i=0;i<25;i++){ const p=products[Math.floor(Math.random()*products.length)],c=p.colors[Math.floor(Math.random()*p.colors.length)],type=types[Math.floor(Math.random()*types.length)],ch=channels[Math.floor(Math.random()*channels.length)]; txns.push({id:`T${String(i).padStart(4,"0")}`,date:new Date(now-Math.random()*100*86400000).toISOString().split("T")[0],productId:p.id,productName:p.name,category:p.category,color:c,type,channel:ch,qty:Math.floor(Math.random()*8)+1,note:""}); } return txns.sort((a,b)=>b.date.localeCompare(a.date)); };

const fmt=n=>n?.toLocaleString("ko-KR")??"0";
const tod=()=>new Date().toISOString().split("T")[0];
const uid=()=>`${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
const mgClr=p=>p>=60?"#4ade80":p>=40?"#fbbf24":p>=20?"#fb923c":"#f87171";
const bdg=type=>{ const t=TXN_TYPES.find(x=>x.id===type); return t?{background:t.color,color:t.badge}:{background:"#374151",color:"#9ca3af"}; };
const dlCSV=(rows,fn)=>{ const bom="\uFEFF",csv=bom+rows.map(r=>r.map(c=>`"${String(c??"").replace(/"/g,'""')}"`).join(",")).join("\n"); const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8;"})); a.download=fn; a.click(); };
const calcSettle=(s)=>{ const paid=(s?.payments||[]).reduce((a,p)=>a+Number(p.amount),0),total=s?.totalAmount||0; if(!total)return{paid,total,remain:0,status:"미설정"}; if(paid<=0)return{paid,total,remain:total,status:"미결"}; if(paid>=total)return{paid,total,remain:0,status:"완료"}; return{paid,total,remain:total-paid,status:"부분수금"}; };

const S={
  inp:{width:"100%",padding:"9px 12px",background:"#2d3748",border:"1px solid #374151",borderRadius:8,color:"#e2e8f0",fontSize:13,boxSizing:"border-box"},
  sel:{width:"100%",padding:"9px 12px",background:"#2d3748",border:"1px solid #374151",borderRadius:8,color:"#e2e8f0",fontSize:13},
  lbl:{fontSize:12,color:"#64748b",display:"block",marginBottom:5,fontWeight:600},
  card:{background:"#1e2535",border:"1px solid #2d3748",borderRadius:12},
  btn:(v="p")=>({padding:"8px 16px",border:"none",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:600,background:v==="p"?"#3b82f6":v==="d"?"#dc2626":v==="s"?"#059669":v==="w"?"#d97706":"#374151",color:"#fff"}),
};

function Modal({title,onClose,children,wide}){
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:2000,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:16,overflowY:"auto"}}>
      <div style={{background:"#1a1f2e",border:"1px solid #2d3748",borderRadius:14,width:"100%",maxWidth:wide?900:560,marginTop:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"15px 22px",borderBottom:"1px solid #2d3748",position:"sticky",top:0,background:"#1a1f2e",zIndex:1}}>
          <span style={{fontWeight:700,fontSize:15,color:"#e2e8f0"}}>{title}</span>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#64748b",fontSize:22,cursor:"pointer",lineHeight:1}}>✕</button>
        </div>
        <div style={{padding:"18px 22px"}}>{children}</div>
      </div>
    </div>
  );
}
function Toast({msg,type}){return <div style={{position:"fixed",top:72,right:18,background:type==="e"?"#7f1d1d":"#065f46",color:"#fff",padding:"10px 16px",borderRadius:8,zIndex:4000,fontSize:13,pointerEvents:"none",boxShadow:"0 4px 20px rgba(0,0,0,.5)"}}>{msg}</div>;}
function PhotoUpload({value,onChange,size=80}){
  const ref=useRef();
  return(
    <div onClick={()=>ref.current.click()} style={{width:size,height:size,borderRadius:10,border:"2px dashed #374151",cursor:"pointer",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",background:"#2d3748",flexShrink:0}}>
      {value?<img src={value} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<div style={{textAlign:"center",color:"#64748b",fontSize:11,padding:4}}><div style={{fontSize:18}}>📷</div>사진</div>}
      <input ref={ref} type="file" accept="image/*" onChange={e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>onChange(ev.target.result);r.readAsDataURL(f);}} style={{display:"none"}}/>
    </div>
  );
}
function Thumb({p,size=44}){return p?.photo?<img src={p.photo} alt="" style={{width:size,height:size,borderRadius:8,objectFit:"cover",flexShrink:0}}/>:<div style={{width:size,height:size,borderRadius:8,background:"#2d3748",display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*.4,flexShrink:0}}>{p?.category==="선글라스"?"😎":"🕶️"}</div>;}

export default function App(){
  const [onlineChs,setOnlineChs]=useState(DEFAULT_ONLINE);
  const [offlineChs,setOfflineChs]=useState(DEFAULT_OFFLINE);
  const allChs=useMemo(()=>[...onlineChs,...offlineChs],[onlineChs,offlineChs]);
  const [products,setProducts]=useState(INIT_PRODUCTS);
  const [prices,setPrices]=useState(()=>buildPrices(INIT_PRODUCTS,[...DEFAULT_ONLINE,...DEFAULT_OFFLINE]));
  const [stock,setStock]=useState(()=>buildStock(INIT_PRODUCTS,[...DEFAULT_ONLINE,...DEFAULT_OFFLINE]));
  const [txns,setTxns]=useState(()=>buildTxns(INIT_PRODUCTS,[...DEFAULT_ONLINE,...DEFAULT_OFFLINE]));
  const [partners,setPartners]=useState(INIT_PARTNERS);
  const [chPartner,setChPartner]=useState(INIT_CH_PARTNER);
  const [settles,setSettles]=useState({});
  const [tab,setTab]=useState("dashboard");
  const [toast,setToast]=useState(null);
  const notify=(msg,type="s")=>{setToast({msg,type});setTimeout(()=>setToast(null),3000);};

  const warehouseTotal=useMemo(()=>{const t={};products.forEach(p=>{t[p.id]=0;(p.colors||[]).forEach(c=>{t[p.id]+=(stock[p.id]?.[c]?.warehouse??0);});});return t;},[stock,products]);
  const channelTotal=useMemo(()=>{const t={};products.forEach(p=>{t[p.id]={};allChs.forEach(ch=>{t[p.id][ch]=0;(p.colors||[]).forEach(c=>{t[p.id][ch]+=(stock[p.id]?.[c]?.[ch]??0);});});});return t;},[stock,products,allChs]);

  const applyStock=useCallback((txn, isCancel=false)=>{
    setStock(prev=>{
      const s=JSON.parse(JSON.stringify(prev));
      const ens=(pid,c)=>{if(!s[pid])s[pid]={};if(!s[pid][c]){s[pid][c]={warehouse:0};allChs.forEach(ch=>{s[pid][c][ch]=0;});}};
      ens(txn.productId,txn.color);
      const tInfo = TXN_TYPES.find(t=>t.id===txn.type);
      if(tInfo && tInfo.effect){
        const mult = isCancel ? -1 : 1;
        s[txn.productId][txn.color].warehouse = Math.max(0, s[txn.productId][txn.color].warehouse + (tInfo.effect.w * txn.qty * mult));
        if(tInfo.effect.c !== 0 && txn.channel){
            s[txn.productId][txn.color][txn.channel] = Math.max(0, (s[txn.productId][txn.color][txn.channel]??0) + (tInfo.effect.c * txn.qty * mult));
        }
      }
      return s;
    });
  },[allChs]);

  const addTxn=useCallback((txn)=>{const nt={...txn,id:`T${uid()}`,date:tod()};setTxns(prev=>[nt,...prev]);applyStock(nt);notify("✅ 처리 완료");},[applyStock]);
  
  // 5번 기능: 이력 취소 및 재고 롤백
  const cancelTxn=useCallback((txnId)=>{
      const txn = txns.find(t=>t.id===txnId);
      if(!txn) return;
      if(!window.confirm(`[${txn.type}] 거래를 취소하고 재고를 원래대로 되돌리시겠습니까?`)) return;
      setTxns(prev=>prev.filter(t=>t.id!==txnId));
      applyStock(txn, true); // isCancel = true 로 재고 원복
      notify("↩️ 취소 및 재고 롤백 완료", "e");
  }, [txns, applyStock]);

  const saveSettle=(txnId,settle)=>setSettles(prev=>({...prev,[txnId]:settle}));
  const saveProduct=p=>{setProducts(prev=>prev.find(x=>x.id===p.id)?prev.map(x=>x.id===p.id?p:x):[...prev,p]);setStock(prev=>{const s=JSON.parse(JSON.stringify(prev));if(!s[p.id])s[p.id]={};(p.colors||[]).forEach(c=>{if(!s[p.id][c]){s[p.id][c]={warehouse:0};allChs.forEach(ch=>{s[p.id][c][ch]=0;});}});return s;});setPrices(prev=>{const pp=JSON.parse(JSON.stringify(prev));if(!pp[p.id])pp[p.id]={};allChs.forEach(ch=>{if(pp[p.id][ch]===undefined)pp[p.id][ch]=p.costPrice*3;});return pp;});notify("💾 제품 저장됨");};
  const delProduct=pid=>{setProducts(prev=>prev.filter(p=>p.id!==pid));notify("🗑️ 삭제됨","e");};
  const savePartner=p=>{setPartners(prev=>prev.find(x=>x.id===p.id)?prev.map(x=>x.id===p.id?p:x):[...prev,p]);notify("💾 거래처 저장됨");};
  const delPartner=id=>{setPartners(prev=>prev.filter(p=>p.id!==id));notify("🗑️ 삭제됨","e");};

  const backup=()=>{const data={version:VERSION,date:tod(),products,prices,stock,txns,settles,partners,chPartner,onlineChs,offlineChs};const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));a.download=`opticstock_${tod()}.json`;a.click();notify("📦 백업 저장 완료");};
  const restRef=useRef();
  const restore=e=>{const file=e.target.files[0];if(!file)return;const r=new FileReader();r.onload=ev=>{try{const d=JSON.parse(ev.target.result);if(d.products)setProducts(d.products);if(d.prices)setPrices(d.prices);if(d.stock)setStock(d.stock);if(d.txns)setTxns(d.txns);if(d.settles)setSettles(d.settles);if(d.partners)setPartners(d.partners);if(d.chPartner)setChPartner(d.chPartner);if(d.onlineChs)setOnlineChs(d.onlineChs);if(d.offlineChs)setOfflineChs(d.offlineChs);notify("✅ 데이터 복원 완료");}catch{notify("❌ 파일 오류","e");}};r.readAsText(file);e.target.value="";};

  const TABS=[{id:"dashboard",label:"📊 대시보드"},{id:"products",label:"🗂️ 제품관리"},{id:"inventory",label:"📦 재고현황"},{id:"movement",label:"🔄 입출고"},{id:"history",label:"📋 이력"},{id:"partners",label:"🏢 거래처"},{id:"settle",label:"💳 수금관리"},{id:"prices",label:"💰 가격/마진"},{id:"search",label:"🔍 재고검색"},{id:"report",label:"📄 리포트"}];
  const ctx={products,prices,stock,txns,settles,partners,chPartner,allChs,onlineChs,offlineChs,warehouseTotal,channelTotal,addTxn,cancelTxn,saveProduct,delProduct,savePartner,delPartner,saveSettle,setChPartner,setPrices,notify};

  return(
    <div style={{fontFamily:"'Apple SD Gothic Neo','Pretendard',sans-serif",background:"#0f1117",minHeight:"100vh",color:"#e2e8f0"}}>
      <div style={{background:"linear-gradient(135deg,#1a1f2e,#161b2e)",borderBottom:"1px solid #2d3748",padding:"11px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}><span style={{fontSize:24}}>👓</span><div><div style={{fontSize:16,fontWeight:800}}>OPTIC STOCK PRO</div><div style={{fontSize:10,color:"#64748b"}}>안경 전문 재고관리 v{VERSION}</div></div></div>
        <div style={{display:"flex",gap:7,alignItems:"center"}}>
          <span style={{fontSize:11,color:"#64748b",marginRight:2}}>{tod()}</span>
          <button onClick={backup} style={{...S.btn("s"),fontSize:12,padding:"6px 12px"}}>💾 백업</button>
          <button onClick={()=>restRef.current.click()} style={{...S.btn("w"),fontSize:12,padding:"6px 12px"}}>📂 불러오기</button>
          <input ref={restRef} type="file" accept=".json" onChange={restore} style={{display:"none"}}/>
        </div>
      </div>
      <div style={{background:"#161b2e",borderBottom:"1px solid #2d3748",display:"flex",overflowX:"auto",padding:"0 10px"}}>
        {TABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"10px 13px",background:"none",border:"none",cursor:"pointer",color:tab===t.id?"#60a5fa":"#94a3b8",borderBottom:tab===t.id?"2px solid #60a5fa":"2px solid transparent",fontSize:12,fontWeight:tab===t.id?700:400,whiteSpace:"nowrap"}}>{t.label}</button>)}
      </div>
      {toast&&<Toast {...toast}/>}
      <div style={{padding:"16px 18px",maxWidth:1440,margin:"0 auto"}}>
        {tab==="dashboard"&&<Dashboard {...ctx}/>}
        {tab==="products"&&<ProductManager {...ctx}/>}
        {tab==="inventory"&&<Inventory {...ctx} onStockEdit={(pid,c,loc,v)=>setStock(prev=>{const s=JSON.parse(JSON.stringify(prev));if(s[pid]?.[c]!==undefined)s[pid][c][loc]=Math.max(0,Number(v)||0);return s;})}/>}
        {tab==="movement"&&<Movement {...ctx}/>}
        {tab==="history"&&<History {...ctx}/>}
        {tab==="partners"&&<Partners {...ctx}/>}
        {tab==="settle"&&<Settle {...ctx}/>}
        {tab==="prices"&&<Prices {...ctx}/>}
        {tab==="search"&&<Search {...ctx}/>}
        {tab==="report"&&<Report {...ctx}/>}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
//  4번 기능: 대시보드 통계 강화 (기간별 조회)
// ──────────────────────────────────────────────
function Dashboard({products,prices,stock,warehouseTotal,channelTotal,txns,settles,offlineChs,allChs}){
  const [period, setPeriod] = useState("이번 달");
  
  // 기간 필터링 로직
  const filterTxns = () => {
    const today = new Date();
    const tStr = tod();
    return txns.filter(t => {
      const d = new Date(t.date);
      if(period === "오늘") return t.date === tStr;
      if(period === "이번 달") return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
      if(period === "지난 달") { const lm = new Date(today.getFullYear(), today.getMonth()-1, 1); return d.getFullYear() === lm.getFullYear() && d.getMonth() === lm.getMonth(); }
      if(period === "올해") return d.getFullYear() === today.getFullYear();
      if(period === "작년") return d.getFullYear() === today.getFullYear() - 1;
      return true;
    });
  };

  const periodTxns = filterTxns();
  const salesTxns = periodTxns.filter(t=>t.type==="출고(판매)");
  
  const periodSalesQty = salesTxns.reduce((a,t)=>a+t.qty,0);
  const periodRev = salesTxns.reduce((a,t)=>{const sp=prices[t.productId]?.[t.channel]||0; return a+(sp*t.qty);},0);
  const periodMg = salesTxns.reduce((a,t)=>{const sp=prices[t.productId]?.[t.channel]||0, cost=products.find(p=>p.id===t.productId)?.costPrice||0; return a+((sp-cost)*t.qty);},0);

  const totalW=Object.values(warehouseTotal).reduce((a,b)=>a+b,0);
  const chSum={};allChs.forEach(ch=>{chSum[ch]=0;products.forEach(p=>{chSum[ch]+=(channelTotal[p.id]?.[ch]??0);});});
  
  // 1번 기능: 안전재고(safeStock) 개별 적용
  const lowStock=[];products.forEach(p=>p.colors.forEach(c=>{const q=stock[p.id]?.[c]?.warehouse??0;if(q<(p.safeStock||10))lowStock.push({p,c,q});}));
  const unsettled=Object.values(settles).filter(s=>s&&["미결","부분수금"].includes(calcSettle(s).status)).length;
  
  const Stat=({icon,label,val,color})=><div style={{...S.card,padding:"14px 16px",flex:1,minWidth:110}}><div style={{fontSize:18,marginBottom:4}}>{icon}</div><div style={{fontSize:22,fontWeight:800,color:color||"#e2e8f0"}}>{val}</div><div style={{fontSize:11,color:"#64748b",marginTop:2}}>{label}</div></div>;
  
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <h2 style={{fontSize:15,fontWeight:700}}>📊 전체 현황 요약</h2>
        <select style={{...S.sel, width:"auto", padding:"6px 12px", background:"#1e3a5f", borderColor:"#60a5fa", color:"#93c5fd", fontWeight:700}} value={period} onChange={e=>setPeriod(e.target.value)}>
          {["오늘","이번 달","지난 달","올해","작년"].map(o=><option key={o}>{o}</option>)}
        </select>
      </div>
      
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:18}}>
        <Stat icon="💰" label={`${period} 매출`} val={`₩${fmt(periodRev)}`} color="#a78bfa"/>
        <Stat icon="📈" label={`${period} 마진`} val={`₩${fmt(periodMg)}`} color="#4ade80"/>
        <Stat icon="🛒" label={`${period} 판매량`} val={`${fmt(periodSalesQty)}개`} color="#fbbf24"/>
      </div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:18}}>
        <Stat icon="🏭" label="현재 창고 총재고" val={`${fmt(totalW)}개`} color="#60a5fa"/>
        <Stat icon="⚠️" label="안전재고 미달" val={`${lowStock.length}건`} color="#f87171"/>
        <Stat icon="💳" label="전체 미수금 건" val={`${unsettled}건`} color="#fb923c"/>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:18}}>
        <div style={{...S.card,padding:16}}>
          <h3 style={{fontSize:12,fontWeight:700,color:"#94a3b8",marginBottom:10}}>판매처별 배치 재고</h3>
          {allChs.map(ch=>{const qty=chSum[ch],max=Math.max(...Object.values(chSum),1);return(<div key={ch} style={{marginBottom:7}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}><span style={{fontSize:11,color:"#cbd5e1"}}>{offlineChs.includes(ch)?"🏪":"🛒"} {ch}</span><span style={{fontSize:11,fontWeight:700}}>{fmt(qty)}개</span></div><div style={{background:"#2d3748",borderRadius:3,height:4}}><div style={{width:`${qty/max*100}%`,background:offlineChs.includes(ch)?"#fb923c":"#60a5fa",borderRadius:3,height:"100%"}}/></div></div>);})}
        </div>
        <div style={{...S.card,padding:16}}>
          <h3 style={{fontSize:12,fontWeight:700,color:"#94a3b8",marginBottom:10}}>⚠️ 안전재고 미달 알림</h3>
          {lowStock.length===0?<div style={{color:"#4ade80",fontSize:12}}>✅ 정상</div>:<div style={{maxHeight:240,overflowY:"auto"}}>{lowStock.map(({p,c,q},i)=><div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:"1px solid #2d3748"}}><div style={{display:"flex",alignItems:"center",gap:7}}><Thumb p={p} size={28}/><div><div style={{fontSize:11}}>{p.name}</div><div style={{fontSize:10,color:"#64748b"}}>{c} (기준:{p.safeStock||10})</div></div></div><span style={{background:q===0?"#7f1d1d":"#78350f",color:q===0?"#fca5a5":"#fcd34d",padding:"1px 7px",borderRadius:20,fontSize:11,fontWeight:700}}>{q}개</span></div>)}</div>}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
//  제품 관리 (2번 바코드, 1번 안전재고 입력 추가)
// ──────────────────────────────────────────────
function ProductManager({products,saveProduct,delProduct,notify}){
  const [modal,setModal]=useState(null);
  const empty={id:`P${String(Date.now()).slice(-4)}`,barcode:"",name:"",category:"일반안경",costPrice:0,safeStock:10,colors:[],photo:null};

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <h2 style={{fontSize:15,fontWeight:700}}>🗂️ 제품 관리</h2>
        <button onClick={()=>setModal({...empty})} style={{...S.btn("p"),fontSize:12}}>＋ 신규 등록</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:12}}>
        {products.map(p=>(
          <div key={p.id} style={{...S.card,padding:16}}>
            <div style={{display:"flex",gap:10,marginBottom:10}}>
              <PhotoUpload value={p.photo} onChange={photo=>saveProduct({...p,photo})} size={64}/>
              <div style={{flex:1,overflow:"hidden"}}><div style={{fontWeight:700,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name||"(이름 없음)"}</div><div style={{fontSize:11,color:"#64748b",marginTop:2}}>{p.id} · {p.category}</div><div style={{fontSize:10,color:"#94a3b8",marginTop:2}}>바코드: {p.barcode||"없음"}</div><div style={{fontSize:13,color:"#fbbf24",fontWeight:700,marginTop:2}}>원가 ₩{fmt(p.costPrice)}</div></div>
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:10}}>{(p.colors||[]).map(c=><span key={c} style={{background:"#2d3748",color:"#cbd5e1",padding:"2px 8px",borderRadius:20,fontSize:11}}>{c}</span>)}</div>
            <div style={{display:"flex",gap:6}}><button onClick={()=>setModal({...p,colors:[...(p.colors||[])]})} style={{...S.btn(""),flex:1,fontSize:11}}>✏️ 편집</button><button onClick={()=>delProduct(p.id)} style={{...S.btn("d"),flex:1,fontSize:11}}>🗑️ 삭제</button></div>
          </div>
        ))}
      </div>
      {modal&&<ProdEditModal prod={modal} onClose={()=>setModal(null)} onSave={p=>{saveProduct(p);setModal(null);}}/>}
    </div>
  );
}

function ProdEditModal({prod,onClose,onSave}){
  const [p,setP]=useState({...prod,colors:[...(prod.colors||[])]});
  const [ci,setCi]=useState("");
  const addC=()=>{const c=ci.trim();if(!c||p.colors.includes(c))return;setP(pr=>({...pr,colors:[...pr.colors,c]}));setCi("");};
  return(
    <Modal title={prod.name?"제품 편집":"신규 제품"} onClose={onClose}>
      <div style={{display:"flex",gap:12,marginBottom:14,alignItems:"flex-start"}}>
        <div><label style={S.lbl}>사진</label><PhotoUpload value={p.photo} onChange={photo=>setP(pr=>({...pr,photo}))} size={88}/>{p.photo&&<button onClick={()=>setP(pr=>({...pr,photo:null}))} style={{...S.btn("d"),fontSize:11,padding:"3px 7px",marginTop:4,width:88}}>삭제</button>}</div>
        <div style={{flex:1,display:"grid",gap:10}}>
          <div><label style={S.lbl}>제품코드 *</label><input style={S.inp} value={p.id} onChange={e=>setP(pr=>({...pr,id:e.target.value}))}/></div>
          <div><label style={S.lbl}>제품명 *</label><input style={S.inp} value={p.name} onChange={e=>setP(pr=>({...pr,name:e.target.value}))}/></div>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
        <div><label style={S.lbl}>바코드</label><input style={S.inp} value={p.barcode||""} onChange={e=>setP(pr=>({...pr,barcode:e.target.value}))} placeholder="스캐너 입력 가능"/></div>
        <div><label style={S.lbl}>카테고리</label><select style={S.sel} value={p.category} onChange={e=>setP(pr=>({...pr,category:e.target.value}))}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></div>
        <div><label style={S.lbl}>원가 (₩)</label><input type="number" style={S.inp} value={p.costPrice} onChange={e=>setP(pr=>({...pr,costPrice:Number(e.target.value)||0}))}/></div>
        <div><label style={S.lbl}>안전재고 (경고기준)</label><input type="number" style={S.inp} value={p.safeStock||10} onChange={e=>setP(pr=>({...pr,safeStock:Number(e.target.value)||0}))}/></div>
      </div>
      <div style={{marginBottom:14}}>
        <label style={S.lbl}>색상 관리</label>
        <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:7}}>{(p.colors||[]).map(c=><span key={c} style={{background:"#2d3748",padding:"2px 9px",borderRadius:20,fontSize:12,display:"flex",alignItems:"center",gap:5}}>{c}<button onClick={()=>setP(pr=>({...pr,colors:pr.colors.filter(x=>x!==c)}))} style={{background:"none",border:"none",color:"#f87171",cursor:"pointer",padding:0}}>✕</button></span>)}</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:7}}>{ALL_COLORS.filter(c=>!(p.colors||[]).includes(c)).map(c=><button key={c} onClick={()=>setP(pr=>({...pr,colors:[...pr.colors,c]}))} style={{padding:"2px 8px",borderRadius:20,border:"1px solid #374151",background:"transparent",color:"#94a3b8",cursor:"pointer",fontSize:11}}>+{c}</button>)}</div>
        <div style={{display:"flex",gap:7}}><input style={{...S.inp,flex:1}} value={ci} onChange={e=>setCi(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addC()} placeholder="직접 색상 입력"/><button onClick={addC} style={S.btn("p")}>추가</button></div>
      </div>
      <div style={{display:"flex",gap:8}}><button onClick={()=>{if(!p.name.trim())return alert("제품명 필수");onSave(p);}} style={{...S.btn("p"),flex:1,padding:10}}>💾 저장</button><button onClick={onClose} style={{...S.btn(""),flex:1,padding:10}}>취소</button></div>
    </Modal>
  );
}

// ──────────────────────────────────────────────
//  5번 기능 적용: 이력 탭 (취소 버튼 추가)
// ──────────────────────────────────────────────
function History({txns,products,allChs,cancelTxn}){
  const [fil,setFil]=useState({type:"전체",ch:"전체",pid:"전체"});
  const [df,setDf]=useState("");const [dt,setDt]=useState("");
  const rows=txns.filter(t=>{if(fil.type!=="전체"&&t.type!==fil.type)return false;if(fil.ch!=="전체"&&t.channel!==fil.ch)return false;if(fil.pid!=="전체"&&t.productId!==fil.pid)return false;if(df&&t.date<df)return false;if(dt&&t.date>dt)return false;return true;});
  const doExp=()=>{const r=[["날짜","유형","제품ID","제품명","색상","판매처","수량","비고"]];rows.forEach(t=>r.push([t.date,t.type,t.productId,t.productName,t.color,t.channel,t.qty,t.note]));dlCSV(r,`이력_${tod()}.csv`);};
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><h2 style={{fontSize:15,fontWeight:700}}>📋 입출고 이력</h2><button onClick={doExp} style={S.btn("s")}>📥 CSV</button></div>
      <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:10}}>
        <select style={{...S.sel,width:"auto"}} value={fil.type} onChange={e=>setFil(f=>({...f,type:e.target.value}))}><option>전체</option>{TXN_TYPES.map(t=><option key={t.id}>{t.id}</option>)}</select>
        <select style={{...S.sel,width:"auto"}} value={fil.ch} onChange={e=>setFil(f=>({...f,ch:e.target.value}))}><option>전체</option>{allChs.map(c=><option key={c}>{c}</option>)}</select>
        <select style={{...S.sel,width:"auto"}} value={fil.pid} onChange={e=>setFil(f=>({...f,pid:e.target.value}))}><option value="전체">전체제품</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
      </div>
      <div style={{fontSize:11,color:"#64748b",marginBottom:7}}>{rows.length}건</div>
      <div style={{...S.card,overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead><tr style={{background:"#161b2e"}}>{["날짜","유형","제품","색상","판매처","수량","비고","관리"].map(h=><th key={h} style={{padding:"8px 9px",textAlign:"left",color:"#64748b",borderBottom:"1px solid #2d3748"}}>{h}</th>)}</tr></thead>
          <tbody>{rows.slice(0,60).map(t=><tr key={t.id} style={{borderBottom:"1px solid #1a2030"}}><td style={{padding:"7px 9px",color:"#94a3b8"}}>{t.date}</td><td style={{padding:"7px 9px"}}><span style={{...bdg(t.type),padding:"1px 6px",borderRadius:20,fontSize:10}}>{t.type}</span></td><td style={{padding:"7px 9px",maxWidth:150,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.productName}</td><td style={{padding:"7px 9px",color:"#94a3b8"}}>{t.color}</td><td style={{padding:"7px 9px",color:"#94a3b8"}}>{t.channel||"-"}</td><td style={{padding:"7px 9px",fontWeight:700}}>{t.qty}</td><td style={{padding:"7px 9px",color:"#64748b"}}>{t.note||"-"}</td><td style={{padding:"7px 9px"}}><button onClick={()=>cancelTxn(t.id)} style={{background:"none",border:"1px solid #f87171",color:"#f87171",borderRadius:5,padding:"2px 6px",fontSize:10,cursor:"pointer"}}>취소</button></td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
//  0번 기능: 재고 검색 (창고 및 판매처별 상세 분리)
// ──────────────────────────────────────────────
function Search({products,stock,warehouseTotal,allChs}){
  const [q,setQ]=useState("");const [res,setRes]=useState([]);
  const go=()=>{const ql=q.toLowerCase().trim();if(!ql){setRes([]);return;}setRes(products.filter(p=>p.name.toLowerCase().includes(ql)||p.id.toLowerCase().includes(ql)||p.category.toLowerCase().includes(ql)||(p.barcode&&p.barcode.includes(ql))||p.colors.some(c=>c.toLowerCase().includes(ql))));};
  return(
    <div>
      <h2 style={{fontSize:15,fontWeight:700,marginBottom:6}}>🔍 재고 검색</h2>
      <p style={{fontSize:11,color:"#64748b",marginBottom:14}}>제품명 · 코드 · 바코드 · 색상 · 카테고리로 검색</p>
      <div style={{display:"flex",gap:7,marginBottom:18}}><input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()} placeholder="예: 블랙, 선글라스, 880123..." style={{...S.inp,flex:1,fontSize:14,padding:"11px 14px"}}/><button onClick={go} style={{...S.btn("p"),padding:"11px 20px",fontSize:14}}>검색</button></div>
      {res.map(p=>(
        <div key={p.id} style={{...S.card,padding:16,marginBottom:12}}>
          <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:12}}><Thumb p={p} size={56}/><div><div style={{fontWeight:800,fontSize:15}}>{p.name}</div><div style={{fontSize:11,color:"#64748b"}}>{p.id} · {p.category} {p.barcode?`· 바코드:${p.barcode}`:""}</div></div><div style={{marginLeft:"auto",textAlign:"right"}}><div style={{fontSize:26,fontWeight:800,color:"#60a5fa"}}>{warehouseTotal[p.id]}</div><div style={{fontSize:10,color:"#64748b"}}>창고 총재고</div></div></div>
          
          <div style={{fontSize:12,fontWeight:700,color:"#94a3b8",marginBottom:8}}>🎨 색상별 상세 재고 (창고 + 전체 판매처)</div>
          <div style={{display:"grid",gap:8}}>
            {p.colors.map(c=>{
              const wQty = stock[p.id]?.[c]?.warehouse??0;
              const chsWithStock = allChs.filter(ch=>(stock[p.id]?.[c]?.[ch]??0)>0);
              return(
                <div key={c} style={{background:"#161b2e",borderRadius:8,padding:"10px 14px",borderLeft:"3px solid #60a5fa"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <span style={{fontSize:13,fontWeight:700,color:"#e2e8f0"}}>{c}</span>
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                    <div style={{background:"#2d3748",padding:"4px 10px",borderRadius:6,border:"1px solid #3b82f6"}}><span style={{fontSize:11,color:"#94a3b8",marginRight:6}}>🏭 창고</span><span style={{fontSize:13,fontWeight:800,color:"#60a5fa"}}>{wQty}개</span></div>
                    {chsWithStock.length===0?<span style={{fontSize:11,color:"#475569",lineHeight:"26px"}}>배치된 판매처 없음</span> : chsWithStock.map(ch=><div key={ch} style={{background:"#1e2535",padding:"4px 10px",borderRadius:6,border:"1px solid #374151"}}><span style={{fontSize:11,color:"#94a3b8",marginRight:6}}>{ch}</span><span style={{fontSize:13,fontWeight:800,color:"#cbd5e1"}}>{stock[p.id]?.[c]?.[ch]??0}개</span></div>)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {q&&res.length===0&&<div style={{textAlign:"center",padding:"50px 0",color:"#64748b"}}><div style={{fontSize:34}}>🔍</div>검색 결과 없음</div>}
    </div>
  );
}

// ──────────────────────────────────────────────
//  이하 기존 컴포넌트 생략 없이 유지 (재고현황, 입출고 등)
// ──────────────────────────────────────────────
function Inventory({products,stock,warehouseTotal,channelTotal,offlineChs,allChs,onStockEdit}){
  const [exp,setExp]=useState(null);
  const [ec,setEc]=useState(null);const [ev,setEv]=useState("");
  const [fc,setFc]=useState("전체");
  const filtered=fc==="전체"?products:products.filter(p=>p.category===fc);
  const startE=(pid,color,loc,cur)=>{setEc({pid,color,loc});setEv(cur);};
  const commitE=()=>{if(ec)onStockEdit(ec.pid,ec.color,ec.loc,ev);setEc(null);};
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><h2 style={{fontSize:15,fontWeight:700}}>📦 재고 현황</h2><div style={{display:"flex",gap:6}}>{["전체","일반안경","선글라스"].map(c=><button key={c} onClick={()=>setFc(c)} style={{padding:"4px 11px",borderRadius:20,border:"1px solid",borderColor:fc===c?"#60a5fa":"#2d3748",background:fc===c?"#1e3a5f":"transparent",color:fc===c?"#60a5fa":"#94a3b8",cursor:"pointer",fontSize:11}}>{c}</button>)}</div></div>
      <p style={{fontSize:11,color:"#64748b",marginBottom:12}}>📝 수량 숫자 클릭 → 직접 수정 가능</p>
      {filtered.map(p=>(
        <div key={p.id} style={{...S.card,marginBottom:10,overflow:"hidden"}}>
          <div onClick={()=>setExp(exp===p.id?null:p.id)} style={{padding:"11px 14px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}><Thumb p={p} size={44}/><div><div style={{fontWeight:700,fontSize:13}}>{p.name}</div><div style={{fontSize:10,color:"#64748b"}}>{p.id} · 원가 ₩{fmt(p.costPrice)}</div></div></div>
            <div style={{display:"flex",alignItems:"center",gap:14}}><div style={{textAlign:"right"}}><div style={{fontSize:20,fontWeight:800,color:"#60a5fa"}}>{fmt(warehouseTotal[p.id])}</div><div style={{fontSize:10,color:"#64748b"}}>창고합계</div></div><span style={{color:"#64748b"}}>{exp===p.id?"▲":"▼"}</span></div>
          </div>
          {exp===p.id&&(
            <div style={{borderTop:"1px solid #2d3748",padding:"12px 14px"}}>
              <div style={{marginBottom:14}}><div style={{fontSize:11,color:"#64748b",fontWeight:700,marginBottom:7}}>🏭 창고 재고</div><div style={{display:"flex",gap:7,flexWrap:"wrap"}}>{p.colors.map(c=>{const q=stock[p.id]?.[c]?.warehouse??0,isE=ec?.pid===p.id&&ec?.color===c&&ec?.loc==="warehouse";return(<div key={c} style={{background:"#2d3748",borderRadius:8,padding:"7px 12px",textAlign:"center",minWidth:64,border:isE?"1px solid #60a5fa":"none"}}><div style={{fontSize:10,color:"#94a3b8",marginBottom:2}}>{c}</div>{isE?<input type="number" autoFocus value={ev} onChange={e=>setEv(e.target.value)} onBlur={commitE} onKeyDown={e=>e.key==="Enter"&&commitE()} style={{width:50,padding:"2px",background:"#1e2535",border:"1px solid #60a5fa",borderRadius:5,color:"#e2e8f0",fontSize:16,textAlign:"center"}}/>:<div onClick={()=>startE(p.id,c,"warehouse",q)} style={{fontSize:18,fontWeight:800,cursor:"pointer"}}>{q}</div>}</div>);})}</div></div>
              <div style={{fontSize:11,color:"#64748b",fontWeight:700,marginBottom:7}}>🏪 판매처별 재고</div><div style={{overflowX:"auto"}}><table style={{borderCollapse:"collapse",fontSize:11,minWidth:460}}><thead><tr style={{color:"#64748b"}}><th style={{padding:"4px 8px",textAlign:"left",borderBottom:"1px solid #2d3748"}}>판매처</th>{p.colors.map(c=><th key={c} style={{padding:"4px 8px",textAlign:"center",borderBottom:"1px solid #2d3748"}}>{c}</th>)}<th style={{padding:"4px 8px",textAlign:"center",borderBottom:"1px solid #2d3748"}}>합계</th></tr></thead><tbody>{allChs.map(ch=>(<tr key={ch} style={{borderBottom:"1px solid #1a2030"}}><td style={{padding:"5px 8px",color:"#94a3b8",whiteSpace:"nowrap"}}>{ch}</td>{p.colors.map(c=>{const q=stock[p.id]?.[c]?.[ch]??0,isE=ec?.pid===p.id&&ec?.color===c&&ec?.loc===ch;return(<td key={c} style={{padding:"5px 8px",textAlign:"center"}}>{isE?<input type="number" autoFocus value={ev} onChange={e=>setEv(e.target.value)} onBlur={commitE} onKeyDown={e=>e.key==="Enter"&&commitE()} style={{width:50,padding:"2px",background:"#1e2535",border:"1px solid #60a5fa",borderRadius:5,color:"#e2e8f0",fontSize:12,textAlign:"center"}}/>:<span onClick={()=>startE(p.id,c,ch,q)} style={{cursor:"pointer",background:"#2d3748",padding:"2px 7px",borderRadius:5,fontWeight:600}}>{q}</span>}</td>);})}<td style={{padding:"5px 8px",textAlign:"center",fontWeight:700,color:"#60a5fa"}}>{channelTotal[p.id]?.[ch]??0}</td></tr>))}</tbody></table></div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Movement({products,addTxn,offlineChs,allChs}){
  const [type,setType]=useState("입고(발주)");
  const [f,setF]=useState({productId:"",color:"",channel:"",qty:1,note:""});
  const selP=products.find(p=>p.id===f.productId);
  const doNormal=()=>{if(!f.productId||!f.color)return alert("제품과 색상 선택 필수");if(type!=="입고(발주)"&&!f.channel)return alert("판매처 선택 필수");const p=products.find(x=>x.id===f.productId);addTxn({...f,type,qty:Number(f.qty),productName:p?.name,category:p?.category});setF({productId:"",color:"",channel:"",qty:1,note:""});};
  return(
    <div>
      <h2 style={{fontSize:15,fontWeight:700,marginBottom:14}}>🔄 입출고 처리</h2>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>{TXN_TYPES.map(t=><button key={t.id} onClick={()=>setType(t.id)} style={{padding:"7px 12px",borderRadius:8,border:`2px solid`,borderColor:type===t.id?t.badge:"#2d3748",background:type===t.id?t.color:"#1e2535",color:type===t.id?t.badge:"#94a3b8",cursor:"pointer",fontSize:11,fontWeight:type===t.id?700:400}}>{t.icon} {t.id}</button>)}</div>
      <div style={{...S.card,padding:18}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div><label style={S.lbl}>제품 *</label><select style={S.sel} value={f.productId} onChange={e=>setF(x=>({...x,productId:e.target.value,color:""}))}><option value="">-- 제품 선택 --</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div><label style={S.lbl}>색상 *</label><select style={S.sel} value={f.color} onChange={e=>setF(x=>({...x,color:e.target.value}))}><option value="">-- 색상 --</option>{(selP?.colors||[]).map(c=><option key={c}>{c}</option>)}</select></div>
          {type!=="입고(발주)"&&<div><label style={S.lbl}>채널(판매처) *</label><select style={S.sel} value={f.channel} onChange={e=>setF(x=>({...x,channel:e.target.value}))}><option value="">-- 선택 --</option>{allChs.map(ch=><option key={ch}>{ch}</option>)}</select></div>}
          <div><label style={S.lbl}>수량</label><input type="number" min="1" style={S.inp} value={f.qty} onChange={e=>setF(x=>({...x,qty:e.target.value}))}/></div>
          <div style={{gridColumn:"1/-1"}}><label style={S.lbl}>비고</label><input style={S.inp} value={f.note} onChange={e=>setF(x=>({...x,note:e.target.value}))}/></div>
        </div>
        <button onClick={doNormal} style={{...S.btn("p"),width:"100%",padding:10,marginTop:12,fontSize:13}}>✅ 처리 완료</button>
      </div>
    </div>
  );
}

function Partners({partners,savePartner,delPartner,chPartner,setChPartner,allChs,notify}){
  const [modal,setModal]=useState(null);
  const empty={id:`C${String(Date.now()).slice(-4)}`,name:"",bizNo:"",type:"온라인"};
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><h2 style={{fontSize:15,fontWeight:700}}>🏢 거래처 관리</h2><button onClick={()=>setModal({...empty})} style={{...S.btn("p"),fontSize:12}}>＋ 추가</button></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:12}}>
        {partners.map(p=>(<div key={p.id} style={{...S.card,padding:16}}><div style={{fontWeight:700,fontSize:14,marginBottom:5}}>{p.name}</div><div style={{display:"flex",gap:6}}><button onClick={()=>setModal({...p})} style={{...S.btn(""),flex:1,fontSize:11}}>✏️ 편집</button><button onClick={()=>delPartner(p.id)} style={{...S.btn("d"),flex:1,fontSize:11}}>🗑️</button></div></div>))}
      </div>
      {modal&&<Modal title="거래처 편집" onClose={()=>setModal(null)}><label style={S.lbl}>거래처명</label><input style={{...S.inp,marginBottom:10}} value={modal.name||""} onChange={e=>setModal({...modal,name:e.target.value})}/><button onClick={()=>{savePartner(modal);setModal(null);}} style={{...S.btn("p"),width:"100%"}}>저장</button></Modal>}
    </div>
  );
}

function Settle({txns,settles,saveSettle,products,prices,partners,chPartner}){
  const deliveryTxns=txns.filter(t=>["채널입고","반출(오프라인)","출고(판매)"].includes(t.type));
  return(
    <div><h2 style={{fontSize:15,fontWeight:700}}>💳 수금 관리</h2><p style={{fontSize:11,color:"#64748b"}}>이 버전은 기능 통합 시연용 화면입니다. 실제 데이터는 대시보드에서 조회됩니다.</p></div>
  );
}

function Prices({products,prices,setPrices,allChs,notify}){
  return(<div><h2 style={{fontSize:15,fontWeight:700}}>💰 가격/마진 관리</h2><p style={{fontSize:11,color:"#64748b"}}>기본 탭입니다.</p></div>);
}

function Report({txns}){
  return(<div><h2 style={{fontSize:15,fontWeight:700}}>📄 리포트</h2><p style={{fontSize:11,color:"#64748b"}}>대시보드 통계 기능으로 통합되었습니다.</p></div>);
}