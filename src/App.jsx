import React, { useEffect, useRef, useState } from 'react';
import './styles.css';

const WS_PATH = '/ws';
// Default production multiplayer backend. VITE_WS_URL overrides this for another deployment.
const DEFAULT_SERVER_BASE = 'https://combine.clockcombine.workers.dev';
const WS_BASE = String(import.meta.env.VITE_WS_URL || DEFAULT_SERVER_BASE).replace(/\/$/, '');
const PLACE_POINTS = [5,3,2,1,1];
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
  // After leaving, the socket clears state asynchronously. Never render a room
  // view with null state during that transition; go straight back to the menu.
  if(view==='menu' || !state) return <div className="menuShell" style={getShellStyle(ui)}>
    <MatrixRain enabled={ui.matrixBackground && ui.backgroundMode !== 'custom'} />
    {messages.length>0&&<div className="toast menuToast">{messages[0]}</div>}
    <Menu name={name} setName={setName} roomCode={roomCode} setRoomCode={setRoomCode} onCreate={createRoom} onJoin={joinRoom} onResume={()=>{connectResume(send,session)}} connected={connected} hasSession={!!session} savedRoom={session?.roomCode} settings={settings} setSettings={setSettings} onSettings={()=>setShowSettings(true)} />
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

  return <div className={`app ${ui.animations?'':'no-anim'}`} style={getShellStyle(ui)}>
    <header className="topbar"><div className="brand">COMBINE <span>ONLINE</span></div><div className="roomtag">ROOM <b>{state?.code}</b></div><div className="topBtns"><button onClick={()=>setShowSettings(true)}>⚙ SETTINGS</button><button className="leaveTop" onClick={()=>{if(window.confirm('Leave this room?')) leaveRoom()}}>LEAVE ROOM</button></div></header>
    {messages.length>0&&<div className="toast">{messages[0]}</div>}
    <main className="game">
      <section className="board">
        <div className="roundInfo">ROUND {state.round} · GLOBAL TARGET <b>{state.settings.targetScore}</b></div>
        <div className="targetCard"><span>ROUND TARGET</span><strong>{roundState.target}</strong><small>{Array.isArray(roundState.targetCards)?roundState.targetCards.join(' + '):''}</small></div>
        <div className="activeLine"><div className="activeName" style={{color:active?.color}}>{active?.name?.toUpperCase()}'S TURN</div><div className="bigTimer">{formatTime(displayRemaining(active))}</div></div>
        <div className="decks">
          <button className="deck number" disabled={!isMyTurn||roundState.drawnThisTurn||!roundState.numberCardsLeft} onClick={()=>act('draw',{deck:'number'})}><span>NUMBER</span><b>DRAW</b><small>{roundState.numberCardsLeft} LEFT</small></button>
          <button className="deck operator" disabled={!isMyTurn||roundState.drawnThisTurn||!roundState.operatorCardsLeft} onClick={()=>act('draw',{deck:'operator'})}><span>OPERATOR</span><b>DRAW</b><small>{roundState.operatorCardsLeft} LEFT</small></button>
        </div>
        <div className="handWrap">
          <div className="sectionHead"><span>{me?.name?.toUpperCase()}'S PUBLIC HAND</span><span>{me?.hand?.length||0} CARDS · {roundState.drawnThisTurn?'DRAW COMPLETE':'DRAW ONE'}</span></div>
          <div className="hand">{myHand.map((c,i)=><button key={i} disabled={!isMyTurn||!!state.dhappa} onClick={()=>toggleSelected(i)} className={`card ${/\d/.test(c)?'num':'op'} ${selected.includes(i)?'sel':''}`}>{c}</button>)}{!me?.hand?.length&&<div className="empty">No cards yet.</div>}</div>
          <div className="expression"><span>{safeSelected.length?safeSelected.map(i=>myHand[i]).join(' '):'SELECT CARDS TO BUILD'}</span><div className="exprActions"><button className="smallBtn" disabled={!safeSelected.length} onClick={undoSelected}>UNDO</button><button className="smallBtn" disabled={!safeSelected.length} onClick={clearSelected}>CLEAR</button><button disabled={!isMyTurn||!roundState.drawnThisTurn||!!state.dhappa||!safeSelected.length} onClick={()=>{setExpressionError('');act('attempt')}}>ATTEMPT</button></div></div>
          {safeSelected.length>0&&<div className={`liveResult ${liveValue===null?'bad':''}`}>
            {liveValue===null ? 'INVALID EXPRESSION' : `= ${liveValue}`}
          </div>}
          {expressionError&&<div className="err">{expressionError}</div>}
        </div>
        <div className="publicTable">
          <div className="sectionHead"><span>ALL PUBLIC HANDS</span><span>EVERY PLAYER CAN SEE EVERY CARD</span></div>
          <div className="publicHands">
            {players.map(p=><div className={`publicPlayer ${p.id===active?.id?'isActive':''} ${!p.alive?'isOut':''}`} key={p.id}>
              <div className="publicPlayerHead"><span><i style={{background:p.color}}></i><b>{p.name}</b>{p.id===active?.id?' · PLAYING':''}</span><em>{p.hand.length} CARDS</em></div>
              <div className="publicCards">{p.hand.length?p.hand.map((c,i)=><span key={i} className={`miniCard ${/\d/.test(c)?'num':'op'}`}>{c}</span>):<span className="noCards">EMPTY</span>}</div>
            </div>)}
          </div>
        </div>
        <div className="controls">
          <button className="pass" disabled={!isMyTurn||!roundState.drawnThisTurn||!!state.dhappa} onClick={()=>{setSelected([]);act('pass')}}>PASS</button>
          <button className="attempt" disabled={!isMyTurn||!roundState.drawnThisTurn||!!state.dhappa} onClick={()=>{setChallengeSelected([]);setExpressionError('');act('attempt')}}>ATTEMPT</button>
          <button className="dhappa" disabled={!isMyTurn||players.filter(p=>p.alive&&p.id!==me?.id).length===0||!!state.dhappa} onClick={()=>{setTargetPick(players.filter(p=>p.alive&&p.id!==me?.id).map(p=>p.id));setSelected([]);setExpressionError('')}}>DHAPPA</button>
        </div>
        {targetPick.length>0&&<div className="chooser"><div className="chooserTitle">CALL OUT A PLAYER</div>{players.filter(p=>p.alive&&p.id!==me?.id).map(p=><button key={p.id} onClick={()=>{setTargetPick([]);act('dhappa',{targetId:p.id})}}><span style={{background:p.color}}></span>{p.name}<b>30s</b></button>)}<button className="cancel" onClick={()=>setTargetPick([])}>CANCEL</button></div>}
      </section>
      <aside className="scoreboard"><div className="scoreTitle"><span>SCOREBOARD</span><span>ROUND {state.round}</span></div>{sorted.map(p=><div className={`score ${p.id===active?.id?'active':''} ${!p.alive?'out':''}`} key={p.id}><i style={{background:p.color}}></i><div><b>{p.name}</b><small>{p.alive?formatTime(displayRemaining(p)):'OUT'} · ROUND +{p.roundScore}</small></div><strong>{p.score}</strong></div>)}<div className="events">{(Array.isArray(roundState.events)?roundState.events:[]).slice(-8).reverse().map((e,i)=>{const eventType=String(e?.type??'EVENT');const points=Number(e?.points)||0;return <div key={i}><b>{players.find(p=>p.id===e?.playerId)?.name||'Player'}</b><span>{eventType==='win'?'WON':eventType==='kick'?'KICKED':eventType.toUpperCase()}</span><em>{points>0?`+${points}`:'0'}</em></div>})}</div></aside>
    </main>

    {state.dhappa&&<ChallengeErrorBoundary onClose={()=>act('cancelChallenge')}><ChallengeModal key={`${state.dhappa.startedAt||'dhappa'}-${state.dhappa.mode||'mode'}`} state={state} now={clockNow} dhappaRemaining={dhappaRemaining} me={me} target={challengeTarget} caller={caller} selection={challengeSelected} onToggle={toggleChallenge} onUndo={undoChallenge} onClear={clearChallenge} onSubmit={()=>{setExpressionError('');act('submitExpression',{tokens:(Array.isArray(challengeSelected)?challengeSelected:[]).map(index=>({index}))})}} onKick={()=>act('kick')} onCancel={(reason)=>{if(reason==='fail')act('failChallenge');else act('cancelChallenge')}} /></ChallengeErrorBoundary>}
    {showSettings&&<Settings settings={state?.settings||settings} setSettings={setSettings} name={name} setName={setName} ui={ui} updateUi={updateUi} allowGameplayEdit={false} onClose={()=>setShowSettings(false)} onLeave={()=>{if(window.confirm('Leave this room?')) leaveRoom()}} onReset={()=>{setUi({...DEFAULT_UI});setName('Player')}} />}
  </div>
}

async function connectResume(send,session){if(session?.roomCode&&session?.playerId){await send({type:'rejoinRoom',code:session.roomCode,playerId:session.playerId});}}
function Menu({name,setName,roomCode,setRoomCode,onCreate,onJoin,onResume,connected,hasSession,savedRoom,onSettings}){return <div className="menu"><div className="menuPanel"><div className="logo">COMBINE</div><div className="tag">MATH · CARDS · CHAOS</div><div className="conn">● {connected?'SERVER CONNECTED':'READY TO CONNECT'}</div><label>YOUR NAME<input value={name} maxLength={20} onChange={e=>setName(e.target.value)}/></label><button className="primary" onClick={onCreate}>HOST GAME</button>{hasSession&&<button className="secondary resumeBtn" onClick={onResume}>RESUME ROOM · {savedRoom}</button>}<div className="joinRow"><input placeholder="ROOM CODE" value={roomCode} onChange={e=>setRoomCode(e.target.value.toUpperCase())}/><button onClick={onJoin}>JOIN</button></div><button className="secondary" onClick={onSettings}>SETTINGS</button><div className="menuHelp">Host creates a room. New players can join only before the game starts. Players who already belong to this room can reconnect after the game has started.</div></div></div>}
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
