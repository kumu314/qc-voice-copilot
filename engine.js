/* ═══════════════════════════════════════════════════════════════
   边测边报 · 共享引擎（手机端与大屏共用）
   ───────────────────────────────────────────────────────────────
   · 事件溯源：所有操作都是一条命令（utt / assign / dispose …），
     两个页面收到同一串命令、执行同一套确定性逻辑，状态天然一致。
   · 传输：同一浏览器用 BroadcastChannel；用 server.mjs 打开时走 SSE，
     真手机和投影电脑可以跨设备联动。
   · 检验项、公差、配置值全部【占位】——拿到卫华脱敏检验表后改 ITEMS / TERMS。
   · 接真实语音识别：QCE.send({t:'utt', text:'旁弯左边一二五', dur:2.1})
   ═══════════════════════════════════════════════════════════════ */
(function(){
"use strict";

/* ─────────── 1. 业务数据（占位） ─────────── */
const ITEMS = [
  {id:'S1', g:'桥架', name:'跨度', pos:'左', unit:'mm', kind:'tol', nom:22500, tol:3.2, std:'22500 ± 3.2', pl:[15000,30000], src:'占位：GB/T 14405 ±[2+0.1(S−10)]，S = 22.5 m'},
  {id:'S2', g:'桥架', name:'跨度', pos:'右', unit:'mm', kind:'tol', nom:22500, tol:3.2, std:'22500 ± 3.2', pl:[15000,30000], src:'占位：GB/T 14405 ±[2+0.1(S−10)]，S = 22.5 m'},
  {id:'dS', g:'桥架', name:'跨度相对差', unit:'mm', kind:'derived', from:['S1','S2'], max:5, std:'|S1−S2| ≤ 5', src:'占位：GB/T 14405'},
  {id:'F1', g:'桥架', name:'主梁上拱度', pos:'左', unit:'mm', kind:'range', min:20.3, max:31.5, std:'20.3 ~ 31.5', pl:[0,80], src:'占位：(0.9 ~ 1.4) S / 1000'},
  {id:'F2', g:'桥架', name:'主梁上拱度', pos:'右', unit:'mm', kind:'range', min:20.3, max:31.5, std:'20.3 ~ 31.5', pl:[0,80], src:'占位：(0.9 ~ 1.4) S / 1000'},
  {id:'f1', g:'桥架', name:'主梁旁弯', pos:'左', unit:'mm', kind:'max', max:11.2, std:'≤ 11.2', pl:[0,60], src:'占位：≤ S / 2000'},
  {id:'f2', g:'桥架', name:'主梁旁弯', pos:'右', unit:'mm', kind:'max', max:11.2, std:'≤ 11.2', pl:[0,60], src:'占位：≤ S / 2000'},
  {id:'D1', g:'桥架', name:'对角线', pos:'一', unit:'mm', kind:'record', std:'记录值', pl:[15000,30000], src:'用于计算对角线差'},
  {id:'D2', g:'桥架', name:'对角线', pos:'二', unit:'mm', kind:'record', std:'记录值', pl:[15000,30000], src:'用于计算对角线差'},
  {id:'dD', g:'桥架', name:'对角线差', unit:'mm', kind:'derived', from:['D1','D2'], max:5, std:'|D1−D2| ≤ 5', src:'跨项一致性：报数须与两条对角线计算值一致', pl:[0,100]},
  {id:'k',  g:'小车', name:'小车轨距', unit:'mm', kind:'tol', nom:2500, tol:2, std:'2500 ± 2', pl:[1000,5000], src:'占位：小车轨距偏差'},
  {id:'h',  g:'小车', name:'小车轨道高低差', unit:'mm', kind:'max', max:3, std:'≤ 3', pl:[0,30], src:'占位：同一截面高低差'},
  {id:'i',  g:'传动', name:'减速器速比', unit:'', kind:'eq', eq:40.17, std:'= 40.17', pl:[5,200], src:'配置表 WH-26-0815-BOM 第 12 行', hold:true, team:'装配二班'},
  {id:'paint', g:'涂装', name:'漆膜厚度', unit:'μm', kind:'min', min:150, std:'≥ 150', pl:[20,600], src:'技术协议 §4.3 非标要求（标准件为 ≥ 120）', hold:true, nonstd:true, team:'涂装班'},
  {id:'defl', g:'载荷', name:'额定载荷静挠度', unit:'mm', kind:'max', max:28.1, std:'≤ 28.1', pl:[0,100], src:'占位：≤ S / 800', minGap:120},
];
const IT = Object.fromEntries(ITEMS.map(x=>[x.id,x]));
const MEASURABLE = ITEMS.filter(x=>x.kind!=='derived');

const TERMS = [
  {k:'span',   aliases:['跨度'], posType:'LR', map:{L:'S1',R:'S2'}},
  {k:'camber', aliases:['主梁上拱度','上拱度','上拱','拱度'], posType:'LR', map:{L:'F1',R:'F2'}},
  {k:'sweep',  aliases:['主梁旁弯','旁弯度','旁弯'], posType:'LR', map:{L:'f1',R:'f2'}},
  {k:'ddiff',  aliases:['对角线差','对角差'], item:'dD'},
  {k:'diag',   aliases:['对角线'], posType:'12', map:{'1':'D1','2':'D2'}},
  {k:'gauge',  aliases:['小车轨距','轨距'], item:'k'},
  {k:'height', aliases:['小车轨道高低差','轨道高低差','高低差'], item:'h'},
  {k:'ratio',  aliases:['减速器速比','减速机速比','传动比','速比'], item:'i'},
  {k:'paint',  aliases:['漆膜厚度','漆膜','膜厚'], item:'paint'},
  {k:'defl',   aliases:['额定载荷静挠度','静载挠度','静挠度','挠度'], item:'defl'},
];
const ALIASES = TERMS.flatMap(t=>t.aliases.map(a=>({a,t}))).sort((x,y)=>y.a.length-x.a.length);

/* 迷你拼音表（检验术语用字 + 常见误识别字；正式版换 pypinyin） */
const PY = {};
"kua:跨夸垮挎|du:度渡都读肚杜督毒|xiang:相向想象项|dui:对队兑|cha:差查茶叉插|zhu:主注朱住柱猪诸|liang:梁两量亮凉粮良|shang:上尚伤商赏|gong:拱公工功攻共供宫弓|pang:旁胖庞|wan:弯湾晚碗完玩|wang:网王往望旺|jiao:角交脚教较叫|xian:线先鲜现县显|xiao:小晓笑效|che:车撤|gui:轨鬼贵柜归规|ju:距剧局居句举巨具|dao:道到刀倒导|gao:高搞告稿|di:低第地底滴弟|jian:减见间件检建|su:速苏素诉俗|shu:数书叔树输熟|qi:器漆起气其期汽|ji:机记级积|bi:比必笔币壁|mo:膜摸磨模末莫|hou:厚后候|jing:静敬京经精竟|jin:进金近今紧|nao:挠闹脑恼|lao:老劳捞|rao:绕扰饶|chuan:传船穿|dong:动东懂冻|zai:载在再|e:额饿鹅|ding:定订顶丁|he:荷合和河|tu:途图|bang:棒帮"
  .split('|').forEach(s=>{const [p,cs]=s.split(':');for(const c of cs) PY[c]=p;});
const FUZZ = [[/^zh/,'z','平翘舌'],[/^ch/,'c','平翘舌'],[/^sh/,'s','平翘舌'],[/^n/,'l','鼻边音'],[/ang$/,'an','前后鼻音'],[/eng$/,'en','前后鼻音'],[/ing$/,'in','前后鼻音']];
const normPy = p => FUZZ.reduce((s,[re,to])=>s.replace(re,to),p);
function pyNote(a,b){ if(a===b) return '同音'; const n=[]; for(const [re,,lab] of FUZZ){ if(re.test(a)!==re.test(b)) n.push(lab);} return `${a}≈${b}`+(n.length?' '+[...new Set(n)].join('/'):''); }

const SIM_T0 = new Date(2026,10,10,14,20,0).getTime();

/* ─────────── 2. 状态 ─────────── */
let S;
function freshState(){
  return {
    clock: SIM_T0, cursor:0, evSeq:0, qSeq:0,
    items: Object.fromEntries(ITEMS.map(x=>[x.id,{v:null,status:'pending',hist:[],ev:null,reported:null,_lastRep:null,calc:undefined}])),
    events:[], corrLog:[], queue:[], closed:[], tickets:[], feishu:[], net:true, offline:[],
    table:[
      {from:'绕度', to:'挠度', type:'口音', src:'人工复核 · 11/10 自动生成', hit:0, st:'已确认'},
      {from:'双比', to:'速比', type:'口音', src:'手动录入', hit:0, st:'已确认'},
      {from:'K距',  to:'轨距', type:'识别', src:'手动录入', hit:0, st:'已确认'},
      {from:'起膜', to:'漆膜', type:'口音', src:'手动录入', hit:0, st:'已确认'},
    ],
    report:{state:'none'}, lastMeasureT:null,
    stats:{utt:0, py:0, tb:0, intercept:0, readback:0, amend:0, cred:0},
  };
}
S = freshState();

/* ─────────── 3. 识别管线 ─────────── */
const D = {零:0,〇:0,一:1,幺:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
function cnInt(s){
  if(/^[0-9]+$/.test(s)) return {v:+s};
  if(!/[十百千万]/.test(s)) return {digits:[...s].map(c=>D[c]).join('')};
  let total=0, sec=0, num=0;
  for(const c of s){
    if(c in D) num=D[c];
    else if(c==='十'){ sec+=(num||1)*10; num=0; }
    else if(c==='百'){ sec+=num*100; num=0; }
    else if(c==='千'){ sec+=num*1000; num=0; }
    else if(c==='万'){ total+=(sec+num)*10000; sec=0; num=0; }
  }
  return {v:total+sec+num};
}
function cnNum(tok){
  tok = tok.replace(/[.．]/g,'点');
  const [ip, fp] = tok.split('点');
  const I = ip ? cnInt(ip) : {v:0};
  if(fp!==undefined){
    const fd = /^[0-9]+$/.test(fp) ? fp : [...fp].map(c=>D[c]).join('');
    const base = I.v!==undefined ? I.v : +I.digits;
    return {v: parseFloat(base+'.'+fd)};
  }
  if(I.v!==undefined) return {v:I.v};
  const ds = I.digits;
  if(ds.length<2) return {v:+ds};
  const cands=[{v:+ds, kind:'int'}];
  for(let k=1;k<ds.length;k++) cands.push({v:parseFloat(ds.slice(0,k)+'.'+ds.slice(k)), kind:(ds.length-k)===1?'d1':'dx'});
  return {digits:ds, cands};
}
const NUMRE = /[0-9零〇一二两三四五六七八九十百千万点幺.]+/g;
const DIGIT = /[0-9零〇一二两三四五六七八九十幺]/;
const UNITRE = /^(毫米|mm|公分|厘米|微米|丝|米)/;
const UNITSCALE = {毫米:1,mm:1,公分:10,厘米:10,丝:0.01,米:1000,微米:1};

function matchTerm(text){
  for(const {a,t} of ALIASES){ const i=text.indexOf(a); if(i>=0) return {t,a,i,len:a.length,layer:null}; }
  const ch=[...text], py=ch.map(c=>PY[c]||null);
  for(const {a,t} of ALIASES){
    if(a.length<2) continue;
    const ap=[...a].map(c=>PY[c]);
    if(ap.some(x=>!x)) continue;
    for(let i=0;i+ap.length<=ch.length;i++){
      let ok=true, notes=[];
      for(let j=0;j<ap.length;j++){
        const p=py[i+j]; if(!p||normPy(p)!==normPy(ap[j])){ok=false;break;}
        if(ch[i+j]!==a[j]) notes.push(`${ch[i+j]}→${a[j]}（${pyNote(p,ap[j])}）`);
      }
      if(ok){ const seg=ch.slice(i,i+ap.length).join(''); return {t,a,i,len:ap.length,layer:'py',from:seg,to:a,note:notes.join('；')}; }
    }
  }
  return null;
}

function analyze(raw, opt={}){
  const R = {raw, corrected:raw, corr:[], cmd:null, term:null, itemId:null, pos:null, value:null, unit:null, amend:null, retest:false, ambig:null, err:null, unitNote:null};
  let text = raw.replace(/\s+/g,'');
  if(/检验完毕|检完了|全部测完|检验结束|测完了/.test(text)){ R.cmd='finish'; return R; }
  let m = null;
  if(opt.forceItem){
    m = {forced:true};
    R.itemId = opt.forceItem;
    if(opt.fromSeg){ R.corr.push({from:opt.fromSeg,to:IT[opt.forceItem].name,layer:'human',note:'主管人工复核指定'}); text=text.replace(opt.fromSeg,''); }
  } else {
    m = matchTerm(text);
    if(!m){
      for(const e of S.table){
        if(e.st!=='已确认') continue;
        if(text.includes(e.from)){
          const t2=text.split(e.from).join(e.to);
          const m2=matchTerm(t2);
          if(m2 && !m2.layer){ e.hit++; R.corr.push({from:e.from,to:e.to,layer:'tb',note:`纠错表 ${e.from}→${e.to}（${e.src}）`}); text=t2; m=m2; break; }
        }
      }
    } else if(m.layer==='py'){
      R.corr.push({from:m.from,to:m.to,layer:'py',note:m.note});
      text = text.slice(0,m.i)+m.to+text.slice(m.i+m.len);
    }
    R.corrected = text;
    if(!m){ R.err='unknown'; R.unknownSeg=(text.match(/^[^0-9零〇一二两三四五六七八九十百千万点幺，,。左右]+/)||[''])[0]; return R; }
    R.term = m.t;
  }
  let rest = m.forced ? text : text.slice(0,m.i)+'§'+text.slice(m.i+m.len);
  const t = m.forced ? null : m.t;
  if(t && t.posType==='LR'){
    const pm = rest.match(/左|右/);
    if(!pm){ R.err='nopos'; return R; }
    R.pos = pm[0]==='左'?'L':'R'; R.itemId = t.map[R.pos];
  } else if(t && t.posType==='12'){
    const pm = rest.match(/§[，,\s]*(号)?(一|1|幺|二|2|两)/);
    if(!pm){ R.err='nopos'; return R; }
    R.pos = /一|1|幺/.test(pm[2])?'1':'2'; R.itemId = t.map[R.pos];
    rest = rest.replace(pm[0],'§');
  } else if(t){ R.itemId = t.item; }
  rest = rest.replace(/左边|右边|左侧|右侧|左|右/g,' ');
  if(/复测|重测|再测/.test(rest)){ R.retest=true; rest=rest.replace(/复测|重测|再测/g,' '); }
  const am = [...rest.matchAll(/不对|说错了|更正|重说|应该是/g)];
  let seg = rest;
  if(am.length){
    const last = am[am.length-1];
    const before = rest.slice(0,last.index);
    const bt = (before.match(NUMRE)||[]).filter(x=>DIGIT.test(x)).pop();
    if(bt){ const b=cnNum(bt); R.amend={from: b.v!==undefined?b.v:(b.cands?b.cands[0].v:null), word:last[0]}; }
    seg = rest.slice(last.index+last[0].length);
  }
  const toks = [...seg.matchAll(NUMRE)].filter(x=>DIGIT.test(x[0]));
  if(!toks.length){ R.err='novalue'; return R; }
  const tk = toks[toks.length-1];
  const um = seg.slice(tk.index+tk[0].length).match(UNITRE);
  R.unit = um?um[0]:null;
  const item = IT[R.itemId];
  const scale = (R.unit && item.unit==='mm') ? UNITSCALE[R.unit] : 1;
  const n = cnNum(tk[0]);
  const plaus = v => !item.pl || (v>=item.pl[0] && v<=item.pl[1]);
  if(n.v!==undefined){
    let v = +(n.v*scale).toFixed(3);
    if(R.unit && scale!==1) R.unitNote = `「${tk[0]}${R.unit}」换算为 ${fmt(v)} mm`;
    if(!plaus(v) && !R.unit && item.unit==='mm'){
      for(const [u,sc] of [['米',1000],['公分',10]]){ const v2=+(n.v*sc).toFixed(3); if(plaus(v2)){ R.unitNote=`未说单位，按「${u}」换算为 ${fmt(v2)} mm`; v=v2; R.ambig={word:tk[0], chosen:v2, reason:'单位推断'}; break; } }
    }
    if(!plaus(v)){ R.err='implausible'; R.value=v; return R; }
    R.value = v;
  } else {
    const ok = n.cands.map(c=>({...c, v:+(c.v*scale).toFixed(3)})).filter(c=>plaus(c.v));
    if(!ok.length){ R.err='implausible'; R.value=+n.digits; return R; }
    const rank = {d1:0,int:1,dx:2};
    ok.sort((a,b)=>rank[a.kind]-rank[b.kind]);
    R.value = ok[0].v;
    R.ambig = {word:tk[0], chosen:ok[0].v, excluded:n.cands.filter(c=>!plaus(c.v*scale)).map(c=>fmt(c.v)), reason:'逐位读数'};
  }
  return R;
}

/* ─────────── 4. 规则引擎（确定性） ─────────── */
function judge(item, v){
  switch(item.kind){
    case 'tol':   { const d=+(v-item.nom).toFixed(3), ok=Math.abs(d)<=item.tol; return {ok, calc:`偏差 ${d>=0?'+':''}${fmt(d)}　允许 ±${item.tol}`, lim:`±${item.tol}`}; }
    case 'range': return {ok:v>=item.min&&v<=item.max, calc:`${item.min} ≤ ${fmt(v)} ≤ ${item.max}`, lim:`${item.min}~${item.max}`};
    case 'max':   return {ok:v<=item.max, calc:`${fmt(v)} ${v<=item.max?'≤':'>'} ${item.max}`, lim:`${item.max}`};
    case 'min':   return {ok:v>=item.min, calc:`${fmt(v)} ${v>=item.min?'≥':'<'} ${item.min}`, lim:`${item.min}`};
    case 'eq':    return {ok:Math.abs(v-item.eq)<0.005, calc:`${fmt(v)} ${Math.abs(v-item.eq)<0.005?'=':'≠'} ${item.eq}`, lim:`${item.eq}`};
    default:      return {ok:true, calc:'记录值', lim:''};
  }
}
const BLOCK = new Set(['pending','retest','mismatch','hold']);
const ST = {
  pending:['待检','dim'], ok:['合格','ok'], retest:['超差 · 待复测','ng'], retest_ok:['复测合格','ok'],
  mismatch:['不一致 · 待复核','warn'], hold:['不合格 · 待处置','ng'], rectify:['已转整改','fix'], concede:['让步接收','warn'], recorded:['已记录','ok']
};
const label = it => it.pos ? (/[左右]/.test(it.pos)?`${it.pos}侧${it.name}`:`${it.name}${it.pos}`) : it.name;
const ucn = u => u==='mm'?'毫米':u==='μm'?'微米':'';
function fmt(v){ if(v==null) return '—'; return (Math.round(v*1000)/1000).toString(); }
const hhmm = t => new Date(t).toTimeString().slice(0,8);
const now = () => hhmm(S.clock);

function setStatus(id, st, why){
  const r=S.items[id], prev=r.status;
  r.status=st;
  if(BLOCK.has(prev) && prev!=='pending' && !BLOCK.has(st)){
    S.closed.unshift({t:now(), text:`${label(IT[id])}　${ST[prev][0]} → ${ST[st][0]}`+(why?`（${why}）`:'')});
    S.queue = S.queue.filter(q=>q.item!==id);
  }
  if(BLOCK.has(st) && st!=='pending'){
    S.queue = S.queue.filter(q=>q.item!==id);
    S.queue.unshift({id:'Q'+(++S.qSeq), item:id, type:st, t:now(), ev:r.ev});
  }
}
function recomputeDerived(){
  const notes=[];
  for(const it of ITEMS.filter(x=>x.kind==='derived')){
    const [a,b]=it.from.map(i=>S.items[i].v), r=S.items[it.id];
    if(a==null||b==null) continue;
    const c=+Math.abs(a-b).toFixed(3), changed = r.calc!==c; r.calc=c; r.v=c;
    if(!changed && r.status!=='pending' && r.reported===r._lastRep) continue;
    r._lastRep=r.reported;
    const prev=r.status;
    let st, msg;
    if(r.reported!=null && Math.abs(r.reported-c)>1){ st='mismatch'; msg=`${it.name}报数 ${fmt(r.reported)} 与计算值 ${fmt(c)} 不一致`; }
    else if(c>it.max){ st='retest'; msg=`自动计算${it.name} ${fmt(c)} 毫米，超出允许值 ${it.max}，请复测${it.id==='dD'?'对角线':'跨度'}`; }
    else { st = (prev==='pending'||prev==='ok') ? 'ok' : 'retest_ok'; msg=`自动计算${it.name} ${fmt(c)} 毫米，合格`; }
    r.hist.push({t:now(), v:c, note:'自动计算'});
    if(st!==prev || st!=='ok') setStatus(it.id, st, st==='retest_ok'?'按复测值自动重算':null);
    notes.push({id:it.id, st, msg});
  }
  return notes;
}
function finishCred(out, ev, it, gap){
  ev.cred = [];
  const rate = ev.raw.length / ev.dur;
  ev.cred.push(rate>9 ? {ok:false, t:`语速 ${rate.toFixed(1)} 字/秒，录音过短`} : {ok:true, t:`录音 ${ev.dur.toFixed(1)} 秒，语速正常`});
  if(it.minGap && gap!=null && gap<it.minGap) ev.cred.push({ok:false, t:`${it.name}需先完成加载试验，距上一项仅 ${Math.round(gap)} 秒`});
  else if(gap!=null) ev.cred.push({ok:true, t:`距上一项 ${Math.round(gap)} 秒，节奏合理`});
  const vals = MEASURABLE.filter(x=>x.nom!=null && S.items[x.id].v!=null);
  const tidy = vals.length>=3 && vals.every(x=>S.items[x.id].v===x.nom);
  ev.cred.push(tidy ? {ok:false, t:'多项实测值恰好等于名义值，数据过于整齐'} : {ok:true, t:'数据分布自然'});
  const bad = ev.cred.filter(c=>!c.ok);
  if(bad.length){ S.stats.cred++; S.queue.unshift({id:'Q'+(++S.qSeq), type:'cred', ev:ev.id, item:it.id, text:bad.map(b=>b.t).join('；'), t:now()}); }
  return out;
}
function suggest(seg){
  if(!seg) return [];
  const sp=[...seg].map(c=>PY[c]||'');
  return ALIASES.filter(x=>x.a.length===seg.length).map(({a,t})=>{
    const ap=[...a].map(c=>PY[c]||'');
    return {a, t, s: ap.reduce((n,p,i)=>n+(p&&normPy(p)===normPy(sp[i]||'')?1:0),0)/a.length};
  }).filter(x=>x.s>0).sort((x,y)=>y.s-x.s).slice(0,3);
}

/* 把分析结果落到状态上 → {cls, verdict, calc, src, readback, alert, title, big, unit} */
function apply(A, ev){
  const out = {cls:'dim', verdict:'—', calc:'', src:'', readback:'', alert:null, title:'—', big:'—', unit:''};
  if(A.cmd==='finish'){
    const miss = MEASURABLE.filter(x=>S.items[x.id].status==='pending');
    const open = ITEMS.filter(x=>BLOCK.has(S.items[x.id].status) && S.items[x.id].status!=='pending');
    S.queue = S.queue.filter(q=>q.type!=='missing');
    if(miss.length){ S.queue.unshift({id:'Q'+(++S.qSeq), type:'missing', items:miss.map(x=>x.id), t:now()}); S.stats.intercept++; }
    Object.assign(out, {cls: miss.length||open.length ? 'ng':'ok', verdict: miss.length ? `漏测 ${miss.length} 项` : (open.length?`${open.length} 项待处理`:'全部完成'),
      calc: miss.map(x=>label(x)).join('、') || '无漏测', src:'离开工位前自动核对检验表', title:'检验完毕', big: miss.length?String(miss.length):'✓', unit: miss.length?'项未测':''});
    out.readback = miss.length ? `还有 ${miss.length} 项没测：${miss.map(x=>label(x)).join('、')}。` + (open.length?`另有 ${open.length} 项异常未处理。`:'') : (open.length?`检验项已全部录入，另有 ${open.length} 项异常未处理。`:'检验项已全部录入。');
    if(miss.length||open.length) out.alert = {cls:'ng', title: miss.length?'漏测提醒':'仍有异常', text: out.readback};
    return out;
  }
  if(A.err==='unknown'){
    S.queue.unshift({id:'Q'+(++S.qSeq), type:'unknown', ev:ev.id, seg:A.unknownSeg, raw:A.raw, t:now(), sugg:suggest(A.unknownSeg).map(s=>({a:s.a, item:s.t.item||s.t.map['1']||s.t.map.L, s:s.s}))});
    S.stats.intercept++;
    return Object.assign(out,{cls:'warn', verdict:'未识别检验项', calc:`「${A.unknownSeg||A.raw}」三层纠错均未命中`, src:'不猜 → 转主管人工复核 → 复核结果自动生成纠错表候选', readback:'没听清检验项，已转人工确认，请继续下一项。', title:'未识别', big:'?', alert:{cls:'warn', title:'已转人工确认', text:`「${A.raw}」`}});
  }
  if(A.err==='nopos'){
    S.stats.intercept++;
    const nm = A.term?A.term.aliases[0]:'', two = A.term&&A.term.posType==='12';
    return Object.assign(out,{cls:'warn', verdict:'缺少位置 · 未入表', calc:`「${nm}」需说明${two?'一 / 二':'左 / 右'}`, src:'防错：不确定的数据不入表', readback:`${nm}是${two?'对角线一还是对角线二':'左边还是右边'}？请补充。`, title:nm, big:two?'一 / 二 ?':'左 / 右 ?', alert:{cls:'warn', title:'请补充位置', text:`${nm}是${two?'一还是二':'左边还是右边'}？`}});
  }
  if(A.err==='novalue' || A.err==='implausible'){
    S.stats.intercept++;
    const it = IT[A.itemId];
    const why = A.err==='novalue' ? '没听到数值' : `${fmt(A.value)} 超出物理合理范围 ${it.pl[0]} ~ ${it.pl[1]}`;
    return Object.assign(out,{cls:'warn', verdict:'未入表 · 请复述', calc:why, src:'物理合理性校验', readback:`${label(it)}，${why}，请复述。`, title:label(it), big:'—', alert:{cls:'warn', title:'请复述', text:why}});
  }

  const it = IT[A.itemId], r = S.items[A.itemId], v = A.value;
  const prev = r.status, old = r.v;
  S.stats.readback++;
  if(A.amend) S.stats.amend++;
  const gap = S.lastMeasureT!=null ? (S.clock - S.lastMeasureT)/1000 : null;
  S.lastMeasureT = S.clock;
  r.ev = ev.id;
  if(A.amend) r.hist.push({t:now(), v:A.amend.from, note:`口头更正「${A.amend.word}」· 作废`, ev:ev.id});
  out.src = it.src; out.title = label(it); out.big = fmt(v); out.unit = it.unit; out.nonstd = it.nonstd;
  const pre = A.amend ? `已更正为 ${fmt(v)}。` : '';
  const amb = A.ambig ? `（“${A.ambig.word}”按 ${fmt(A.ambig.chosen)} 记录，不对请说更正）` : '';

  if(it.id==='dD'){
    r.reported = v;
    r.hist.push({t:now(), v, note:'质检员报数', ev:ev.id});
    const a=S.items.D1.v, b=S.items.D2.v;
    if(a==null||b==null){
      r.v=v; setStatus('dD', v<=it.max?'ok':'retest');
      Object.assign(out,{cls:v<=it.max?'ok':'ng', verdict:v<=it.max?'合格 · 待核对':'超差', calc:`${fmt(v)} ${v<=it.max?'≤':'>'} ${it.max}`, readback:`对角线差 ${fmt(v)} 毫米，两条对角线测完后自动核对。`});
    } else {
      const c=+Math.abs(a-b).toFixed(3);
      recomputeDerived();
      const st = S.items.dD.status;
      if(st==='mismatch') S.stats.intercept++;
      Object.assign(out,{cls: st==='ok'||st==='retest_ok'?'ok':(st==='mismatch'?'warn':'ng'),
        verdict: st==='mismatch'?'报数与计算不一致': (st==='retest'?'超差':'合格'),
        calc:`报 ${fmt(v)}　算 |${fmt(a)} − ${fmt(b)}| = ${fmt(c)}`,
        src:'跨项一致性校验：报数必须与两条对角线实测值对得上',
        readback: st==='mismatch' ? `对角线差报数 ${fmt(v)} 毫米，按两条对角线计算为 ${fmt(c)} 毫米，对不上${c>it.max?'，且超出允许值 '+it.max:''}，请复测对角线。` : `对角线差 ${fmt(v)} 毫米，与计算值一致，合格。`});
      if(st==='mismatch') out.alert={cls:'ng', title:'数据对不上', text:`报 ${fmt(v)} ≠ 算 ${fmt(c)}，不放行，请复测对角线`};
    }
    return finishCred(out, ev, it, gap);
  }

  r.v = v;
  r.hist.push({t:now(), v, note: A.retest||prev==='retest' ? '复测' : (old!=null?'重报':'首测'), ev:ev.id});
  const J = judge(it, v);
  out.calc = J.calc;
  let st;
  if(it.kind==='record') st='ok';
  else if(J.ok) st = (prev==='retest'||prev==='hold') ? 'retest_ok' : 'ok';
  else if(it.hold) st='hold';
  else st = (prev==='retest') ? 'hold' : 'retest';
  if(!J.ok) S.stats.intercept++;
  setStatus(it.id, st, st==='retest_ok'?`复测 ${fmt(v)}，首测 ${fmt(old)} 留档`:null);
  const mq = S.queue.find(q=>q.type==='missing');
  if(mq && !mq.items.some(i=>S.items[i].status==='pending')){ S.queue=S.queue.filter(q=>q!==mq); S.closed.unshift({t:now(), text:'漏测项已全部补齐'}); }

  const L = label(it), U = ucn(it.unit);
  if(it.kind==='record'){ out.cls='ok'; out.verdict='已记录'; out.readback = `${pre}${L} ${fmt(v)} ${U}，已记录。${amb}`; }
  else if(st==='ok'){ out.cls='ok'; out.verdict='合格'; out.readback = `${pre}${L} ${fmt(v)} ${U}，合格。${amb}`; }
  else if(st==='retest_ok'){ out.cls='ok'; out.verdict='复测合格'; out.readback = `${L} 复测 ${fmt(v)} ${U}，合格，首测 ${fmt(old)} 已留档。`; }
  else if(st==='retest'){ out.cls='ng'; out.verdict='超差 · 请复测'; out.readback = `${pre}${L} ${fmt(v)} ${U}，超出允许值 ${J.lim}，请复测。${amb}`; out.alert={cls:'ng', title:'超差 · 请复测', text:`${L} ${fmt(v)} ${it.unit}，允许 ${it.std}`}; }
  else if(st==='hold'){
    out.cls='ng';
    if(it.kind==='eq'){ out.verdict='与配置不符 · 锁定'; out.readback = `${L} ${fmt(v)}，与配置表 ${it.eq} 不一致，疑似装错，已锁定，请主管处置。`; out.alert={cls:'ng', title:'与配置表不一致', text:`实测 ${fmt(v)}，合同配置 ${it.eq}，疑似装错，禁止放行`}; }
    else if(it.nonstd){ out.verdict='低于协议非标要求'; out.readback = `${L} ${fmt(v)} ${U}，低于技术协议非标要求 ${it.min}，已锁定，请主管处置。`; out.alert={cls:'ng', title:'协议非标项不满足', text:`本合同要求 ≥ ${it.min} μm；按标准件 ≥ 120 会误判合格`}; }
    else { out.verdict='复测仍超差 · 锁定'; out.readback = `${L} 复测 ${fmt(v)} ${U}，仍超差，已锁定，请主管处置。`; out.alert={cls:'ng', title:'复测仍超差', text:out.readback}; }
  }
  for(const n of recomputeDerived()){
    if(n.st==='retest'||n.st==='mismatch'){ S.stats.intercept++; out.readback += n.msg+'。'; out.alert = {cls:'ng', title:n.st==='retest'?'自动计算超差':'数据对不上', text:n.msg}; if(out.cls==='ok') out.cls='warn'; out.derivedNote=n.msg; }
    else if(n.st==='retest_ok'){ out.readback += `${IT[n.id].name}按复测值重算为 ${fmt(S.items[n.id].v)}，已闭环。`; out.derivedNote=`${IT[n.id].name}重算 ${fmt(S.items[n.id].v)}，已闭环`; }
  }
  return finishCred(out, ev, it, gap);
}

/* ─────────── 5. 命令执行（确定性，两端一致） ─────────── */
function execUtt(cmd){
  const dur = cmd.dur || Math.max(1, [...cmd.text].length*0.22);
  S.clock += (cmd.gap||45)*1000;
  const ev = {id:'EV-'+String(++S.evSeq).padStart(4,'0'), t:now(), raw:cmd.text, dur, synced:S.net};
  S.stats.utt++;
  const A = analyze(cmd.text, {forceItem:cmd.forceItem, fromSeg:cmd.fromSeg});
  ev.A = A;
  for(const c of A.corr){ if(c.layer==='py') S.stats.py++; if(c.layer==='tb') S.stats.tb++; S.corrLog.unshift({t:ev.t, raw:cmd.text, from:c.from, to:c.to, layer:c.layer, note:c.note}); }
  const out = apply(A, ev);
  ev.out = out; ev.itemId = A.itemId;
  S.events.unshift(ev);
  if(!S.net) S.offline.push(ev.id);
  return {kind:'utt', ev, A, out, cap:cmd.cap};
}
function exec(cmd){
  if(cmd.step!=null) S.cursor = Math.max(S.cursor, cmd.step+1);
  switch(cmd.t){
    case 'utt': return execUtt(cmd);
    case 'assign': {
      const q = S.queue.find(x=>x.id===cmd.q) || S.queue.find(x=>x.type==='unknown');
      if(!q) return {kind:'noop'};
      S.queue = S.queue.filter(x=>x!==q);
      const ev = S.events.find(e=>e.id===q.ev);
      if(q.seg && !S.table.some(e=>e.from===q.seg)) S.table.unshift({from:q.seg, to:IT[cmd.target].name, type:'口音', src:`人工复核 · ${now()}`, hit:0, st:'待确认', fresh:true});
      S.closed.unshift({t:now(), text:`「${q.seg}」→ ${label(IT[cmd.target])}（主管指定，已生成纠错表候选）`});
      const res = execUtt({text:ev?ev.raw:q.raw, forceItem:cmd.target, fromSeg:q.seg, gap:30, dur:ev?ev.dur:2});
      res.toast = {cls:'fix', html:`主管复核：「${esc(q.seg)}」→ <b>${esc(label(IT[cmd.target]))}</b>，已生成纠错表候选`};
      res.cap = cmd.cap || '复核后重新进入管线';
      return res;
    }
    case 'net': {
      S.net = cmd.on;
      if(!cmd.on) return {kind:'net', on:false, toast:{cls:'warn', html:'车间信号弱 · 已切到<b>离线模式</b>，录音与规则判定在手机本地进行'}};
      const n = S.offline.length;
      for(const id of S.offline){ const e=S.events.find(x=>x.id===id); if(e) e.synced=true; }
      S.offline = [];
      return {kind:'net', on:true, n, toast:{cls:'ok', html: n?`网络恢复 · <b>${n} 条</b>离线记录已同步`:'网络已恢复'}};
    }
    case 'dispose': {
      const id=cmd.item, it=IT[id], r=S.items[id];
      if(!BLOCK.has(r.status) || r.status==='pending') return {kind:'noop'};
      if(cmd.how==='rectify'){
        const no = `ZG-1110-${String(S.tickets.length+1).padStart(2,'0')}`;
        const tk = {no, item:id, t:now(), problem: it.kind==='eq' ? `${it.name}实测 ${fmt(r.v)}，配置表要求 ${it.eq}，疑似装错` : it.nonstd ? `${it.name} ${fmt(r.v)} μm，低于技术协议 §4.3 非标要求 ${it.min} μm` : `${label(it)} ${fmt(r.v)} ${it.unit}，超出 ${it.std}`,
          basis: it.src, team: it.team||'结构班', due: it.kind==='eq'?'24 小时':'48 小时', ev:r.ev, pushed:S.net};
        S.tickets.push(tk);
        setStatus(id,'rectify','整改单 '+no);
        if(S.net) S.feishu.unshift({...tk, fresh:true, pt:now()});
        return {kind:'dispose', item:id, how:'rectify', tk, toast:{cls:'fix', html:`整改单 <b>${no}</b> → ${esc(tk.team)}${S.net?' · 已推送飞书':' · 联网后推送'}`}};
      }
      if(cmd.how==='concede'){ setStatus(id,'concede', cmd.reason||'主管让步接收'); return {kind:'dispose', item:id, how:'concede', toast:{cls:'warn', html:`${esc(label(it))} · 让步接收`}}; }
      if(cmd.how==='retest'){ return {kind:'dispose', item:id, how:'retest', toast:{cls:'', html:`已通知质检员复测 <b>${esc(label(it))}</b>`}}; }
      return {kind:'noop'};
    }
    case 'report': {
      const miss = MEASURABLE.filter(x=>S.items[x.id].status==='pending');
      const open = ITEMS.filter(x=>BLOCK.has(S.items[x.id].status) && S.items[x.id].status!=='pending');
      const unk = S.queue.filter(q=>q.type==='unknown');
      const reasons = [...open.map(x=>`${label(x)}　${ST[S.items[x.id].status][0]}`), ...miss.map(x=>`${label(x)}　未检`), ...unk.map(q=>`未识别语音「${q.seg}」待复核`)];
      if(reasons.length){ S.report = {state:'blocked', reasons}; return {kind:'report', ok:false, toast:{cls:'ng', html:`<b>不允许出报告</b> · 还有 ${reasons.length} 项未处理`}}; }
      S.report = {state:'ready', t:now()};
      return {kind:'report', ok:true, toast:{cls:'ok', html:'检验记录已生成 · 每条数据附原始语音证据号'}};
    }
    case 'confirm': { const en=S.table.find(e=>e.from===cmd.from); if(en){ en.st='已确认'; en.src=en.src.replace('人工复核','人工复核 → 已确认'); } return {kind:'confirm', toast:{cls:'ok', html:`纠错表新增 <b>${esc(cmd.from)} → ${esc(en?en.to:'')}</b>，以后自动生效`}}; }
    case 'ack': { S.queue=S.queue.filter(x=>x.id!==cmd.q); return {kind:'ack'}; }
    case 'reset': { S = freshState(); return {kind:'reset'}; }
  }
  return {kind:'noop'};
}
const esc = s => String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function counts(){
  const m = MEASURABLE.length, done = MEASURABLE.filter(x=>S.items[x.id].status!=='pending').length;
  const all = ITEMS.map(x=>S.items[x.id].status);
  return {m, done, ok: all.filter(s=>s==='ok'||s==='retest_ok').length, ng: all.filter(s=>['retest','hold','mismatch'].includes(s)).length, fix: all.filter(s=>s==='rectify'||s==='concede').length};
}

/* ─────────── 6. 演示剧本 ─────────── */
const SCRIPT = [
  {t:'utt', text:'跨度左边两万两千五百零一', dur:2.6, gap:20, cap:'开工：报数 → 回读 → 入表'},
  {t:'utt', text:'跨度右边两万两千四百九十八', dur:2.8, gap:95, cap:'两侧跨度测完，自动算相对差'},
  {t:'utt', text:'上工度左边二十三', dur:2.1, gap:140, cap:'口音：拼音模糊匹配纠正术语'},
  {t:'utt', text:'右边上拱度二十六，不对，是二十八', dur:3.4, gap:80, cap:'中途改口：取更正值，原值留档'},
  {t:'utt', text:'旁弯左边一二五', dur:1.9, gap:150, cap:'逐位读数歧义 + 超差 → 当场复测'},
  {t:'utt', text:'胖弯右边八', dur:1.4, gap:70, cap:'口音：胖弯 → 旁弯'},
  {t:'utt', text:'旁弯左边复测，十点八', dur:2.4, gap:110, cap:'复测合格，首测留档'},
  {t:'utt', text:'叉角线一，两万三千零五十二', dur:3.0, gap:160, cap:'三层都兜不住 → 不猜，转人工'},
  {t:'assign', target:'D1', cap:'主管指定检验项 → 自动生成纠错表候选'},
  {t:'utt', text:'对角线二，两万三千零四十六', dur:3.0, gap:85, cap:'系统自动计算对角线差'},
  {t:'utt', text:'对角线差两毫米', dur:1.6, gap:40, cap:'跨项一致性：报数和计算值对不上'},
  {t:'utt', text:'小车鬼剧两千五百零一', dur:2.5, gap:180, cap:'口音：鬼剧 → 轨距'},
  {t:'utt', text:'减速机数比三十一点五', dur:2.4, gap:210, cap:'平翘舌纠正 + 配置表比对：速比装错'},
  {t:'utt', text:'漆膜厚度一百三十五', dur:2.2, gap:260, cap:'合同非标要求随单走'},
  {t:'utt', text:'检验完毕', dur:1.0, gap:30, cap:'离开前核对：漏测提醒'},
  {t:'net', on:false, cap:'车间信号差 → 离线'},
  {t:'utt', text:'轨道高低差二', dur:1.5, gap:120, cap:'离线照常录，本地规则照常判'},
  {t:'utt', text:'静绕度二十一', dur:1.6, gap:6, cap:'纠错表兜底 + 可信度提示'},
  {t:'net', on:true, cap:'网络恢复 → 离线记录同步'},
  {t:'utt', text:'对角线二复测，两万三千零五十', dur:3.2, gap:240, cap:'复测对角线 → 自动重算 → 闭环'},
  {t:'report', cap:'仍有不合格未处置 → 拒绝出报告'},
  {t:'dispose', item:'i', how:'rectify', cap:'主管处置：速比 → 整改单 → 飞书'},
  {t:'dispose', item:'paint', how:'rectify', cap:'主管处置：漆膜 → 整改单'},
  {t:'report', cap:'全部闭环 → 生成检验记录'},
];

/* ─────────── 7. 同步总线 ─────────── */
const bus = { id: Math.random().toString(36).slice(2,9), n:0, seen:new Set(), log:[], subs:[], peers:{}, onSync:null };
let bc = null; try{ bc = new BroadcastChannel('qc-bcbb'); }catch(e){}
const HTTP = /^https?:/.test(location.protocol);
let es = null;
function post(msg){
  if(bc) try{ bc.postMessage(msg); }catch(e){}
  if(HTTP) fetch('emit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(msg)}).catch(()=>{});
}
function receive(msg){
  if(!msg) return;
  if(msg.uid){ if(bus.seen.has(msg.uid)) return; bus.seen.add(msg.uid); }
  if(msg.t==='ping'){ bus.peers[msg.role]=Date.now(); return; }
  if(msg.t==='hello'){ if(msg.from!==bus.id && bus.log.length) post({t:'sync', to:msg.from, log:bus.log, from:bus.id}); bus.peers[msg.role]=Date.now(); return; }
  if(msg.t==='sync'){
    if((msg.to===bus.id || msg.to==='*') && !bus.log.length && msg.log && msg.log.length){
      S = freshState();
      for(const c of msg.log){ bus.seen.add(c.uid); bus.log.push(c); exec(c); }
      if(bus.onSync) bus.onSync();
    }
    return;
  }
  if(msg.t==='reset') bus.log=[]; else bus.log.push(msg);
  bus.subs.forEach(f=>f(msg));
}
function send(cmd){
  const msg = {...cmd, uid: bus.id+'-'+(++bus.n)+'-'+Date.now(), from: bus.id};
  receive(msg); post(msg);
}
if(bc) bc.onmessage = e => receive(e.data);
if(HTTP){ try{ es = new EventSource('events'); es.onmessage = e => { try{ receive(JSON.parse(e.data)); }catch(err){} }; }catch(e){} }
function hello(role){
  bus.role = role;
  post({t:'hello', from:bus.id, role, uid:bus.id+'-hello'});
  setInterval(()=>post({t:'ping', role, from:bus.id, uid:bus.id+'-p'+Date.now()}), 2500);
}

window.QCE = {
  ITEMS, IT, MEASURABLE, SCRIPT, ST, BLOCK, label, fmt, ucn, hhmm, esc, counts, analyze,
  get S(){ return S; }, exec, send, bus, hello, HTTP,
};
})();
