import React, { useEffect, useRef, useState } from 'react';
import './styles.css';

const WS_PATH = '/ws';
// Default production multiplayer backend. VITE_WS_URL overrides this for another deployment.
const DEFAULT_SERVER_BASE = 'https://combine.clockcombine.workers.dev';
const WS_BASE = String(import.meta.env.VITE_WS_URL || DEFAULT_SERVER_BASE).replace(/\/$/, '');
const PLACE_POINTS = [5,3,2,1,1];
const MAX_HAND_CARDS = 15;
const UI_SETTINGS_KEY = 'combine-ui-settings';
const DEFAULT_UI = {
  sound: true,
  volume: 0.55,
  animations: true,
  matrixBackground: true,
  backgroundImage: '',
  backgroundMode: 'matrix',
  name: 'Player',
};

function loadUiSettings(){
  try {
    const saved = JSON.parse(localStorage.getItem(UI_SETTINGS_KEY) || 'null');
    return {...DEFAULT_UI, ...(saved || {})};
  } catch {
    return {...DEFAULT_UI};
  }
}

function persistUiSettings(value){
  try { localStorage.setItem(UI_SETTINGS_KEY, JSON.stringify(value)); } catch {}
}

function getShellStyle(ui){
  if (ui?.backgroundMode === 'none') return {background:'#070314'};
  if (!ui?.backgroundImage || ui.backgroundMode !== 'custom') return undefined;
  return {
    backgroundImage: `linear-gradient(rgba(10,6,24,.72),rgba(4,2,16,.82)), url(${ui.backgroundImage})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundAttachment: 'fixed',
  };
}

function MatrixRain({enabled}){
  const ref=useRef(null);
  useEffect(()=>{
    if(!enabled) return;
    const canvas=ref.current;
    if(!canvas) return;
    const ctx=canvas.getContext('2d');
    if(!ctx || typeof ctx.fillRect!=='function' || typeof ctx.fillText!=='function') return;
    const requestFrame=window.requestAnimationFrame?.bind(window);
    const cancelFrame=window.cancelAnimationFrame?.bind(window);
    if(typeof requestFrame!=='function' || typeof cancelFrame!=='function') return;

    const chars='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ+-*/=()';
    let raf=0;
    let width=0;
    let height=0;
    let dpr=1;
    let glyphs=[];
    let lastChange=0;

    const randomChar=()=>chars[(Math.random()*chars.length)|0];
    const randomSize=()=>48 + Math.random()*74;
    const randomSpeed=()=>0.8 + Math.random()*1.8;

    const seedGlyphs=()=>{
      const count=Math.max(26, Math.min(76, Math.round((width*height)/19000)));
      glyphs=Array.from({length:count},(_,i)=>({
        x:Math.random()*(width+420)-210,
        y:Math.random()*(height+420)-210,
        size:randomSize(),
        speed:randomSpeed(),
        char:randomChar(),
        age:Math.random()*1000+i*17,
        phase:Math.random()*Math.PI*2,
        alpha:0.10+Math.random()*0.22,
        hue:185+Math.random()*120,
      }));
    };

    const resize=()=>{
      dpr=Math.min(window.devicePixelRatio||1,2);
      width=window.innerWidth;
      height=window.innerHeight;
      canvas.width=Math.floor(width*dpr);
      canvas.height=Math.floor(height*dpr);
      canvas.style.width=`${width}px`;
      canvas.style.height=`${height}px`;
      if(typeof ctx.setTransform==='function') ctx.setTransform(dpr,0,0,dpr,0,0);
      seedGlyphs();
    };

    const wrapGlyph=(g)=>{
      if(g.x>width+260 || g.y>height+260){
        g.x=Math.random()*width-320;
        g.y=-220-Math.random()*220;
        g.size=randomSize();
        g.speed=randomSpeed();
      }
    };

    const frame=(now)=>{
      ctx.fillStyle='rgba(5, 2, 18, 0.13)';
      ctx.fillRect(0,0,width,height);

      // Large diagonal glyphs sweep from top-left toward bottom-right.
      ctx.save();
      ctx.translate(width/2,height/2);
      ctx.rotate(-0.24);
      ctx.translate(-width/2,-height/2);
      ctx.textAlign='center';
      ctx.textBaseline='middle';

      if(now-lastChange>85){
        for(const g of glyphs){
          if(Math.random()<0.72) g.char=randomChar();
          if(Math.random()<0.18) g.size=randomSize();
          g.hue=175+Math.random()*145;
        }
        lastChange=now;
      }

      for(const g of glyphs){
        g.age+=1;
        g.x += g.speed*1.35;
        g.y += g.speed*0.88;
        wrapGlyph(g);

        const pulse=0.82+0.18*Math.sin(g.age*0.08+g.phase);
        ctx.font=`900 ${Math.round(g.size)}px monospace`;
        ctx.shadowBlur=20;
        ctx.shadowColor=`hsla(${g.hue},100%,70%,${g.alpha*1.8})`;
        ctx.fillStyle=`hsla(${g.hue},100%,70%,${g.alpha*pulse})`;
        ctx.fillText(g.char,g.x,g.y);
      }
      ctx.restore();

      raf=requestFrame(frame);
    };

    resize();
    window.addEventListener('resize',resize);
    ctx.fillStyle='#050212';
    ctx.fillRect(0,0,width,height);
    raf=requestFrame(frame);

    return()=>{
      cancelFrame(raf);
      window.removeEventListener('resize',resize);
    };
  },[enabled]);

  if(!enabled) return null;
  return <canvas ref={ref} className="matrixRain diagonalGlyphs" aria-hidden="true"/>;
}

class AppErrorBoundary extends React.Component {
  constructor(props){super(props);this.state={error:null,stack:''}}
  static getDerivedStateFromError(error){return {error}}
  componentDidCatch(error,info){this.setState({stack:info?.componentStack||''});console.error('Combine UI error:',error,info?.componentStack)}
  render(){
    if(this.state.error){
      const reset=()=>{try{localStorage.removeItem('combine-session')}catch{} location.reload()};
      return <div className="fatalError"><div className="fatalCard"><div className="eyebrow">COMBINE ERROR</div><h1>SCREEN COULD NOT RENDER</h1><p>{this.state.error?.message || 'Unknown error'}</p><details><summary>Technical details</summary><pre style={{whiteSpace:'pre-wrap',maxHeight:180,overflow:'auto'}}>{String(this.state.stack||this.state.error?.stack||'')}</pre></details><div style={{display:'grid',gap:8}}><button className="primary" onClick={()=>location.reload()}>RELOAD</button><button className="secondary" onClick={reset}>RESET ROOM SESSION</button></div></div></div>;
    }
    return this.props.children;
  }
}

function formatTime(s){const n=Math.max(0,Math.floor(Number(s)||0));return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`};
function evalLocal(input){
  const cards=Array.isArray(input)?input:[];
  let joined='';
  for(const c of cards) joined += c;
  if(!/[0-9]/.test(joined) || !/[+\-*/]/.test(joined)) return null;
  if(!/^[0-9+\-*/]+$/.test(joined)) return null;
  const toks=[]; let num=''; const flush=()=>{if(num){toks.push(Number(num));num=''}};
  for(const c of cards){if(/^\d$/.test(c))num+=c;else{flush();toks.push(c)}} flush();
  const vals=[],ops=[]; const prec={'+':1,'-':1,'*':2,'/':2}; const apply=()=>{const b=vals.pop(),a=vals.pop(),op=ops.pop();if(op==='+')vals.push(a+b);else if(op==='-')vals.push(a-b);else if(op==='*')vals.push(a*b);else{if(b===0)throw Error();vals.push(a/b)}};
  try{for(const t of toks){if(typeof t==='number')vals.push(t);else{while(ops.length&&prec[ops[ops.length-1]]>=prec[t])apply();ops.push(t)}}while(ops.length)apply();return vals.length===1&&Number.isFinite(vals[0])?vals[0]:null}catch{return null}
}

function getHttpServerBase(){
  return WS_BASE.replace(/^wss:/,'https:').replace(/^ws:/,'http:');
}
function getWsServerBase(){
  return WS_BASE.replace(/^https:/,'wss:').replace(/^http:/,'ws:');
}

function normalizeState(raw){
  if(!raw || typeof raw !== 'object') return null;
  const players=Array.isArray(raw.players) ? raw.players.map((p,i)=>({
    id:String(p?.id ?? `player-${i}`),
    name:String(p?.name ?? `Player ${i+1}`),
    color:String(p?.color ?? '#ff4fd8'),
    score:Number.isFinite(Number(p?.score)) ? Number(p.score) : 0,
    roundScore:Number.isFinite(Number(p?.roundScore)) ? Number(p.roundScore) : 0,
    alive:p?.alive !== false,
    hand:Array.isArray(p?.hand) ? p.hand.map(x=>String(x)) : [],
    remainingTime:Number.isFinite(Number(p?.remainingTime)) ? Number(p.remainingTime) : 0,
    online:p?.online !== false,
  })) : [];
  const rs=raw.roundState && typeof raw.roundState==='object' ? raw.roundState : null;
  return {
    ...raw,
    players,
    settings:raw.settings && typeof raw.settings==='object' ? raw.settings : {targetScore:11,playerSeconds:120,dhappaSeconds:30,direction:'counterclockwise'},
    roundState:rs ? {
      ...rs,
      target:Number.isFinite(Number(rs.target)) ? Number(rs.target) : 0,
      targetCards:Array.isArray(rs.targetCards) ? rs.targetCards : [],
      events:Array.isArray(rs.events) ? rs.events : [],
      drawnThisTurn:Boolean(rs.drawnThisTurn),
      finishCount:Number.isFinite(Number(rs.finishCount)) ? Number(rs.finishCount) : 0,
    } : null,
    dhappa:raw.dhappa && typeof raw.dhappa==='object' ? {
      ...raw.dhappa,
      seconds:Number.isFinite(Number(raw.dhappa.seconds)) ? Number(raw.dhappa.seconds) : 30,
    } : null,
  };
}



const LOCAL_COLORS = ['#ff4fd8','#44f7ff','#ffd447','#72ffb6','#ff6b7a','#a778ff'];

function shuffle(items){
  const arr=Array.isArray(items)?items.slice():[];
  for(let i=arr.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
  return arr;
}

function localId(prefix='p'){
  try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`; } catch {}
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
}

function makeLocalNumberDeck(){
  return shuffle(Array.from({length:10},(_,n)=>String(n)).flatMap(n=>Array(4).fill(n)));
}
function makeLocalOperatorDeck(){
  return shuffle(['+','-','*','/'].flatMap(op=>Array(4).fill(op)));
}
function makeLocalTarget(){
  const a=String(1+Math.floor(Math.random()*9));
  const b=String(Math.floor(Math.random()*10));
  return {target:Number(`${a}${b}`),targetCards:[a,b]};
}
function targetCardsFromNumber(target){
  const digits=String(Math.max(0,Math.floor(Number(target)||0))).split('');
  return digits.length ? digits : ['0'];
}

function findBotExpression(hand,target){
  const cards=Array.isArray(hand)?hand:[];
  const n=cards.length;
  if(n<3) return null;

  // Search the whole hand (up to the 15-card limit), while capping the
  // expression at six selected cards so bot turns remain responsive.
  const maxLen=Math.min(n,6);
  const indices=Array.from({length:n},(_,i)=>i).sort((a,b)=>{
    const na=/^\d$/.test(String(cards[a]));
    const nb=/^\d$/.test(String(cards[b]));
    return Number(nb)-Number(na);
  });
  const used=new Array(n).fill(false);
  let found=null;
  let nodes=0;
  const NODE_LIMIT=250000;

  function dfs(seq,hasNum,hasOp){
    if(found || nodes++>=NODE_LIMIT) return;
    if(seq.length>=3 && hasNum && hasOp){
      const value=evalLocal(seq.map(i=>cards[i]));
      if(value!==null && Math.abs(value-Number(target))<1e-9){
        found=seq.slice();
        return;
      }
    }
    if(seq.length>=maxLen) return;

    for(const i of indices){
      if(used[i]) continue;
      used[i]=true;
      seq.push(i);
      const isNum=/^\d$/.test(String(cards[i]));
      dfs(seq,hasNum||isNum,hasOp||!isNum);
      seq.pop();
      used[i]=false;
      if(found || nodes>=NODE_LIMIT) return;
    }
  }

  dfs([],false,false);
  return found;
}

function advanceLocalTurn(game, actorId){
  const alive=game.players.filter(p=>p.alive);
  if(alive.length<=1) return game;
  const pos=alive.findIndex(p=>p.id===actorId);
  const step=game.settings.direction==='clockwise'?1:-1;
  const next=alive[(Math.max(0,pos)+step+alive.length)%alive.length];
  const now=Date.now();
  return {
    ...game,
    roundState:{...game.roundState,activeId:next.id,drawnThisTurn:false},
    turnStartedAt:now,
    turnDeadlineAt:now+(next.id==='human'?game.settings.playerSeconds*1000:Math.min(game.settings.playerSeconds,8)*1000),
  };
}

function finishLocalRound(game){
  const scored=game.players.map(p=>({...p,score:(p.score||0)+(p.roundScore||0)}));
  const history={
    round:game.round,
    target:game.roundState.target,
    scores:scored.map(p=>({id:p.id,roundScore:p.roundScore,total:p.score}))
  };
  const winner=scored.find(p=>p.score>=game.settings.targetScore);
  return {
    ...game,
    players:scored,
    phase:winner?'gameOver':'roundSummary',
    winnerId:winner?.id||null,
    roundHistory:[...(game.roundHistory||[]),history],
    turnStartedAt:null,
    turnDeadlineAt:null,
    dhappa:null,
  };
}

function eliminateLocal(game,targetId,advanceFromId,event={}){
  const target=game.players.find(p=>p.id===targetId);
  if(!target) return game;
  const players=game.players.map(p=>p.id===targetId?{...p,alive:false,remainingTime:0}:p);
  const nextGame={...game,players,roundState:{...game.roundState,events:[...(game.roundState?.events||[]),{...event,ts:Date.now()}]}};
  const survivors=players.filter(p=>p.alive);
  if(survivors.length===1) return finishLocalRound(nextGame);
  return advanceLocalTurn(nextGame,advanceFromId);
}

function beginLocalRound(game,roundNumber,targetOverride=null){
  const numberDeck=makeLocalNumberDeck();
  const operatorDeck=makeLocalOperatorDeck();
  const generated=targetOverride!=null ? {target:Number(targetOverride),targetCards:targetCardsFromNumber(targetOverride)} : makeLocalTarget();
  const players=game.players.map(p=>({...p,alive:true,roundScore:0,hand:[],remainingTime:game.settings.playerSeconds}));
  const starter=players[Math.floor(Math.random()*players.length)];
  const now=Date.now();
  return {
    ...game,
    phase:'turn',
    round:roundNumber,
    players,
    numberDeck:numberDeck.slice(2),
    operatorDeck,
    roundState:{target:generated.target,targetCards:generated.targetCards,activeId:starter.id,drawnThisTurn:false,finishCount:0,events:[]},
    turnStartedAt:now,
    turnDeadlineAt:now+(starter.id==='human'?game.settings.playerSeconds*1000:Math.min(game.settings.playerSeconds,8)*1000),
    dhappa:null,
    winnerId:null,
  };
}

function makeSingleplayerGame(botCount=3,targetScore=11,playerSeconds=120,playerName='YOU'){
  const players=[{id:'human',name:String(playerName||'YOU').slice(0,20),color:LOCAL_COLORS[0],score:0,roundScore:0,alive:true,hand:[],remainingTime:playerSeconds,online:true}];
  for(let i=0;i<botCount;i++) players.push({id:`bot-${i+1}`,name:`BOT ${String(i+1).padStart(2,'0')}`,color:LOCAL_COLORS[i+1]||LOCAL_COLORS[1],score:0,roundScore:0,alive:true,hand:[],remainingTime:playerSeconds,online:true,bot:true});
  const base={mode:'singleplayer',phase:'lobby',hostPlayerId:'human',me:'human',players,round:0,settings:{targetScore:Math.max(1,targetScore),playerSeconds:Math.max(5,playerSeconds),dhappaSeconds:30,direction:'counterclockwise'},roundState:null,roundHistory:[],numberDeck:[],operatorDeck:[],dhappa:null,winnerId:null,turnStartedAt:null,turnDeadlineAt:null};
  return beginLocalRound(base,1,null);
}

function makePracticeGame(target=24,playerName='YOU'){
  const safeTarget=Math.max(1,Math.min(9999,Math.floor(Number(target)||24)));
  const now=Date.now();
  return {
    mode:'practice',phase:'practice',round:1,hostPlayerId:'human',me:'human',settings:{targetScore:1,playerSeconds:0,dhappaSeconds:30,direction:'counterclockwise'},
    players:[{id:'human',name:String(playerName||'YOU').slice(0,20),color:LOCAL_COLORS[0],score:0,roundScore:0,alive:true,hand:[],remainingTime:0,online:true}],
    roundState:{target:safeTarget,targetCards:targetCardsFromNumber(safeTarget),activeId:'human',drawnThisTurn:false,finishCount:0,events:[]},
    roundHistory:[],numberDeck:makeLocalNumberDeck(),operatorDeck:makeLocalOperatorDeck(),dhappa:null,winnerId:null,turnStartedAt:null,turnDeadlineAt:null,
    practiceSolved:false,createdAt:now
  };
}

function seatPosition(count,index){
  const patterns={
    2:['bottom','top'],
    3:['bottom','upperLeft','upperRight'],
    4:['bottom','left','top','right'],
    5:['bottom','lowerLeft','upperLeft','upperRight','lowerRight'],
    6:['bottom','lowerLeft','upperLeft','top','upperRight','lowerRight'],
  };
  const row=patterns[Math.max(2,Math.min(6,count))] || patterns[4];
  return row[index] || 'top';
}

function seatRotation(position){
  if(position==='top') return '180deg';
  if(position==='left'||position==='upperLeft'||position==='lowerLeft') return '90deg';
  if(position==='right'||position==='upperRight'||position==='lowerRight') return '-90deg';
  return '0deg';
}

function useGameSocket(){
  const wsRef=useRef(null);
  const connectPromiseRef=useRef(null);
  const sessionRef=useRef(null);
  const mountedRef=useRef(true);
  const retryRef=useRef(null);
  const retryDelayRef=useRef(800);
  const [connected,setConnected]=useState(false);
  const [state,setState]=useState(null);
  const [messages,setMessages]=useState([]);
  const [serverOffset,setServerOffset]=useState(0);
  const [session,setSession]=useState(()=>{
    try{return JSON.parse(localStorage.getItem('combine-session')||'null')}catch{return null}
  });

  useEffect(()=>{sessionRef.current=session;},[session]);
  useEffect(()=>()=>{
    mountedRef.current=false;
    if(retryRef.current) clearTimeout(retryRef.current);
    wsRef.current?.close();
  },[]);

  const clearSession=()=>{
    localStorage.removeItem('combine-session');
    sessionRef.current=null;
    setSession(null);
    setState(null);
  };

  const connectToSession=async(sess)=>{
    if(!sess?.roomCode||!sess?.playerId) throw new Error('No saved room session.');
    if(wsRef.current?.readyState===WebSocket.OPEN) return;
    if(connectPromiseRef.current) return connectPromiseRef.current;

    connectPromiseRef.current=new Promise((resolve,reject)=>{
      const wsUrl=`${getWsServerBase()}/ws?room=${encodeURIComponent(sess.roomCode)}&playerId=${encodeURIComponent(sess.playerId)}`;
      const ws=new WebSocket(wsUrl);
      wsRef.current=ws;
      let opened=false;
      ws.onopen=()=>{
        opened=true;
        retryDelayRef.current=800;
        setConnected(true);
        resolve();
      };
      ws.onerror=()=>{
        if(!opened) reject(new Error('Unable to connect to the game server.'));
      };
      ws.onclose=()=>{
        setConnected(false);
        connectPromiseRef.current=null;
        if(mountedRef.current && sessionRef.current){
          const delay=retryDelayRef.current;
          if(!retryRef.current){
            retryRef.current=setTimeout(()=>{
              retryRef.current=null;
              connectToSession(sessionRef.current).catch(()=>{
                retryDelayRef.current=Math.min(10000,Math.round(retryDelayRef.current*1.7));
              });
            },delay);
          }
        }
      };
      ws.onmessage=e=>{
        try{
          const m=JSON.parse(e.data);
          if(m.type==='state') {
            const receivedAt=Date.now();
            if(Number.isFinite(m.state?.serverNow)) setServerOffset(m.state.serverNow-receivedAt);
            setState(normalizeState(m.state));
          }
          else if(m.type==='error') setMessages(x=>[m.message,...x].slice(0,4));
          else if(m.type==='left') clearSession();
        }catch{}
      };
    });
    return connectPromiseRef.current;
  };

  useEffect(()=>{
    if(session?.roomCode&&session?.playerId){
      connectToSession(session).catch(()=>{});
    }
  },[]);

  const api=async(path,body)=>{
    const res=await fetch(`${getHttpServerBase()}${path}`,{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify(body)
    });
    let data={};
    try{data=await res.json()}catch{}
    if(!res.ok) throw new Error(data.error||`Request failed (${res.status})`);
    return data;
  };

  const send=async msg=>{
    if(msg.type==='createRoom'){
      try{
        const data=await api('/api/create',{name:msg.name,settings:msg.settings});
        const next={roomCode:data.roomCode,playerId:data.playerId};
        localStorage.setItem('combine-session',JSON.stringify(next));
        sessionRef.current=next; setSession(next); if(data.state)setState(normalizeState(data.state));
        await connectToSession(next);
      }catch(e){setMessages(x=>[e.message,...x].slice(0,4));}
      return;
    }
    if(msg.type==='joinRoom'){
      try{
        const data=await api('/api/join',{name:msg.name,code:String(msg.code||'').toUpperCase()});
        const next={roomCode:String(msg.code||'').toUpperCase(),playerId:data.playerId};
        localStorage.setItem('combine-session',JSON.stringify(next));
        sessionRef.current=next; setSession(next); if(data.state)setState(normalizeState(data.state));
        await connectToSession(next);
      }catch(e){setMessages(x=>[e.message,...x].slice(0,4));}
      return;
    }
    if(msg.type==='rejoinRoom'){
      try{
        const code=String(msg.code||sessionRef.current?.roomCode||'').toUpperCase();
        const playerId=msg.playerId||sessionRef.current?.playerId;
        const data=await api('/api/rejoin',{code,playerId});
        const next={roomCode:code,playerId:data.playerId};
        localStorage.setItem('combine-session',JSON.stringify(next));
        sessionRef.current=next; setSession(next); if(data.state)setState(normalizeState(data.state));
        await connectToSession(next);
      }catch(e){
        if(/not found/i.test(e.message)){clearSession();}
        setMessages(x=>[e.message,...x].slice(0,4));
      }
      return;
    }

    try{
      await connectToSession(sessionRef.current);
      if(wsRef.current?.readyState!==WebSocket.OPEN) throw new Error('Connection lost.');
      wsRef.current.send(JSON.stringify(msg));
    }catch(e){setMessages(x=>[e.message,...x].slice(0,4));}
  };

  return {connected,state,session,send,messages,serverOffset};
}

function CombineApp(){
  const {connected,state,session,send,messages,serverOffset}=useGameSocket();
  const [view,setView]=useState('menu');
  const [name,setName]=useState(()=>loadUiSettings().name || 'Player');
  const [roomCode,setRoomCode]=useState('');
  const [settings,setSettings]=useState({targetScore:11,playerSeconds:120,dhappaSeconds:30,direction:'counterclockwise'});
  const [targetPick,setTargetPick]=useState([]); const [selected,setSelected]=useState([]); const [challengeSelected,setChallengeSelected]=useState([]);
  const [showSettings,setShowSettings]=useState(false);
  const [ui,setUi]=useState(loadUiSettings);
  const [localMode,setLocalMode]=useState(null);
  const [showModeSetup,setShowModeSetup]=useState(null);
  useEffect(()=>persistUiSettings({...ui,name}),[ui,name]);
  const updateUi=(patch)=>setUi(v=>({...v,...patch}));
  const [expressionError,setExpressionError]=useState('');
  const [localNow,setLocalNow]=useState(Date.now());
  useEffect(()=>{const id=setInterval(()=>setLocalNow(Date.now()),100);return()=>clearInterval(id)},[]);
  useEffect(()=>{
    if(!ui.sound) return;
    const click=()=>{
      try{
        const AC=window.AudioContext||window.webkitAudioContext;
        if(!AC) return;
        const ctx=new AC();
        const osc=ctx.createOscillator();
        const gain=ctx.createGain();
        osc.frequency.value=ui.volume<.3?420:560;
        osc.type='square';
        gain.gain.setValueAtTime(Math.max(.015,ui.volume*.045),ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.045);
        osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.05);
        setTimeout(()=>{try{if(typeof ctx.close==='function') ctx.close();}catch{}},100);
      }catch{}
    };
    document.addEventListener('click',click,true);
    return()=>document.removeEventListener('click',click,true);
  },[ui.sound,ui.volume]);
  const clockNow=localNow+serverOffset;
  const players=Array.isArray(state?.players) ? state.players : [];
  const roundState=(state?.roundState && typeof state.roundState==='object') ? state.roundState : {target:0,targetCards:[],activeId:null,drawnThisTurn:false,numberCardsLeft:0,operatorCardsLeft:0,events:[]};
  const me=players.find(p=>p.id===state?.me) || null;
  const active=players.find(p=>p.id===roundState.activeId) || null;
  const isMyTurn=!!me&&!!active&&me.id===active.id;
  const challengeTarget=state?.dhappa ? (players.find(p=>p.id===state.dhappa.targetId) || (state.dhappa.mode==='attempt' ? me : null)) : null;
  const caller=state?.dhappa ? players.find(p=>p.id===state.dhappa.callerId) || null : null;
  const sorted=[...players].sort((a,b)=>(b.score??0)-(a.score??0));
  const myHand=Array.isArray(me?.hand)?me.hand:[];
  const safeSelected=Array.isArray(selected)?selected.filter(i=>Number.isInteger(i)&&i>=0&&i<myHand.length):[];
  const selectedCards=safeSelected.map(i=>myHand[i]);
  const liveValue=safeSelected.length?evalLocal(selectedCards):null;
  function displayRemaining(p){
    if(!p||!roundState) return 0;
    if(p.id===roundState.activeId && roundState.turnDeadlineAt && state.phase==='turn' && !state.dhappa){
      return Math.max(0,(roundState.turnDeadlineAt-clockNow)/1000);
    }
    return p.remainingTime;
  }
  const dhappaRemaining=state?.dhappa?.expiresAt ? Math.max(0,(state.dhappa.expiresAt-clockNow)/1000) : null;

  useEffect(()=>{
    if(!state){
      if(!session) setView('menu');
      return;
    }
    if(state?.phase==='lobby')setView('lobby');
    else if(state?.phase==='turn'||state?.phase==='roundSummary'||state?.phase==='gameOver')setView(state.phase);
  },[state?.phase,state,session]);
  useEffect(()=>{ const room=new URLSearchParams(window.location.search).get('room'); if(room) setRoomCode(room.toUpperCase()); },[]);
  // HTTP fallback keeps the lobby synchronized even if a WebSocket broadcast is delayed.
  useEffect(()=>{
    if(view!=='lobby' || !session?.roomCode || !session?.playerId) return;
    let stopped=false;
    const refresh=async()=>{
      try{
        const res=await fetch(`${getHttpServerBase()}/api/rejoin`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:session.roomCode,playerId:session.playerId})});
        const data=await res.json().catch(()=>({}));
        if(!stopped && res.ok && data?.state) setState(normalizeState(data.state));
      }catch{}
    };
    refresh();
    const id=setInterval(refresh,1200);
    return()=>{stopped=true;clearInterval(id)};
  },[view,session?.roomCode,session?.playerId]);

  async function createRoom(){await send({type:'createRoom',name,settings});}
  async function joinRoom(){
    const code=roomCode.trim().toUpperCase();
    if(!code) return;

    // If this browser already belongs to this room, reconnect the existing
    // player session instead of trying to add a brand-new player. This allows
    // a player to close/reopen the browser after the game has started.
    if(session?.roomCode===code && session?.playerId){
      await send({type:'rejoinRoom',code,playerId:session.playerId});
      return;
    }

    await send({type:'joinRoom',code,name});
  }
  async function startGame(){await send({type:'startGame'});}
  function act(type,payload={}){send({type,...payload})}
  function toggleSelected(i){setSelected(s=>{const cur=Array.isArray(s)?s:[];return cur.includes(i)?cur.filter(x=>x!==i):[...cur,i]})}
  function toggleChallenge(i){setChallengeSelected(s=>{const cur=Array.isArray(s)?s:[];return cur.includes(i)?cur.filter(x=>x!==i):[...cur,i]})}
  function undoSelected(){setSelected(s=>s.slice(0,-1));setExpressionError('')}
  function clearSelected(){setSelected([]);setExpressionError('')}
  function undoChallenge(){setChallengeSelected(s=>s.slice(0,-1));setExpressionError('')}
  function clearChallenge(){setChallengeSelected([]);setExpressionError('')}
  if(localMode?.type==='singleplayer') return <SingleplayerGame initialGame={localMode.game} onExit={()=>setLocalMode(null)} ui={ui}/>;
  if(localMode?.type==='practice') return <PracticeGame initialTarget={localMode.target} playerName={localMode.playerName} onExit={()=>setLocalMode(null)} ui={ui}/>;

  // After leaving, the socket clears state asynchronously. Never render a room
  // view with null state during that transition; go straight back to the menu.
  if(view==='menu' || !state) return <div className="menuShell" style={getShellStyle(ui)}>
    <MatrixRain enabled={ui.matrixBackground && ui.backgroundMode !== 'custom'} />
    {messages.length>0&&<div className="toast menuToast">{messages[0]}</div>}
    <Menu name={name} setName={setName} roomCode={roomCode} setRoomCode={setRoomCode} onCreate={createRoom} onJoin={joinRoom} onResume={()=>{connectResume(send,session)}} connected={connected} hasSession={!!session} savedRoom={session?.roomCode} onSingleplayer={()=>setShowModeSetup('singleplayer')} onPractice={()=>setShowModeSetup('practice')} onSettings={()=>setShowSettings(true)} />
    {showModeSetup==='singleplayer'&&<ModeSetup type="singleplayer" onClose={()=>setShowModeSetup(null)} onStart={({bots,targetScore,playerSeconds})=>{setShowModeSetup(null);setLocalMode({type:'singleplayer',game:makeSingleplayerGame(bots,targetScore,playerSeconds,name)})}}/>}
    {showModeSetup==='practice'&&<ModeSetup type="practice" onClose={()=>setShowModeSetup(null)} onStart={({target})=>{setShowModeSetup(null);setLocalMode({type:'practice',target,playerName:name})}}/>}
    {showSettings&&<Settings settings={settings} setSettings={setSettings} name={name} setName={setName} ui={ui} updateUi={updateUi} allowGameplayEdit={!state} onClose={()=>setShowSettings(false)} onReset={()=>{setUi({...DEFAULT_UI});setName('Player')}} />}
  </div>;
  if(view==='lobby') return <Lobby state={state} me={me} onStart={startGame} onLeave={()=>act('leaveRoom')} />;
  if(view==='roundSummary') return <Summary state={state} onNext={()=>{if(me?.id===state.hostPlayerId)act('nextRound')}} />;
  if(view==='gameOver') return <GameOver state={state} />;

  function leaveRoom(){
    setShowSettings(false);
    setTargetPick([]);
    setSelected([]);
    setChallengeSelected([]);
    act('leaveRoom');
  }

  const seatPlayers = [
    ...(me ? [me] : []),
    ...players.filter(p=>p.id!==me?.id),
  ].slice(0,6);

  return <div className={`app tabletopApp ${ui.animations?'':'no-anim'}`} style={getShellStyle(ui)}>
    <header className="topbar tableTopbar">
      <div className="brand">COMBINE <span>ONLINE</span></div>
      <div className="tableTopCenter">ROOM <b>{state?.code}</b><span>ROUND {state.round}</span></div>
      <div className="topBtns"><button onClick={()=>setShowSettings(true)}>⚙</button><button className="leaveTop" onClick={()=>{if(window.confirm('Leave this room?')) leaveRoom()}}>LEAVE</button></div>
    </header>

    {messages.length>0&&<div className="toast">{messages[0]}</div>}

    <main className="tableStage">
      <div className="tableGlow" aria-hidden="true"/>
      <div className="tableSurface">
        <div className="tableCorners" aria-hidden="true"><span/><span/><span/><span/></div>

        <div className="roundBadge">ROUND {state.round}<span>·</span> TARGET SCORE {state.settings.targetScore}</div>

        {seatPlayers.map((p,index)=>{
          const position=seatPosition(seatPlayers.length,index);
          const own=p.id===me?.id;
          const isActive=p.id===active?.id;
          const hand=Array.isArray(p.hand)?p.hand:[];
          return <div
            key={p.id}
            className={`tableSeat seat-${position} ${isActive?'activeSeat':''} ${!p.alive?'isOut':''} ${own?'isYou':''}`}
            style={{'--seat-rotation':seatRotation(position),'--player-accent':p.color||'var(--cyan)'}}
          >
            <div className="seatName">
              <span className="seatDot"/>
              <b>{own?'YOU':p.name}</b>
              {isActive&&<em>TURN</em>}
            </div>
            <div className="seatAvatar" aria-hidden="true"><span/><span/></div>
            <div className="seatHand">
              {hand.map((c,i)=>{
                const isSelected=own && selected.includes(i);
                return <button
                  key={`${p.id}-${i}-${c}`}
                  className={`card tableCard ${/\d/.test(c)?'num':'op'} ${isSelected?'sel':''}`}
                  disabled={!own || !isMyTurn || !!state.dhappa}
                  onClick={()=>own && toggleSelected(i)}
                >{c}</button>;
              })}
              {!hand.length&&<span className="seatEmpty">EMPTY</span>}
            </div>
            <div className="seatMeta">{p.alive?`${formatTime(displayRemaining(p))} · ${hand.length}/${MAX_HAND_CARDS} CARDS`:'OUT · 0 PTS'}</div>
          </div>;
        })}

        <section className="tableCenter">
          <div className="targetZone">
            <div className="targetLabel">ROUND TARGET</div>
            <div className="targetCards">
              {(Array.isArray(roundState.targetCards)&&roundState.targetCards.length?roundState.targetCards:[String(roundState.target||'—')]).map((c,i)=><div className="targetPhysicalCard" key={i}><span>{c}</span></div>)}
            </div>
            <div className="targetNumber">{roundState.target||'—'}</div>
          </div>

          <div className="centerTimer">
            <div className="turnLabel" style={{color:active?.color||'var(--cyan)'}}>{active?.id===me?.id?'YOUR TURN':`${active?.name||'PLAYER'}'S TURN`}</div>
            <div className="timerDigits">{formatTime(displayRemaining(active))}</div>
          </div>

          <div className="drawZone">
            <button className="drawPile numberPile" disabled={!isMyTurn||roundState.drawnThisTurn||myHand.length>=MAX_HAND_CARDS||!roundState.numberCardsLeft} onClick={()=>act('draw',{deck:'number'})}>
              <span className="pileBack"/><span className="pileBack back2"/><span className="pileFace"><b>NUMBER</b><small>{roundState.numberCardsLeft} LEFT</small></span>
            </button>
            <button className="drawPile operatorPile" disabled={!isMyTurn||roundState.drawnThisTurn||myHand.length>=MAX_HAND_CARDS||!roundState.operatorCardsLeft} onClick={()=>act('draw',{deck:'operator'})}>
              <span className="pileBack"/><span className="pileBack back2"/><span className="pileFace"><b>OPERATOR</b><small>{roundState.operatorCardsLeft} LEFT</small></span>
            </button>
          </div>
          <div className="drawHint">{myHand.length>=MAX_HAND_CARDS?'HAND LIMIT REACHED':roundState.drawnThisTurn?'DRAW COMPLETE':'DRAW EXACTLY ONE CARD'}</div>
        </section>

        <aside className="tableScoreboard">
          <div className="hudHead"><b>SCOREBOARD</b><span>ROOM {state.code}</span></div>
          {sorted.map(p=>{const lastAward=[...(roundState?.events||[])].reverse().find(e=>Number(e?.points)>0&&(e?.type==='win'||e?.type==='kick'));return <div className={`hudPlayer ${p.id===active?.id?'active':''} ${!p.alive?'out':''}`} key={p.id}>
            <span className="hudDot" style={{background:p.color}}/>
            <div><b>{p.id===me?.id?'YOU':p.name}</b><small>{p.alive?`+${p.roundScore||0} THIS ROUND`:'OUT'}</small></div>
            <strong>{p.score||0}</strong>{lastAward?.playerId===p.id&&<em className="awardPill">+{lastAward.points}</em>}
          </div>})}
        </aside>

        <div className="eventStrip">
          {(Array.isArray(roundState.events)?roundState.events:[]).slice(-3).reverse().map((e,i)=><span key={i}><b>{players.find(p=>p.id===e?.playerId)?.name||'PLAYER'}</b> {String(e?.type||'EVENT').toUpperCase()} <em>{Number(e?.points)>0?`+${e.points}`:'0'}</em></span>)}
        </div>

        <div className="myDock">
          <div className="myExpression">
            <div className="exprPreview">{safeSelected.length?safeSelected.map(i=>myHand[i]).join(' '):'SELECT CARDS TO BUILD'}</div>
            {safeSelected.length>0&&<div className={`exprValue ${liveValue===null?'bad':''}`}>{liveValue===null?'INVALID':`= ${liveValue}`}</div>}
          </div>
          <div className="dockButtons">
            <button className="dockBtn" disabled={!safeSelected.length} onClick={undoSelected}>UNDO</button>
            <button className="dockBtn" disabled={!safeSelected.length} onClick={clearSelected}>CLEAR</button>
            <button className="dockBtn passBtn" disabled={!isMyTurn||!roundState.drawnThisTurn||!!state.dhappa} onClick={()=>{setSelected([]);act('pass')}}>PASS</button>
            <button className="dockBtn attemptBtn" disabled={!isMyTurn||!roundState.drawnThisTurn||!!state.dhappa||!safeSelected.length} onClick={()=>{setChallengeSelected([]);setExpressionError('');act('attempt')}}>ATTEMPT</button>
            <button className="dockBtn dhappaBtn" disabled={!isMyTurn||players.filter(p=>p.alive&&p.id!==me?.id).length===0||!!state.dhappa} onClick={()=>{setTargetPick(players.filter(p=>p.alive&&p.id!==me?.id).map(p=>p.id));setSelected([]);setExpressionError('')}}>DHAPPA</button>
          </div>
          {expressionError&&<div className="dockError">{expressionError}</div>}
          {targetPick.length>0&&<div className="tableChooser"><div className="chooserTitle">CALL OUT A PLAYER</div>{players.filter(p=>p.alive&&p.id!==me?.id).map(p=><button key={p.id} onClick={()=>{setTargetPick([]);act('dhappa',{targetId:p.id})}}><span style={{background:p.color}}/>{p.name}<b>30s</b></button>)}<button className="cancel" onClick={()=>setTargetPick([])}>CANCEL</button></div>}
        </div>
      </div>
    </main>

    {state.dhappa&&<ChallengeErrorBoundary onClose={()=>act('cancelChallenge')}><ChallengeModal key={`${state.dhappa.startedAt||'dhappa'}-${state.dhappa.mode||'mode'}`} state={state} now={clockNow} dhappaRemaining={dhappaRemaining} me={me} target={challengeTarget} caller={caller} selection={challengeSelected} onToggle={toggleChallenge} onUndo={undoChallenge} onClear={clearChallenge} onSubmit={()=>{setExpressionError('');act('submitExpression',{tokens:(Array.isArray(challengeSelected)?challengeSelected:[]).map(index=>({index}))})}} onKick={()=>act('kick')} onCancel={(reason)=>{if(reason==='fail')act('failChallenge');else act('cancelChallenge')}} /></ChallengeErrorBoundary>}
    {showSettings&&<Settings settings={state?.settings||settings} setSettings={setSettings} name={name} setName={setName} ui={ui} updateUi={updateUi} allowGameplayEdit={false} onClose={()=>setShowSettings(false)} onLeave={()=>{if(window.confirm('Leave this room?')) leaveRoom()}} onReset={()=>{setUi({...DEFAULT_UI});setName('Player')}} />}
  </div>

}

async function connectResume(send,session){if(session?.roomCode&&session?.playerId){await send({type:'rejoinRoom',code:session.roomCode,playerId:session.playerId});}}

function ModeSetup({type,onStart,onClose}){
  const practice=type==='practice';
  const [bots,setBots]=useState(3);
  const [targetScore,setTargetScore]=useState(11);
  const [playerSeconds,setPlayerSeconds]=useState(120);
  const [target,setTarget]=useState(24);
  return <div className="overlay"><div className="modeSetup">
    <div className="setTitle"><span>{practice?'PRACTICE MODE':'SINGLEPLAYER'}</span><button onClick={onClose}>✕</button></div>
    <div className="modeSetupHero">{practice?'Build expressions against your own target.':'Play a full Combine game against local bot players.'}</div>
    {practice ? <>
      <label>CUSTOM TARGET<input type="number" min="1" max="9999" value={target} onChange={e=>setTarget(Math.max(1,Math.min(9999,Number(e.target.value)||1)))}/></label>
      <p className="settingsHint">Choose any positive target. The target stays fixed while you practice.</p>
    </> : <>
      <label>BOTS<input type="range" min="1" max="5" value={bots} onChange={e=>setBots(Number(e.target.value))}/><div className="setupValue">{bots} BOT{bots>1?'S':''} · {bots+1} PLAYERS</div></label>
      <div className="grid2"><label>GAME TARGET<input type="number" min="1" value={targetScore} onChange={e=>setTargetScore(Math.max(1,Number(e.target.value)||1))}/></label><label>PLAYER TIMER · SEC<input type="number" min="5" value={playerSeconds} onChange={e=>setPlayerSeconds(Math.max(5,Number(e.target.value)||5))}/></label></div>
      <p className="settingsHint">Bots play automatically. Your turns follow the normal Combine rules.</p>
    </>}
    <button className="primary" onClick={()=>practice?onStart({target}):onStart({bots,targetScore,playerSeconds})}>{practice?'START PRACTICE →':'START SINGLEPLAYER →'}</button>
    <button className="cancel" onClick={onClose}>CANCEL</button>
  </div></div>;
}

function PracticeGame({initialTarget,playerName,onExit,ui}){
  const [game,setGame]=useState(()=>makePracticeGame(initialTarget,playerName));
  const [selected,setSelected]=useState([]);
  const [message,setMessage]=useState('DRAW ONE CARD TO BEGIN');
  const [solved,setSolved]=useState(false);
  const me=game.players[0];
  const hand=Array.isArray(me?.hand)?me.hand:[];
  const selectedCards=selected.map(i=>hand[i]).filter(Boolean);
  const value=selected.length?evalLocal(selectedCards):null;
  const correct=value!==null&&Math.abs(value-game.roundState.target)<1e-9;

  function draw(deckName){
    if(game.roundState.drawnThisTurn){setMessage('DRAW COMPLETE · RESET OR TRY YOUR EXPRESSION');return;}
    if(hand.length>=MAX_HAND_CARDS){setMessage(`HAND LIMIT REACHED · MAX ${MAX_HAND_CARDS} CARDS`);return;}
    const deck=deckName==='operator'?game.operatorDeck:game.numberDeck;
    if(!deck.length){setMessage('THAT DECK IS EMPTY');return;}
    const card=deck[0];
    setGame(g=>({...g,players:[{...g.players[0],hand:[...g.players[0].hand,card]}],numberDeck:deckName==='number'?g.numberDeck.slice(1):g.numberDeck,operatorDeck:deckName==='operator'?g.operatorDeck.slice(1):g.operatorDeck,roundState:{...g.roundState,drawnThisTurn:true}}));
    setMessage(`DREW ${card} · BUILD TOWARD ${game.roundState.target}`);
  }
  function pass(){
    setSelected([]);setSolved(false);setMessage('TURN RESET · DRAW AGAIN');setGame(g=>({...g,roundState:{...g.roundState,drawnThisTurn:false}}));
  }
  function clearHand(){
    setSelected([]);setSolved(false);setGame(g=>({...g,players:[{...g.players[0],hand:[]}],numberDeck:makeLocalNumberDeck(),operatorDeck:makeLocalOperatorDeck(),roundState:{...g.roundState,drawnThisTurn:false,events:[]}}));setMessage('HAND CLEARED · DRAW ONE CARD');
  }
  function attempt(){
    if(!game.roundState.drawnThisTurn){setMessage('DRAW EXACTLY ONE CARD FIRST');return;}
    if(!selected.length){setMessage('SELECT CARDS TO BUILD AN EXPRESSION');return;}
    if(correct){setSolved(true);setMessage(`TARGET HIT · ${value} = ${game.roundState.target}`);setGame(g=>({...g,roundState:{...g.roundState,events:[...g.roundState.events,{type:'practiceHit',playerId:'human',points:1,ts:Date.now()}]}}));}
    else setMessage(value===null?'INVALID EXPRESSION':`EXPRESSION = ${value} · TARGET = ${game.roundState.target}`);
  }
  const targetDigits=game.roundState.targetCards||targetCardsFromNumber(game.roundState.target);
  return <div className={`app tabletopApp ${ui?.animations?'':'no-anim'}`} style={getShellStyle(ui)}>
    <header className="topbar tableTopbar"><div className="brand">COMBINE <span>PRACTICE</span></div><div className="tableTopCenter">CUSTOM TARGET <b>{game.roundState.target}</b></div><div className="topBtns"><button className="leaveTop" onClick={onExit}>EXIT</button></div></header>
    <main className="tableStage practiceStage"><div className="tableGlow"/><div className="tableSurface practiceSurface">
      <div className="roundBadge">PRACTICE · SOLO</div>
      <section className="tableCenter practiceCenter">
        <div className="targetZone"><div className="targetLabel">YOUR TARGET</div><div className="targetCards">{targetDigits.map((c,i)=><div className="targetPhysicalCard" key={i}><span>{c}</span></div>)}</div><div className="targetNumber">{game.roundState.target}</div></div>
        <div className="centerTimer practiceStatus"><div className="turnLabel">{solved?'TARGET COMPLETE':'PRACTICE MODE'}</div><div className="practiceMessage">{message}</div></div>
        <div className="drawZone"><button className="drawPile numberPile" disabled={game.roundState.drawnThisTurn||hand.length>=MAX_HAND_CARDS||!game.numberDeck.length} onClick={()=>draw('number')}><span className="pileBack"/><span className="pileBack back2"/><span className="pileFace"><b>NUMBER</b><small>{game.numberDeck.length} LEFT</small></span></button><button className="drawPile operatorPile" disabled={game.roundState.drawnThisTurn||hand.length>=MAX_HAND_CARDS||!game.operatorDeck.length} onClick={()=>draw('operator')}><span className="pileBack"/><span className="pileBack back2"/><span className="pileFace"><b>OPERATOR</b><small>{game.operatorDeck.length} LEFT</small></span></button></div><div className="drawHint">{hand.length>=MAX_HAND_CARDS?'HAND LIMIT REACHED':game.roundState.drawnThisTurn?'DRAW COMPLETE':'DRAW ONE CARD'}</div>
      </section>
      <div className="tableSeat seat-bottom isYou activeSeat"><div className="seatName"><span className="seatDot"/><b>YOU</b><em>PRACTICE</em></div><div className="seatAvatar"><span/><span/></div><div className="seatHand">{hand.map((c,i)=><button className={`card tableCard ${/\d/.test(c)?'num':'op'} ${selected.includes(i)?'sel':''}`} key={`${c}-${i}`} onClick={()=>setSelected(v=>v.includes(i)?v.filter(x=>x!==i):[...v,i])}>{c}</button>)}</div><div className="seatMeta">{hand.length} CARDS</div></div>
      <div className="myDock"><div className="myExpression"><div className="exprPreview">{selected.length?selected.map(i=>hand[i]).join(' '):'SELECT CARDS TO BUILD'}</div>{selected.length>0&&<div className={`exprValue ${value===null?'bad':''}`}>{value===null?'INVALID':`= ${value}`}</div>}</div><div className="dockButtons"><button className="dockBtn" disabled={!selected.length} onClick={()=>setSelected(v=>v.slice(0,-1))}>UNDO</button><button className="dockBtn" disabled={!selected.length} onClick={()=>setSelected([])}>CLEAR</button><button className="dockBtn passBtn" onClick={pass}>RESET TURN</button><button className="dockBtn attemptBtn" onClick={attempt}>ATTEMPT</button><button className="dockBtn dhappaBtn" onClick={clearHand}>CLEAR HAND</button></div></div>
      <div className="practiceRules">Practice uses the same card expression rules: adjacent number cards concatenate and BEDMAS applies.</div>
    </div></main>
  </div>;
}

function SingleplayerGame({initialGame,onExit,ui}){
  const [game,setGame]=useState(initialGame);
  const [selected,setSelected]=useState([]);
  const [challengeSelected,setChallengeSelected]=useState([]);
  const [targetPick,setTargetPick]=useState([]);
  const [localNow,setLocalNow]=useState(Date.now());
  const [message,setMessage]=useState('');
  useEffect(()=>{const id=setInterval(()=>setLocalNow(Date.now()),100);return()=>clearInterval(id)},[]);
  const players=game.players||[]; const me=players.find(p=>p.id==='human')||players[0];
  const active=players.find(p=>p.id===game.roundState?.activeId)||null;
  const isMyTurn=active?.id==='human' && game.phase==='turn' && !game.dhappa;
  const myHand=Array.isArray(me?.hand)?me.hand:[];
  const safeSelected=selected.filter(i=>Number.isInteger(i)&&i>=0&&i<myHand.length);
  const liveValue=safeSelected.length?evalLocal(safeSelected.map(i=>myHand[i])):null;
  const dh=game.dhappa;
  const challengeTarget=dh ? players.find(p=>p.id===dh.targetId) : null;
  const caller=dh ? players.find(p=>p.id===dh.callerId) : null;
  const dhappaRemaining=dh?.expiresAt ? Math.max(0,(dh.expiresAt-localNow)/1000) : null;
  const displayRemaining=p=>{if(!p)return 0;if(p.id===active?.id&&game.turnDeadlineAt&&game.phase==='turn'&&!game.dhappa)return Math.max(0,(game.turnDeadlineAt-localNow)/1000);return p.remainingTime||0};

  function localAction(type,payload={}){
    setGame(g=>{
      const now=Date.now();

      // Challenge actions are handled before the normal-turn guard because an
      // active Dhappa intentionally pauses the turn.
      if(type==='cancelChallenge'){
        if(!g.dhappa) return g;
        return {...g,dhappa:null,turnStartedAt:now,turnDeadlineAt:now+g.settings.playerSeconds*1000};
      }
      if(type==='failChallenge'){
        if(!g.dhappa) return g;
        const failingId=g.dhappa.mode==='callout'?g.dhappa.callerId:g.dhappa.targetId;
        if(failingId!=='human') return g;
        const failed=g.players.find(p=>p.id===failingId); if(!failed) return g;
        return eliminateLocal({...g,dhappa:null},failed.id,failed.id,{type:'failed',playerId:failed.id,points:0});
      }
      if(type==='submitExpression'){
        if(!g.dhappa) return g;
        const caller2=g.players.find(p=>p.id===g.dhappa.callerId);
        const target=g.players.find(p=>p.id===g.dhappa.targetId);
        if(!caller2||!target||caller2.id!=='human') return g;
        const sourceIndices=Array.isArray(payload.indices)?payload.indices:[];
        const cards=sourceIndices.map(i=>target.hand?.[i]).filter(x=>x!==undefined);
        const value=evalLocal(cards);
        if(value===null||Math.abs(value-g.roundState.target)>1e-9){ return g; }
        const mode=g.dhappa.mode;
        const g2={...g,dhappa:null,turnStartedAt:null,turnDeadlineAt:null,roundState:{...g.roundState,drawnThisTurn:false}};
        if(mode==='callout'){
          const withPts={...g2,players:g2.players.map(p=>p.id===caller2.id?{...p,roundScore:p.roundScore+3}:p)};
          return eliminateLocal(withPts,target.id,caller2.id,{type:'kick',playerId:caller2.id,targetId:target.id,points:3});
        }
        if(target.id!=='human') return g;
        const pts=[5,3,2,1,1][g2.roundState.finishCount]??0;
        const withPts={...g2,players:g2.players.map(p=>p.id===target.id?{...p,roundScore:p.roundScore+pts}:p),roundState:{...g2.roundState,finishCount:g2.roundState.finishCount+1}};
        return eliminateLocal(withPts,target.id,target.id,{type:'win',playerId:target.id,points:pts});
      }

      if(g.phase!=='turn' || g.dhappa) return g;
      const activeNow=g.players.find(p=>p.id===g.roundState.activeId);
      if(!activeNow || activeNow.id!=='human') return g;

      if(type==='draw'){
        if(g.roundState.drawnThisTurn)return g;
        const human=g.players.find(p=>p.id==='human');
        if((human?.hand?.length||0)>=MAX_HAND_CARDS) return g;
        const deck=payload.deck==='operator'?g.operatorDeck:g.numberDeck;
        if(!deck.length)return g;
        const card=deck[0];
        return {...g,
          players:g.players.map(p=>p.id==='human'?{...p,hand:[...p.hand,card]}:p),
          numberDeck:payload.deck==='operator'?g.numberDeck:g.numberDeck.slice(1),
          operatorDeck:payload.deck==='operator'?g.operatorDeck.slice(1):g.operatorDeck,
          roundState:{...g.roundState,drawnThisTurn:true,events:[...g.roundState.events,{type:'draw',playerId:'human',deck:payload.deck,card,ts:now}]}
        };
      }
      if(type==='pass') return advanceLocalTurn(g,'human');
      if(type==='attempt') return {...g,dhappa:{mode:'attempt',targetId:'human',callerId:'human',startedAt:now,expiresAt:now+30000,seconds:30}};
      if(type==='dhappa'){
        const target=g.players.find(p=>p.id===payload.targetId);
        if(!target||!target.alive||target.id==='human') return g;
        return {...g,dhappa:{mode:'callout',targetId:target.id,callerId:'human',startedAt:now,expiresAt:now+30000,seconds:30}};
      }
      return g;
    });
  }

  // Expire the active turn or a human challenge.
  useEffect(()=>{
    if(game.phase!=='turn') return;
    if(game.dhappa){
      if(localNow>=game.dhappa.expiresAt){
        const failingId=game.dhappa.mode==='callout'?game.dhappa.callerId:game.dhappa.targetId;
        localAction('failChallenge',{targetId:failingId});
        setMessage(`${players.find(p=>p.id===failingId)?.name||'PLAYER'} TIMED OUT`);
      }
      return;
    }
    if(game.turnDeadlineAt && localNow>=game.turnDeadlineAt){
      const id=game.roundState.activeId;
      setGame(g=>eliminateLocal(g,id,id,{type:'timeout',playerId:id,points:0}));
    }
  },[localNow,game.phase,game.dhappa?.expiresAt,game.turnDeadlineAt,game.roundState?.activeId]);

  // Bot AI: draw exactly one, inspect every opponent hand for a valid target expression,
  // invoke Dhappa automatically when one exists, otherwise attempt with its own hand.
  useEffect(()=>{
    if(game.phase!=='turn'||game.dhappa||active?.id==='human'||!active?.bot) return;
    const botId=active.id; let cancelled=false;
    const timer=setTimeout(()=>{
      if(cancelled)return;
      setGame(g=>{
        if(g.phase!=='turn'||g.dhappa||g.roundState.activeId!==botId)return g;
        const bot=g.players.find(p=>p.id===botId); if(!bot)return g;
        if((bot.hand?.length||0)>=MAX_HAND_CARDS){
          return advanceLocalTurn(g,botId);
        }

        const deckPick=Math.random()<0.58?'number':'operator';
        const deck=deckPick==='number'?g.numberDeck:g.operatorDeck;
        if(!deck.length)return advanceLocalTurn(g,botId);
        const card=deck[0];
        const players2=g.players.map(p=>p.id===botId?{...p,hand:[...p.hand,card]}:p);
        let next={...g,
          players:players2,
          numberDeck:deckPick==='number'?g.numberDeck.slice(1):g.numberDeck,
          operatorDeck:deckPick==='operator'?g.operatorDeck.slice(1):g.operatorDeck,
          roundState:{...g.roundState,drawnThisTurn:true,events:[...g.roundState.events,{type:'draw',playerId:botId,deck:deckPick,card,ts:Date.now()}]}
        };

        // First look for a profitable Dhappa target among every other living player.
        const opponents=players2.filter(p=>p.alive && p.id!==botId);
        const targetHit=opponents.map(p=>({player:p,expr:findBotExpression(p.hand,g.roundState.target)})).find(x=>x.expr);
        if(targetHit){
          const target=targetHit.player;
          return {
            ...next,
            dhappa:{mode:'callout',targetId:target.id,callerId:botId,startedAt:Date.now(),expiresAt:Date.now()+30000,seconds:30},
            turnStartedAt:null,
            turnDeadlineAt:null,
            roundState:{...next.roundState,drawnThisTurn:false,events:[...next.roundState.events,{type:'dhappa',playerId:botId,targetId:target.id,points:0,ts:Date.now(),auto:true}]}
          };
        }

        const botAfterDraw=next.players.find(p=>p.id===botId);
        const expr=findBotExpression(botAfterDraw?.hand||[],g.roundState.target);
        if(expr){
          const pts=PLACE_POINTS[next.roundState.finishCount]??0;
          const updated={...next,
            players:next.players.map(p=>p.id===botId?{...p,roundScore:p.roundScore+pts}:p),
            roundState:{...next.roundState,finishCount:next.roundState.finishCount+1,events:[...next.roundState.events,{type:'win',playerId:botId,points:pts,ts:Date.now()}]}
          };
          setTimeout(()=>setMessage(`${bot.name} found ${expr.map(i=>botAfterDraw.hand[i]).join(' ')} → ${g.roundState.target} · +${pts}`),0);
          return eliminateLocal(updated,botId,botId,{});
        }
        return advanceLocalTurn(next,botId);
      });
    },900+Math.random()*900);
    return()=>{cancelled=true;clearTimeout(timer)};
  },[game.phase,game.dhappa,active?.id,game.roundState?.activeId]);

  // Automatically resolve a bot-initiated Dhappa using the target player's hand.
  useEffect(()=>{
    if(game.phase!=='turn'||!game.dhappa||game.dhappa.mode!=='callout'||game.dhappa.callerId==='human') return;
    const dhappaId=`${game.dhappa.callerId}:${game.dhappa.targetId}:${game.dhappa.startedAt}`;
    const timer=setTimeout(()=>{
      setGame(g=>{
        if(!g.dhappa||g.dhappa.mode!=='callout'||g.dhappa.callerId==='human'||`${g.dhappa.callerId}:${g.dhappa.targetId}:${g.dhappa.startedAt}`!==dhappaId) return g;
        const caller=g.players.find(p=>p.id===g.dhappa.callerId);
        const target=g.players.find(p=>p.id===g.dhappa.targetId);
        if(!caller||!target||!target.alive) return g;
        const expr=findBotExpression(target.hand||[],g.roundState.target);
        if(expr){
          const withPts={
            ...g,
            dhappa:null,
            turnStartedAt:null,
            turnDeadlineAt:null,
            players:g.players.map(p=>p.id===caller.id?{...p,roundScore:(p.roundScore||0)+3}:p),
            roundState:{...g.roundState,drawnThisTurn:false,events:[...g.roundState.events,{type:'kick',playerId:caller.id,targetId:target.id,points:3,ts:Date.now(),auto:true}]}
          };
          setTimeout(()=>setMessage(`${caller.name} called DHAPPA on ${target.name} · ${expr.map(i=>target.hand[i]).join(' ')} → ${g.roundState.target} · +3`),0);
          return eliminateLocal(withPts,target.id,caller.id,{});
        }
        // This should be rare because bots pre-check the target, but fail safely.
        const fail={...g,dhappa:null,turnStartedAt:null,turnDeadlineAt:null,roundState:{...g.roundState,drawnThisTurn:false}};
        return eliminateLocal(fail,caller.id,caller.id,{type:'failed',playerId:caller.id,points:0,auto:true});
      });
    },650);
    return()=>clearTimeout(timer);
  },[game.phase,game.dhappa?.mode,game.dhappa?.callerId,game.dhappa?.targetId,game.dhappa?.startedAt]);

  useEffect(()=>{if(game.phase==='roundSummary'||game.phase==='gameOver')setSelected([])},[game.phase,game.round]);
  useEffect(()=>{if(game.phase==='roundSummary')setMessage('ROUND COMPLETE');},[game.phase]);

  if(game.phase==='roundSummary') return <Summary state={game} onNext={()=>setGame(g=>beginLocalRound(g,g.round+1,null))}/>;
  if(game.phase==='gameOver') return <GameOver state={game}/>;

  const seatPlayers=[me,...players.filter(p=>p.id!==me.id)].filter(Boolean);
  return <div className={`app tabletopApp ${ui?.animations?'':'no-anim'}`} style={getShellStyle(ui)}>
    <header className="topbar tableTopbar"><div className="brand">COMBINE <span>SINGLEPLAYER</span></div><div className="tableTopCenter">ROUND <b>{game.round}</b><span>TARGET SCORE {game.settings.targetScore}</span></div><div className="topBtns"><button onClick={onExit}>EXIT</button></div></header>
    {message&&<div className="toast">{message}</div>}
    <main className="tableStage"><div className="tableGlow"/><div className="tableSurface">
      <div className="tableCorners"/><div className="roundBadge">SINGLEPLAYER · {players.length-1} BOTS · TARGET SCORE {game.settings.targetScore}</div>
      {seatPlayers.map((p,index)=>{const position=seatPosition(seatPlayers.length,index);const own=p.id==='human';const activeSeat=p.id===active?.id;const hand=p.hand||[];return <div key={p.id} className={`tableSeat seat-${position} ${activeSeat?'activeSeat':''} ${!p.alive?'isOut':''} ${own?'isYou':''}`} style={{'--seat-rotation':seatRotation(position),'--player-accent':p.color}}><div className="seatName"><span className="seatDot"/><b>{own?'YOU':p.name}</b>{activeSeat&&<em>TURN</em>}</div><div className="seatAvatar"><span/><span/></div><div className="seatHand">{hand.map((c,i)=>{const sel=own&&selected.includes(i);return <button key={`${p.id}-${i}-${c}`} className={`card tableCard ${/\d/.test(c)?'num':'op'} ${sel?'sel':''}`} disabled={!own||!isMyTurn||!!game.dhappa} onClick={()=>own&&setSelected(v=>v.includes(i)?v.filter(x=>x!==i):[...v,i])}>{c}</button>})}{!hand.length&&<span className="seatEmpty">EMPTY</span>}</div><div className="seatMeta">{p.alive?`${formatTime(displayRemaining(p))} · ${hand.length}/${MAX_HAND_CARDS} CARDS`:'OUT · 0 PTS'}</div></div>})}
      <section className="tableCenter"><div className="targetZone"><div className="targetLabel">ROUND TARGET</div><div className="targetCards">{game.roundState.targetCards.map((c,i)=><div className="targetPhysicalCard" key={i}><span>{c}</span></div>)}</div><div className="targetNumber">{game.roundState.target}</div></div><div className="centerTimer"><div className="turnLabel">{active?.id==='human'?'YOUR TURN':`${active?.name||'PLAYER'}'S TURN`}</div><div className="timerDigits">{formatTime(displayRemaining(active))}</div></div><div className="drawZone"><button className="drawPile numberPile" disabled={!isMyTurn||game.roundState.drawnThisTurn||myHand.length>=MAX_HAND_CARDS||!game.numberDeck.length} onClick={()=>localAction('draw',{deck:'number'})}><span className="pileBack"/><span className="pileBack back2"/><span className="pileFace"><b>NUMBER</b><small>{game.numberDeck.length} LEFT</small></span></button><button className="drawPile operatorPile" disabled={!isMyTurn||game.roundState.drawnThisTurn||myHand.length>=MAX_HAND_CARDS||!game.operatorDeck.length} onClick={()=>localAction('draw',{deck:'operator'})}><span className="pileBack"/><span className="pileBack back2"/><span className="pileFace"><b>OPERATOR</b><small>{game.operatorDeck.length} LEFT</small></span></button></div><div className="drawHint">{myHand.length>=MAX_HAND_CARDS?'HAND LIMIT REACHED':game.roundState.drawnThisTurn?'DRAW COMPLETE':'DRAW EXACTLY ONE CARD'}</div></section>
      <aside className="tableScoreboard"><div className="hudHead"><b>SCOREBOARD</b><span>LOCAL</span></div>{[...players].sort((a,b)=>(b.score??0)-(a.score??0)||(b.roundScore??0)-(a.roundScore??0)).map(p=>{const lastAward=[...(game.roundState?.events||[])].reverse().find(e=>Number(e?.points)>0 && (e?.type==='win'||e?.type==='kick'));return <div className={`hudPlayer ${p.id===active?.id?'active':''} ${!p.alive?'out':''}`} key={p.id}><span className="hudDot" style={{background:p.color}}/><div><b>{p.id==='human'?'YOU':p.name}</b><small>{p.alive?`+${p.roundScore||0} THIS ROUND`:'OUT'}</small></div><strong>{p.score||0}</strong>{lastAward?.playerId===p.id&&<em className="awardPill">+{lastAward.points}</em>}</div>})}</aside>
      <div className="myDock"><div className="myExpression"><div className="exprPreview">{safeSelected.length?safeSelected.map(i=>myHand[i]).join(' '):'SELECT CARDS TO BUILD'}</div>{safeSelected.length>0&&<div className={`exprValue ${liveValue===null?'bad':''}`}>{liveValue===null?'INVALID':`= ${liveValue}`}</div>}</div><div className="dockButtons"><button className="dockBtn" disabled={!safeSelected.length} onClick={()=>setSelected(v=>v.slice(0,-1))}>UNDO</button><button className="dockBtn" disabled={!safeSelected.length} onClick={()=>setSelected([])}>CLEAR</button><button className="dockBtn passBtn" disabled={!isMyTurn||!game.roundState.drawnThisTurn} onClick={()=>{setSelected([]);localAction('pass')}}>PASS</button><button className="dockBtn attemptBtn" disabled={!isMyTurn||!game.roundState.drawnThisTurn||!safeSelected.length} onClick={()=>{setChallengeSelected([]);localAction('attempt')}}>ATTEMPT</button><button className="dockBtn dhappaBtn" disabled={!isMyTurn||players.filter(p=>p.alive&&p.id!=='human').length===0} onClick={()=>setTargetPick(players.filter(p=>p.alive&&p.id!=='human').map(p=>p.id))}>DHAPPA</button></div>{targetPick.length>0&&<div className="tableChooser"><div className="chooserTitle">CALL OUT A PLAYER</div>{players.filter(p=>p.alive&&p.id!=='human').map(p=><button key={p.id} onClick={()=>{setTargetPick([]);localAction('dhappa',{targetId:p.id})}}><span style={{background:p.color}}/>{p.name}<b>30s</b></button>)}<button className="cancel" onClick={()=>setTargetPick([])}>CANCEL</button></div>}</div>
    </div></main>
    {game.dhappa&&game.dhappa.callerId==='human'&&<ChallengeErrorBoundary onClose={()=>localAction('cancelChallenge')}><ChallengeModal state={game} now={localNow} dhappaRemaining={dhappaRemaining} me={me} target={challengeTarget} caller={caller} selection={challengeSelected} onToggle={i=>setChallengeSelected(v=>v.includes(i)?v.filter(x=>x!==i):[...v,i])} onUndo={()=>setChallengeSelected(v=>v.slice(0,-1))} onClear={()=>setChallengeSelected([])} onSubmit={()=>localAction('submitExpression',{indices:challengeSelected})} onCancel={(reason)=>localAction(reason==='fail'?'failChallenge':'cancelChallenge')} /></ChallengeErrorBoundary>}
  </div>;
}

function Menu({name,setName,roomCode,setRoomCode,onCreate,onJoin,onResume,connected,hasSession,savedRoom,onSettings,onSingleplayer,onPractice}){return <div className="menu"><div className="menuPanel"><div className="logo">COMBINE</div><div className="tag">MATH · CARDS · CHAOS</div><div className="conn">● {connected?'SERVER CONNECTED':'READY TO CONNECT'}</div><label>YOUR NAME<input value={name} maxLength={20} onChange={e=>setName(e.target.value)}/></label><button className="primary" onClick={onCreate}>HOST GAME</button><div className="modeGrid"><button className="modeBtn" onClick={onSingleplayer}><b>SINGLEPLAYER</b><small>PLAY VS BOTS</small></button><button className="modeBtn practiceModeBtn" onClick={onPractice}><b>PRACTICE</b><small>SOLO · CUSTOM TARGET</small></button></div>{hasSession&&<button className="secondary resumeBtn" onClick={onResume}>RESUME ROOM · {savedRoom}</button>}<div className="joinRow"><input placeholder="ROOM CODE" value={roomCode} onChange={e=>setRoomCode(e.target.value.toUpperCase())}/><button onClick={onJoin}>JOIN</button></div><button className="secondary" onClick={onSettings}>SETTINGS</button><div className="menuHelp">Host creates an online room. Singleplayer runs locally with bots. Practice is solo with a target you choose.</div></div></div>}
function Lobby({state,me,onStart,onLeave}){
  const [qr,setQr]=useState('');
  const [copied,setCopied]=useState(false);
  const players=Array.isArray(state?.players)?state.players:[];
  const joinUrl=`${location.origin}/?room=${encodeURIComponent(state?.code||'')}`;
  useEffect(()=>{
    let alive=true;
    import('qrcode')
      .then(mod=>{
        const api=mod?.default && typeof mod.default==='object' ? mod.default : mod;
        if(typeof api?.toDataURL!=='function') throw new Error('QR generator unavailable');
        return api.toDataURL(joinUrl,{width:260,margin:2,errorCorrectionLevel:'M'});
      })
      .then(url=>{if(alive && typeof url==='string')setQr(url);})
      .catch(()=>{if(alive)setQr('');});
    return()=>{alive=false};
  },[joinUrl]);
  async function copyLink(){
    try{
      if(typeof navigator?.clipboard?.writeText!=='function') throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(()=>setCopied(false),1200);
    }catch{}
  }
  return <div className="lobby"><div className="lobbyCard">
    <div className="eyebrow">WAITING ROOM</div>
    <div className="roomBig">{state?.code||'------'}</div>
    <div className="share">Share the code or scan the QR code to join. No URL typing required.</div>
    {qr&&<img className="qr" src={qr} alt="Scan to join Combine room" />}
    <div className="shareActions"><button className="secondary" onClick={copyLink}>{copied?'COPIED ✓':'COPY JOIN LINK'}</button></div>
    {players.map(p=><div className="lobbyPlayer" key={p.id}><i style={{background:p.color}}></i><b>{p.name}</b>{p.id===state?.hostPlayerId&&<span>HOST</span>}{p.id===me?.id&&<small>YOU</small>}</div>)}
    <button className="primary" disabled={me?.id!==state?.hostPlayerId||players.length<2} onClick={onStart}>{players.length<2?'WAITING FOR PLAYERS':'START GAME →'}</button>
    <button className="link" onClick={onLeave}>LEAVE ROOM</button>
  </div></div>;
}

class ChallengeErrorBoundary extends React.Component {
  constructor(props){super(props);this.state={error:null}}
  static getDerivedStateFromError(error){return {error}}
  componentDidCatch(error,info){console.error('Combine challenge render error:',error,info?.componentStack)}
  render(){
    if(this.state.error){
      const reset=()=>this.setState({error:null});
      return <div className="overlay"><div className="challenge"><div className="chHead"><span>DHAPPA ERROR</span><b>!</b></div><div className="challengeTitle">EXPRESSION SCREEN COULD NOT RENDER</div><p>{String(this.state.error?.message||'Unknown challenge error')}</p><button className="primary" onClick={reset}>RETRY SCREEN</button><button className="cancel" onClick={()=>{if(typeof this.props.onClose==='function') this.props.onClose()}}>CLOSE CHALLENGE</button></div></div>;
    }
    return this.props.children;
  }
}

function ChallengeModal({state,me,target,caller,selection,onToggle,onUndo,onClear,onSubmit,onCancel,dhappaRemaining}){
  const safeCancel=typeof onCancel==='function' ? onCancel : ()=>{};
  const safeToggle=typeof onToggle==='function' ? onToggle : ()=>{};
  const safeUndo=typeof onUndo==='function' ? onUndo : ()=>{};
  const safeClear=typeof onClear==='function' ? onClear : ()=>{};
  const safeSubmit=typeof onSubmit==='function' ? onSubmit : ()=>{};
  const expressionHand=Array.isArray(target?.hand)?target.hand:[];
  const safeSelection=(Array.isArray(selection) ? selection : []).filter(i=>Number.isInteger(i)&&i>=0 && i<expressionHand.length);
  const dh=state?.dhappa && typeof state.dhappa==='object' ? state.dhappa : null;
  const roundState=state?.roundState && typeof state.roundState==='object' ? state.roundState : {target:0,finishCount:0};
  if(!target) return <div className="overlay"><div className="challenge"><div className="chHead"><span>DHAPPA!</span><b>!</b></div><div className="challengeTitle">WAITING FOR GAME STATE</div><p>The expression challenge opened, but the target player's cards have not arrived yet.</p><button className="primary" onClick={()=>safeCancel()}>CLOSE</button></div></div>;
  const mode=dh?.mode;
  const targetIsMe=target.id===me?.id;
  const callerIsMe=caller?.id===me?.id;
  const val=evalLocal(safeSelection.filter(i=>Number.isInteger(i)&&i>=0&&i<expressionHand.length).map(i=>expressionHand[i]));
  const correct=val!==null&&Math.abs(val-Number(roundState.target))<1e-9;
  const canEdit=mode==='callout'?callerIsMe:targetIsMe;
  const title=mode==='callout' ? `CALL ON ${String(target.name || 'PLAYER').toUpperCase()}` : 'MAKE THE TARGET';
  const description=mode==='callout'
    ? `${String(caller?.name||'The caller')} called Dhappa on ${String(target.name||'the target')}. ${callerIsMe?'Use their cards to prove a valid expression.':'The caller is using the target player\'s cards.'}`
    : `${String(target.name||'Player')} must show an expression hitting ${roundState.target}.`;
  const remaining=Math.max(0,Number(dhappaRemaining ?? dh?.seconds ?? 30));
  const danger=remaining<=10;
  return <div className="overlay"><div className="challenge">
    <div className="chHead"><span>DHAPPA!</span><b className={danger?'danger':''}>{Math.ceil(remaining)}s</b></div>
    <div className="challengeTitle">{title}</div>
    <p>{description}</p>
    <div className="challengeHelp">Target: <strong>{roundState.target}</strong> · Adjacent number cards concatenate.</div>
    {canEdit&&<>
      <div className="challengeHand">{expressionHand.map((c,i)=><button className={`card ${/\d/.test(c)?'num':'op'} ${safeSelection.includes(i)?'sel':''}`} key={i} onClick={()=>safeToggle(i)}>{c}</button>)}</div>
      <div className="chExpr">{safeSelection.map(i=>expressionHand[i]).join(' ')||'SELECT CARDS'}</div>
      <div className={`chValue ${correct?'ok':val===null?'bad':''}`}>{val===null ? 'INVALID EXPRESSION' : `= ${val}`}</div>
      <div className="exprUtility"><button className="smallBtn" disabled={!safeSelection.length} onClick={safeUndo}>UNDO</button><button className="smallBtn" disabled={!safeSelection.length} onClick={safeClear}>CLEAR</button></div>
      {mode==='callout'
        ? <button className="success" onClick={safeSubmit} disabled={!safeSelection.length||!correct}>I WON · KICK {String(target.name||'PLAYER')} → +3</button>
        : <button className="success" onClick={safeSubmit} disabled={!safeSelection.length||!correct}>I WON · +{PLACE_POINTS[roundState.finishCount]??0}</button>}
      {mode==='callout'&&<button className="dangerBtn" onClick={()=>safeCancel('fail')}>I FAILED · KICK ME OUT</button>}
      {mode==='attempt'&&<button className="dangerBtn" onClick={()=>safeCancel('fail')}>I FAILED · 0 POINTS</button>}
    </>}
    {!canEdit&&<div className="watching">Waiting for <strong>{mode==='callout'?String(caller?.name||'the caller'):String(target.name||'the player')}</strong> to demonstrate the expression.</div>}
    <button className="cancel" onClick={()=>safeCancel()}>{callerIsMe?'CANCEL DHAPPA':'CLOSE'}</button>
  </div></div>;
}

function Settings({settings,setSettings,name,setName,ui,updateUi,allowGameplayEdit,onClose,onLeave,onReset}){
  const [tab,setTab]=useState('general');
  const setGame=(patch)=>setSettings(v=>({...v,...patch}));
  async function chooseFile(e){
    const file=e.target.files?.[0];
    if(!file) return;
    if(!file.type.startsWith('image/')) return;
    if(file.size>2_000_000){alert('Please choose an image under 2 MB.');return;}
    const reader=new FileReader();
    reader.onload=()=>updateUi({backgroundImage:String(reader.result),backgroundMode:'custom'});
    reader.readAsDataURL(file);
  }
  return <div className="overlay">
    <div className="settings settingsWide">
      <div className="setTitle"><span>SETTINGS</span><button onClick={onClose}>✕</button></div>
      <div className="settingsTabs">
        {['general','background','audio','video','gameplay'].map(t=><button key={t} className={tab===t?'active':''} onClick={()=>setTab(t)}>{t.toUpperCase()}</button>)}
      </div>

      {tab==='general'&&<section className="settingsSection">
        <h3>GENERAL</h3>
        <label>PLAYER NAME<input value={name} maxLength={20} onChange={e=>setName(e.target.value)} placeholder="Your display name" /></label>
        <label className="switch"><span>Vapourwave theme</span><b className="settingPill">ACTIVE</b></label>
        <button className="secondary" onClick={onReset}>RESET LOCAL UI SETTINGS</button>
      </section>}

      {tab==='background'&&<section className="settingsSection">
        <h3>CUSTOM BACKGROUNDS</h3>
        <label className="switch"><span>Animated letters + numbers</span><input type="checkbox" checked={ui.matrixBackground} onChange={e=>updateUi({matrixBackground:e.target.checked,backgroundMode:e.target.checked?'matrix':ui.backgroundMode})}/></label>
        <div className="backgroundChoices">
          <button className={ui.backgroundMode==='matrix'?'selected':''} onClick={()=>updateUi({backgroundMode:'matrix',matrixBackground:true})}>MATRIX</button>
          <button className={ui.backgroundMode==='none'?'selected':''} onClick={()=>updateUi({backgroundMode:'none',matrixBackground:false})}>PLAIN</button>
          <button className={ui.backgroundMode==='custom'?'selected':''} disabled={!ui.backgroundImage} onClick={()=>ui.backgroundImage&&updateUi({backgroundMode:'custom'})}>CUSTOM IMAGE</button>
        </div>
        <label>CUSTOM IMAGE URL<input value={ui.backgroundImage?.startsWith('data:')?'':ui.backgroundImage} onChange={e=>updateUi({backgroundImage:e.target.value.trim(),backgroundMode:e.target.value.trim()?'custom':'matrix'})} placeholder="https://.../background.jpg" /></label>
        <label>UPLOAD IMAGE<input type="file" accept="image/*" onChange={chooseFile} /></label>
        {ui.backgroundImage&&<button className="secondary" onClick={()=>updateUi({backgroundImage:'',backgroundMode:'matrix',matrixBackground:true})}>REMOVE CUSTOM BACKGROUND</button>}
        <p className="settingsHint">Custom images are stored only in this browser. The default menu uses a live stream of changing letters, numbers and operators.</p>
      </section>}

      {tab==='audio'&&<section className="settingsSection">
        <h3>AUDIO</h3>
        <label className="switch"><span>Sound effects</span><input type="checkbox" checked={ui.sound} onChange={e=>updateUi({sound:e.target.checked})}/></label>
        <label>VOLUME<input type="range" min="0" max="1" step="0.05" value={ui.volume} onChange={e=>updateUi({volume:Number(e.target.value)})}/></label>
        <p className="settingsHint">UI clicks use a small synthesized confirmation sound. No external audio files are loaded.</p>
      </section>}

      {tab==='video'&&<section className="settingsSection">
        <h3>VIDEO</h3>
        <label className="switch"><span>Interface animations</span><input type="checkbox" checked={ui.animations} onChange={e=>updateUi({animations:e.target.checked})}/></label>
        <label className="switch"><span>Moving background</span><input type="checkbox" checked={ui.matrixBackground} onChange={e=>updateUi({matrixBackground:e.target.checked})}/></label>
        <p className="settingsHint">Turn these off for a lower-motion interface.</p>
      </section>}

      {tab==='gameplay'&&<section className="settingsSection">
        <h3>GAMEPLAY</h3>
        <div className="grid2">
          <label>GLOBAL TARGET<input type="number" min="1" value={settings?.targetScore ?? 11} readOnly={!allowGameplayEdit} onChange={e=>allowGameplayEdit&&setGame({targetScore:Math.max(1,Number(e.target.value)||1)})}/></label>
          <label>PLAYER TIMER · SEC<input type="number" min="1" value={settings?.playerSeconds ?? 120} readOnly={!allowGameplayEdit} onChange={e=>allowGameplayEdit&&setGame({playerSeconds:Math.max(1,Number(e.target.value)||1)})}/></label>
        </div>
        <label>DHAPPA TIMER · SEC<input type="number" min="5" value={settings?.dhappaSeconds ?? 30} readOnly={!allowGameplayEdit} onChange={e=>allowGameplayEdit&&setGame({dhappaSeconds:Math.max(5,Number(e.target.value)||30)})}/></label>
        <label>TURN DIRECTION<select value={settings?.direction ?? 'counterclockwise'} disabled={!allowGameplayEdit} onChange={e=>setGame({direction:e.target.value})}><option value="counterclockwise">COUNTERCLOCKWISE</option><option value="clockwise">CLOCKWISE</option></select></label>
        {!allowGameplayEdit&&<p className="settingsHint">Game settings are locked after the room is created so the active game rules cannot change mid-round.</p>}
      </section>}

      {onLeave&&<button className="leaveRoomBtn" onClick={onLeave}>LEAVE ROOM</button>}
      <button className="primary" onClick={onClose}>DONE</button>
    </div>
  </div>;
}

function Summary({state,onNext}){
  const rows=[...(state?.players||[])].sort((a,b)=>(b.roundScore??0)-(a.roundScore??0)||(b.score??0)-(a.score??0));
  const isHost=state?.me===state?.hostPlayerId;
  return <div className="summary">
    <div className="summaryCard">
      <div className="trophy">🏆</div>
      <div className="eyebrow">ROUND COMPLETE</div>
      <h1>ROUND {state?.round}</h1>
      <div className="winnerScore">TARGET {state?.roundState?.target ?? '—'}</div>
      {rows.map((p,i)=><div className="summaryRow" key={p.id}>
        <span>#{i+1}</span>
        <b>{p.name}</b>
        <strong>+{p.roundScore??0}</strong>
        <em>{p.score??0}</em>
      </div>)}
      <button className="primary" disabled={!isHost} onClick={onNext}>
        {isHost?'CONTINUE TO NEXT ROUND →':'WAITING FOR HOST'}
      </button>
    </div>
  </div>;
}

function GameOver({state}){
  const winner=state?.players?.find(p=>p.id===state?.winnerId);
  const rows=[...(state?.players||[])].sort((a,b)=>(b.score??0)-(a.score??0));
  return <div className="summary">
    <div className="summaryCard">
      <div className="trophy">🏆</div>
      <div className="eyebrow">GAME OVER</div>
      <h1>{winner?.name||'WINNER'}</h1>
      <div className="winnerScore">FINAL SCORE · {winner?.score??0}</div>
      {rows.map((p,i)=><div className="summaryRow" key={p.id}>
        <span>#{i+1}</span>
        <b>{p.name}</b>
        <strong>{p.score??0}</strong>
        <em>PTS</em>
      </div>)}
    </div>
  </div>;
}

export default function App(){
  return <AppErrorBoundary><CombineApp /></AppErrorBoundary>;
}
