import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import './styles.css';

const WS_PATH = '/ws';
// Default production multiplayer backend. VITE_WS_URL overrides this for another deployment.
const DEFAULT_SERVER_BASE = 'https://combine.clockcombine.workers.dev';
const WS_BASE = (import.meta.env.VITE_WS_URL || DEFAULT_SERVER_BASE).replace(/\/$/, '');
const PLACE_POINTS = [5,3,2,1,1];

function formatTime(s){const n=Math.max(0,Number(s)||0);return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`}
function evalLocal(cards){
  let joined='';
  for(const c of cards) joined += c;
  if(!/[0-9]/.test(joined) || !/[+\-*/]/.test(joined)) return null;
  if(!/^[0-9+\-*/]+$/.test(joined)) return null;
  const toks=[]; let num=''; const flush=()=>{if(num){toks.push(Number(num));num=''}};
  for(const c of cards){if(/^\d$/.test(c))num+=c;else{flush();toks.push(c)}} flush();
  const vals=[],ops=[]; const prec={'+':1,'-':1,'*':2,'/':2}; const apply=()=>{const b=vals.pop(),a=vals.pop(),op=ops.pop();if(op==='+')vals.push(a+b);else if(op==='-')vals.push(a-b);else if(op==='*')vals.push(a*b);else{if(b===0)throw Error();vals.push(a/b)}};
  try{for(const t of toks){if(typeof t==='number')vals.push(t);else{while(ops.length&&prec[ops.at(-1)]>=prec[t])apply();ops.push(t)}}while(ops.length)apply();return vals.length===1&&Number.isFinite(vals[0])?vals[0]:null}catch{return null}
}

function getHttpServerBase(){
  return WS_BASE.replace(/^wss:/,'https:').replace(/^ws:/,'http:');
}
function getWsServerBase(){
  return WS_BASE.replace(/^https:/,'wss:').replace(/^http:/,'ws:');
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
            setState(m.state);
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
        sessionRef.current=next; setSession(next); if(data.state)setState(data.state);
        await connectToSession(next);
      }catch(e){setMessages(x=>[e.message,...x].slice(0,4));}
      return;
    }
    if(msg.type==='joinRoom'){
      try{
        const data=await api('/api/join',{name:msg.name,code:String(msg.code||'').toUpperCase()});
        const next={roomCode:String(msg.code||'').toUpperCase(),playerId:data.playerId};
        localStorage.setItem('combine-session',JSON.stringify(next));
        sessionRef.current=next; setSession(next); if(data.state)setState(data.state);
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
        sessionRef.current=next; setSession(next); if(data.state)setState(data.state);
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

export default function App(){
  const {connected,state,session,send,messages,serverOffset}=useGameSocket();
  const [view,setView]=useState('menu');
  const [name,setName]=useState('Player');
  const [roomCode,setRoomCode]=useState('');
  const [settings,setSettings]=useState({targetScore:11,playerSeconds:120,dhappaSeconds:30,direction:'counterclockwise'});
  const [targetPick,setTargetPick]=useState([]); const [selected,setSelected]=useState([]); const [challengeSelected,setChallengeSelected]=useState([]);
  const [showSettings,setShowSettings]=useState(false); const [sound,setSound]=useState(true); const [animations,setAnimations]=useState(true);
  const [expressionError,setExpressionError]=useState('');
  const [localNow,setLocalNow]=useState(Date.now());
  useEffect(()=>{const id=setInterval(()=>setLocalNow(Date.now()),100);return()=>clearInterval(id)},[]);
  const clockNow=localNow+serverOffset;
  const me=state?.players?.find(p=>p.id===state.me); const active=state?.players?.find(p=>p.id===state.roundState?.activeId); const isMyTurn=!!me&&!!active&&me.id===active.id;
  const challengeTarget=state?.dhappa?state.players.find(p=>p.id===state.dhappa.targetId):null;
  const caller=state?.dhappa?state.players.find(p=>p.id===state.dhappa.callerId):null;
  const sorted=[...(state?.players||[])].sort((a,b)=>b.score-a.score);
  function displayRemaining(p){
    if(!p||!state?.roundState) return 0;
    if(p.id===state.roundState.activeId && state.roundState.turnDeadlineAt && state.phase==='turn' && !state.dhappa){
      return Math.max(0,(state.roundState.turnDeadlineAt-clockNow)/1000);
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

  async function createRoom(){await send({type:'createRoom',name,settings});}
  async function joinRoom(){await send({type:'joinRoom',code:roomCode.trim().toUpperCase(),name});}
  async function startGame(){await send({type:'startGame'});}
  function act(type,payload={}){send({type,...payload})}
  function toggleSelected(i){setSelected(s=>s.includes(i)?s.filter(x=>x!==i):[...s,i])}
  function toggleChallenge(i){setChallengeSelected(s=>s.includes(i)?s.filter(x=>x!==i):[...s,i])}
  function undoSelected(){setSelected(s=>s.slice(0,-1));setExpressionError('')}
  function clearSelected(){setSelected([]);setExpressionError('')}
  function undoChallenge(){setChallengeSelected(s=>s.slice(0,-1));setExpressionError('')}
  function clearChallenge(){setChallengeSelected([]);setExpressionError('')}
  function submitExpression(indices,targetHand){const cards=indices.map(i=>targetHand[i]);const value=evalLocal(cards); if(value===null){setExpressionError('Invalid expression. Use at least one number and one operator.');return false} if(Math.abs(value-(state.roundState.target))>1e-9){setExpressionError(`Expression = ${value}; target = ${state.roundState.target}.`);return false}setExpressionError('');return true}

  if(view==='menu') return <>
    {messages.length>0&&<div className="toast menuToast">{messages[0]}</div>}
    <Menu name={name} setName={setName} roomCode={roomCode} setRoomCode={setRoomCode} onCreate={createRoom} onJoin={joinRoom} onResume={()=>{connectResume(send,session)}} connected={connected} hasSession={!!session} savedRoom={session?.roomCode} settings={settings} setSettings={setSettings} onSettings={()=>setShowSettings(true)} />
    {showSettings&&<Settings settings={settings} sound={sound} setSound={setSound} animations={animations} setAnimations={setAnimations} onClose={()=>setShowSettings(false)} />}
  </>;
  if(view==='lobby') return <Lobby state={state} me={me} onStart={startGame} onLeave={()=>act('leaveRoom')} />;
  if(view==='roundSummary') return <Summary state={state} onNext={()=>{if(me?.id===state.hostPlayerId)act('nextRound')}} />;
  if(view==='gameOver') return <GameOver state={state} />;

  return <div className={`app ${animations?'':'no-anim'}`}>
    <header className="topbar"><div className="brand">COMBINE <span>ONLINE</span></div><div className="roomtag">ROOM <b>{state?.code}</b></div><div className="topBtns"><button onClick={()=>setShowSettings(true)}>⚙ SETTINGS</button></div></header>
    {messages.length>0&&<div className="toast">{messages[0]}</div>}
    <main className="game">
      <section className="board">
        <div className="roundInfo">ROUND {state.round} · GLOBAL TARGET <b>{state.settings.targetScore}</b></div>
        <div className="targetCard"><span>ROUND TARGET</span><strong>{state.roundState.target}</strong><small>{state.roundState.targetCards.join(' + ')}</small></div>
        <div className="activeLine"><div className="activeName" style={{color:active?.color}}>{active?.name?.toUpperCase()}'S TURN</div><div className="bigTimer">{formatTime(displayRemaining(active))}</div></div>
        <div className="decks">
          <button className="deck number" disabled={!isMyTurn||state.roundState.drawnThisTurn||!state.roundState.numberCardsLeft} onClick={()=>act('draw',{deck:'number'})}><span>NUMBER</span><b>DRAW</b><small>{state.roundState.numberCardsLeft} LEFT</small></button>
          <button className="deck operator" disabled={!isMyTurn||state.roundState.drawnThisTurn||!state.roundState.operatorCardsLeft} onClick={()=>act('draw',{deck:'operator'})}><span>OPERATOR</span><b>DRAW</b><small>{state.roundState.operatorCardsLeft} LEFT</small></button>
        </div>
        <div className="handWrap">
          <div className="sectionHead"><span>{me?.name?.toUpperCase()}'S PUBLIC HAND</span><span>{me?.hand?.length||0} CARDS · {state.roundState.drawnThisTurn?'DRAW COMPLETE':'DRAW ONE'}</span></div>
          <div className="hand">{me?.hand?.map((c,i)=><button key={i} disabled={!isMyTurn||!!state.dhappa} onClick={()=>toggleSelected(i)} className={`card ${/\d/.test(c)?'num':'op'} ${selected.includes(i)?'sel':''}`}>{c}</button>)}{!me?.hand?.length&&<div className="empty">No cards yet.</div>}</div>
          <div className="expression"><span>{selected.length?selected.map(i=>me.hand[i]).join(' '):'SELECT CARDS TO BUILD'}</span><div className="exprActions"><button className="smallBtn" disabled={!selected.length} onClick={undoSelected}>UNDO</button><button className="smallBtn" disabled={!selected.length} onClick={clearSelected}>CLEAR</button><button disabled={!isMyTurn||!state.roundState.drawnThisTurn||!!state.dhappa||!selected.length} onClick={()=>{setExpressionError('');act('attempt')}}>ATTEMPT</button></div></div>
          {selected.length>0&&<div className={`liveResult ${evalLocal(selected.map(i=>me.hand[i]))===null?'bad':''}`}>
            {evalLocal(selected.map(i=>me.hand[i]))===null ? 'INVALID EXPRESSION' : `= ${evalLocal(selected.map(i=>me.hand[i]))}`}
          </div>}
          {expressionError&&<div className="err">{expressionError}</div>}
        </div>
        <div className="publicTable">
          <div className="sectionHead"><span>ALL PUBLIC HANDS</span><span>EVERY PLAYER CAN SEE EVERY CARD</span></div>
          <div className="publicHands">
            {state.players.map(p=><div className={`publicPlayer ${p.id===active?.id?'isActive':''} ${!p.alive?'isOut':''}`} key={p.id}>
              <div className="publicPlayerHead"><span><i style={{background:p.color}}></i><b>{p.name}</b>{p.id===active?.id?' · PLAYING':''}</span><em>{p.hand.length} CARDS</em></div>
              <div className="publicCards">{p.hand.length?p.hand.map((c,i)=><span key={i} className={`miniCard ${/\d/.test(c)?'num':'op'}`}>{c}</span>):<span className="noCards">EMPTY</span>}</div>
            </div>)}
          </div>
        </div>
        <div className="controls">
          <button className="pass" disabled={!isMyTurn||!state.roundState.drawnThisTurn||!!state.dhappa} onClick={()=>{setSelected([]);act('pass')}}>PASS</button>
          <button className="attempt" disabled={!isMyTurn||!state.roundState.drawnThisTurn||!!state.dhappa} onClick={()=>{setChallengeSelected([]);setExpressionError('');act('attempt')}}>ATTEMPT</button>
          <button className="dhappa" disabled={!isMyTurn||state.players.filter(p=>p.alive&&p.id!==me.id).length===0||!!state.dhappa} onClick={()=>{setTargetPick(state.players.filter(p=>p.alive&&p.id!==me.id).map(p=>p.id));setSelected([]);setExpressionError('')}}>DHAPPA</button>
        </div>
        {targetPick.length>0&&<div className="chooser"><div className="chooserTitle">CALL OUT A PLAYER</div>{state.players.filter(p=>p.alive&&p.id!==me.id).map(p=><button key={p.id} onClick={()=>{setTargetPick([]);act('dhappa',{targetId:p.id})}}><span style={{background:p.color}}></span>{p.name}<b>30s</b></button>)}<button className="cancel" onClick={()=>setTargetPick([])}>CANCEL</button></div>}
      </section>
      <aside className="scoreboard"><div className="scoreTitle"><span>SCOREBOARD</span><span>ROUND {state.round}</span></div>{sorted.map(p=><div className={`score ${p.id===active?.id?'active':''} ${!p.alive?'out':''}`} key={p.id}><i style={{background:p.color}}></i><div><b>{p.name}</b><small>{p.alive?formatTime(displayRemaining(p)):'OUT'} · ROUND +{p.roundScore}</small></div><strong>{p.score}</strong></div>)}<div className="events">{(state.roundState.events||[]).slice(-8).reverse().map((e,i)=><div key={i}><b>{state.players.find(p=>p.id===e.playerId)?.name||'Player'}</b><span>{e.type==='win'?'WON':e.type==='kick'?'KICKED':e.type.toUpperCase()}</span><em>{e.points>0?`+${e.points}`:'0'}</em></div>)}</div></aside>
    </main>

    {state.dhappa&&<ChallengeModal state={state} now={clockNow} dhappaRemaining={dhappaRemaining} me={me} target={challengeTarget} caller={caller} selection={challengeSelected} onToggle={toggleChallenge} onUndo={undoChallenge} onClear={clearChallenge} onSubmit={()=>{setExpressionError('');act('submitExpression',{tokens:challengeSelected.map(index=>({index}))})}} onKick={()=>act('kick')} onCancel={(reason)=>{if(reason==='fail')act('failChallenge');else act('cancelChallenge')}} />}
    {showSettings&&<Settings settings={state?.settings||settings} sound={sound} setSound={setSound} animations={animations} setAnimations={setAnimations} onClose={()=>setShowSettings(false)} />}
  </div>
}

async function connectResume(send,session){if(session?.roomCode&&session?.playerId){await send({type:'rejoinRoom',code:session.roomCode,playerId:session.playerId});}}
function Menu({name,setName,roomCode,setRoomCode,onCreate,onJoin,onResume,connected,hasSession,savedRoom,settings,setSettings,onSettings}){return <div className="menu"><div className="menuPanel"><div className="logo">COMBINE</div><div className="tag">MATH · CARDS · CHAOS</div><div className="conn">● {connected?'SERVER CONNECTED':'READY TO CONNECT'}</div><label>YOUR NAME<input value={name} maxLength={20} onChange={e=>setName(e.target.value)}/></label><button className="primary" onClick={onCreate}>HOST GAME</button>{hasSession&&<button className="secondary resumeBtn" onClick={onResume}>RESUME ROOM · {savedRoom}</button>}<div className="joinRow"><input placeholder="ROOM CODE" value={roomCode} onChange={e=>setRoomCode(e.target.value.toUpperCase())}/><button onClick={onJoin}>JOIN</button></div><button className="secondary" onClick={onSettings}>SETTINGS</button><div className="menuHelp">Host creates a room. Everyone joins with the same six-character code.</div></div></div>}
function Lobby({state,me,onStart,onLeave}){
  const [qr,setQr]=useState('');
  const [copied,setCopied]=useState(false);
  const joinUrl=`${location.origin}/?room=${encodeURIComponent(state.code)}`;
  useEffect(()=>{QRCode.toDataURL(joinUrl,{width:260,margin:2,errorCorrectionLevel:'M'}).then(setQr).catch(()=>setQr(''));},[joinUrl]);
  async function copyLink(){try{await navigator.clipboard.writeText(joinUrl);setCopied(true);setTimeout(()=>setCopied(false),1200);}catch{}}
  return <div className="lobby"><div className="lobbyCard"><div className="eyebrow">WAITING ROOM</div><div className="roomBig">{state.code}</div><div className="share">Share the code or scan the QR code to join. No URL typing required.</div>{qr&&<img className="qr" src={qr} alt="Scan to join Combine room" /> }<div className="shareActions"><button className="secondary" onClick={copyLink}>{copied?'COPIED ✓':'COPY JOIN LINK'}</button></div>{state.players.map(p=><div className="lobbyPlayer" key={p.id}><i style={{background:p.color}}></i><b>{p.name}</b>{p.id===state.hostPlayerId&&<span>HOST</span>}{p.id===me?.id&&<small>YOU</small>}</div>)}<button className="primary" disabled={me?.id!==state.hostPlayerId||state.players.length<2} onClick={onStart}>{state.players.length<2?'WAITING FOR PLAYERS':'START GAME →'}</button><button className="link" onClick={onLeave}>LEAVE ROOM</button></div></div>}
function ChallengeModal({state,me,target,caller,selection,onToggle,onUndo,onClear,onSubmit,onCancel}){
  if(!target) return null;
  const mode=state.dhappa?.mode;
  const targetIsMe=target.id===me?.id;
  const callerIsMe=caller?.id===me?.id;
  // In a Dhappa call-out, the CALLER must use the TARGET'S cards to prove
  // that a valid expression can be made. For a normal attempt, the attempting
  // player is the target and therefore uses their own cards.
  const expressionPlayer=target;
  const expressionHand=expressionPlayer?.hand||[];
  const val=evalLocal(selection.map(i=>expressionHand[i]));
  const correct=val!==null&&Math.abs(val-state.roundState.target)<1e-9;
  const canEdit=mode==='callout'?callerIsMe:targetIsMe;
  const title=mode==='callout' ? `CALL ON ${target.name.toUpperCase()}` : 'MAKE THE TARGET';
  const description=mode==='callout'
    ? `${caller?.name} called Dhappa on ${target.name}. ${callerIsMe?'Use their cards to prove a valid expression.':'The caller is using the target player\'s cards.'}`
    : `${target.name} must show an expression hitting ${state.roundState.target}.`;
  return <div className="overlay"><div className="challenge">
    <div className="chHead"><span>DHAPPA!</span><b className={state.dhappa.seconds<=10?'danger':''}>{Math.ceil(dhappaRemaining ?? state.dhappa.seconds)}s</b></div>
    <div className="challengeTitle">{title}</div>
    <p>{description}</p>
    <div className="challengeHelp">Target: <strong>{state.roundState.target}</strong> · Adjacent number cards concatenate.</div>
    {canEdit&&<>
      <div className="challengeHand">{expressionHand.map((c,i)=><button className={`card ${/\d/.test(c)?'num':'op'} ${selection.includes(i)?'sel':''}`} key={i} onClick={()=>onToggle(i)}>{c}</button>)}</div>
      <div className="chExpr">{selection.map(i=>expressionHand[i]).join(' ')||'SELECT CARDS'}</div>
      <div className={`chValue ${correct?'ok':val===null?'bad':''}`}>
        {val===null ? 'INVALID EXPRESSION' : `= ${val}`}
      </div>
      <div className="exprUtility"><button className="smallBtn" disabled={!selection.length} onClick={onUndo}>UNDO</button><button className="smallBtn" disabled={!selection.length} onClick={onClear}>CLEAR</button></div>
      {mode==='callout'
        ? <button className="success" onClick={onSubmit} disabled={!selection.length||!correct}>I WON · KICK {target.name} → +3</button>
        : <button className="success" onClick={onSubmit} disabled={!selection.length||!correct}>I WON · +{PLACE_POINTS[state.roundState.finishCount]??0}</button>}
      {mode==='callout'&&<button className="dangerBtn" onClick={()=>onCancel('fail')}>I FAILED · KICK ME OUT</button>}
      {mode==='attempt'&&<button className="dangerBtn" onClick={()=>onCancel('fail')}>I FAILED · 0 POINTS</button>}
    </>}
    {!canEdit&&<div className="watching">Waiting for <strong>{mode==='callout'?caller?.name:target.name}</strong> to demonstrate the expression.</div>}
    <button className="cancel" onClick={()=>onCancel()}>{callerIsMe?'CANCEL DHAPPA':'CLOSE'}</button>
  </div></div>
}

function Settings({settings,sound,setSound,animations,setAnimations,onClose}){return <div className="overlay"><div className="settings"><div className="setTitle">SETTINGS <button onClick={onClose}>✕</button></div><section><h3>AUDIO</h3><label className="switch"><span>Sound effects</span><input type="checkbox" checked={sound} onChange={e=>setSound(e.target.checked)}/></label></section><section><h3>VIDEO</h3><label className="switch"><span>Animations</span><input type="checkbox" checked={animations} onChange={e=>setAnimations(e.target.checked)}/></label></section><section><h3>GAMEPLAY</h3><div className="grid2"><label>Global target<input type="number" value={settings.targetScore} readOnly/></label><label>Player timer<input value={formatTime(settings.playerSeconds)} readOnly/></label></div><label>Dhappa timer<input value={`${settings.dhappaSeconds}s`} readOnly/></label><label>Turn direction<input value={settings.direction} readOnly/></label></section><button className="primary" onClick={onClose}>DONE</button></div></div>}


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
