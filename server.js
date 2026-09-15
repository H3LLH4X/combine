import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'dist');

const rooms = new Map();
const COLORS = ['#ff5c5c','#ffd447','#61d98a','#55a5ff','#bd7cff','#ff9f43'];
const I_WON_POINTS = [5,3,2,1,1];
const MAX_PLAYERS = 6;
const MIN_PLAYERS = 2;

function shuffle(a){
  const x=[...a];
  for(let i=x.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[x[i],x[j]]=[x[j],x[i]];}
  return x;
}
function roomCode(){
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for(let attempt=0;attempt<100;attempt++){
    let s=''; for(let i=0;i<6;i++) s += alphabet[Math.floor(Math.random()*alphabet.length)];
    if(!rooms.has(s)) return s;
  }
  throw new Error('Could not allocate room code');
}
function makeNumberDeck(){return Array.from({length:10},(_,n)=>String(n)).flatMap(n=>Array(4).fill(n));}
function makeOperatorDeck(){return ['+','-','*','/'].flatMap(op=>Array(4).fill(op));}

function precedence(op){ return op==='+'||op==='-' ? 1 : 2; }
function tokenizeCards(tokens){
  const out=[]; let number='';
  const flush=()=>{ if(number){out.push({type:'num',value:Number(number)}); number='';} };
  for(const t of tokens){
    if(/^\d$/.test(String(t))) number += t;
    else if(['+','-','*','/'].includes(t)){ flush(); out.push({type:'op',value:t}); }
    else if(t==='(' || t===')'){ flush(); out.push({type:t,value:t}); }
    else return null;
  }
  flush();
  return out;
}
function evaluateExpression(tokens){
  const lex=tokenizeCards(tokens || []);
  if(!lex || !lex.some(x=>x.type==='num') || !lex.some(x=>x.type==='op')) return {valid:false,error:'Expression must contain at least one number and one operator.'};
  // Parentheses are inserted/used explicitly by the client as tokens. The cards supplied by the game do not include parentheses,
  // so the standard checker below accepts them only in future/custom deck configurations.
  const vals=[]; const ops=[];
  const apply=()=>{
    if(vals.length<2 || !ops.length) return false;
    const b=vals.pop(), a=vals.pop(), op=ops.pop();
    let v;
    if(op==='+')v=a+b;
    else if(op==='-')v=a-b;
    else if(op==='*')v=a*b;
    else { if(b===0) return false; v=a/b; }
    vals.push(v); return Number.isFinite(v);
  };
  let expectNumber=true;
  for(const t of lex){
    if(t.type==='num'){
      if(!expectNumber) return {valid:false,error:'Two numbers need an operator between them unless they are adjacent cards.'};
      vals.push(t.value); expectNumber=false;
    } else if(t.type==='op'){
      if(expectNumber) return {valid:false,error:'Expression cannot start with an operator.'};
      while(ops.length && precedence(ops[ops.length-1])>=precedence(t.value)) if(!apply()) return {valid:false,error:'Invalid expression.'};
      ops.push(t.value); expectNumber=true;
    } else return {valid:false,error:'Unsupported token.'};
  }
  if(expectNumber) return {valid:false,error:'Expression cannot end with an operator.'};
  while(ops.length) if(!apply()) return {valid:false,error:'Invalid expression.'};
  if(vals.length!==1 || !Number.isFinite(vals[0])) return {valid:false,error:'Invalid expression.'};
  return {valid:true,value:vals[0]};
}

class Room{
  constructor(hostName, settings){
    this.code=roomCode();
    this.settings={
      targetScore: Math.max(1, Number(settings?.targetScore || 11)),
      playerSeconds: Math.max(1, Number(settings?.playerSeconds || 120)),
      dhappaSeconds: Math.max(5, Number(settings?.dhappaSeconds || 30)),
      direction: settings?.direction==='clockwise'?'clockwise':'counterclockwise'
    };
    this.phase='lobby';
    this.hostPlayerId=null;
    this.players=[];
    this.round=0;
    this.roundState=null;
    this.roundHistory=[];
    this.numberDeck=[];
    this.operatorDeck=[];
    this.dhappa=null;
    this.connections=new Map();
    this.lastTick=Date.now();
    this.addPlayer(hostName,true);
  }
  addPlayer(name,isHost=false){
    if(this.players.length>=MAX_PLAYERS) throw new Error('Room is full');
    const id=cryptoRandomId();
    const p={id,name:(String(name||'Player').trim().slice(0,20)||`Player ${this.players.length+1}`),color:COLORS[this.players.length],score:0,roundScore:0,alive:true,hand:[],remainingTime:this.settings.playerSeconds};
    this.players.push(p);
    if(isHost){this.hostPlayerId=id;}
    return p;
  }
  removeConnection(id, ws){ if(!ws || this.connections.get(id)===ws) this.connections.delete(id); }
  resetRoundDecks(){
    this.lastTick=Date.now();
    this.numberDeck=shuffle(makeNumberDeck());
    this.operatorDeck=shuffle(makeOperatorDeck());
    const a=this.numberDeck.shift(); const b=this.numberDeck.shift();
    this.roundState={
      target:Number(`${a}${b}`),
      targetCards:[a,b],
      activeId:null,
      drawnThisTurn:false,
      finishCount:0,
      events:[]
    };
    this.players.forEach(p=>{p.alive=true;p.roundScore=0;p.hand=[];p.remainingTime=this.settings.playerSeconds;});
    const starter=this.players[Math.floor(Math.random()*this.players.length)];
    this.roundState.activeId=starter.id;
  }
  startGame(){
    if(this.players.length<MIN_PLAYERS) throw new Error('At least 2 players are required');
    this.players.forEach(p=>{p.score=0});
    this.round=1;
    this.phase='turn';
    this.resetRoundDecks();
    this.dhappa=null;
  }
  startNextRound(){
    this.round += 1;
    this.phase='turn';
    this.resetRoundDecks();
    this.dhappa=null;
  }
  alive(){return this.players.filter(p=>p.alive);}
  active(){return this.players.find(p=>p.id===this.roundState?.activeId && p.alive);}
  player(id){return this.players.find(p=>p.id===id);}
  addEvent(e){this.roundState.events.push({...e,ts:Date.now()});}
  awardRoundWin(p){
    const pts=I_WON_POINTS[this.roundState.finishCount] ?? 0;
    this.roundState.finishCount += 1;
    p.roundScore += pts;
    this.addEvent({type:'win',playerId:p.id,points:pts});
    return pts;
  }
  awardKick(caller,target){
    caller.roundScore += 3;
    this.addEvent({type:'kick',playerId:caller.id,targetId:target.id,points:3});
  }
  eliminateAndAdvance(targetId, advanceFromId){
    const target=this.player(targetId); if(!target) return {roundEnded:false};
    target.alive=false;
    const survivors=this.alive();
    if(survivors.length===1){
      const last=survivors[0];
      this.addEvent({type:'last',playerId:last.id,points:0});
      this.finishRound();
      return {roundEnded:true};
    }
    const ids=survivors.map(p=>p.id);
    const base=ids.indexOf(advanceFromId);
    let pos=base;
    if(base<0){
      const oldIdx=this.players.findIndex(p=>p.id===advanceFromId);
      pos=ids.findIndex(id=>this.players.findIndex(p=>p.id===id)>oldIdx);
      if(pos<0) pos=0;
    } else {
      const step=this.settings.direction==='clockwise'?1:-1;
      pos=(base+step+ids.length)%ids.length;
    }
    this.roundState.activeId=ids[pos];
    this.roundState.drawnThisTurn=false;
    return {roundEnded:false};
  }
  finishRound(){
    // Round points become cumulative only here.
    for(const p of this.players) p.score += p.roundScore;
    const standings=[...this.players].sort((a,b)=>b.score-a.score);
    this.roundHistory.push({round:this.round, target:this.roundState.target, scores:this.players.map(p=>({id:p.id,roundScore:p.roundScore,total:p.score}))});
    const winner=standings.find(p=>p.score>=this.settings.targetScore);
    if(winner){
      this.phase='gameOver';
      this.winnerId=winner.id;
    } else {
      this.phase='roundSummary';
    }
  }
  serialize(viewerId){
    return {
      code:this.code, phase:this.phase, round:this.round, hostPlayerId:this.hostPlayerId,
      settings:this.settings, winnerId:this.winnerId||null,
      players:this.players.map(p=>({id:p.id,name:p.name,color:p.color,score:p.score,roundScore:p.roundScore,alive:p.alive,hand:p.hand,remainingTime:p.remainingTime})),
      roundState:this.roundState ? {target:this.roundState.target,targetCards:this.roundState.targetCards,activeId:this.roundState.activeId,drawnThisTurn:this.roundState.drawnThisTurn,finishCount:this.roundState.finishCount,events:this.roundState.events.slice(-30),numberCardsLeft:this.numberDeck.length,operatorCardsLeft:this.operatorDeck.length}:null,
      dhappa:this.dhappa ? {...this.dhappa}:null,
      me:viewerId
    };
  }
}
function cryptoRandomId(){ return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}-${Math.random().toString(36).slice(2,10)}`; }

function send(ws,obj){if(ws.readyState===ws.OPEN) ws.send(JSON.stringify(obj));}
function broadcast(room){
  for(const [id,ws] of room.connections){
    if(ws.readyState===ws.OPEN) send(ws,{type:'state',state:room.serialize(id)});
  }
}
function error(ws,message){send(ws,{type:'error',message});}
function findRoom(code){return code && rooms.get(String(code).toUpperCase());}

function handleAction(ws, session, msg){
  if(msg.type==='createRoom'){
    if(session.room) return error(ws,'Already in a room.');
    try{
      const room=new Room(msg.name,msg.settings);
      rooms.set(room.code,room);
      const p=room.player(room.hostPlayerId);
      room.connections.set(p.id,ws); session.room=room; session.playerId=p.id;
      send(ws,{type:'joined',roomCode:room.code,playerId:p.id,host:true,state:room.serialize(p.id)}); broadcast(room);
    }catch(e){error(ws,e.message)}
    return;
  }
  if(msg.type==='joinRoom'){
    if(session.room) return error(ws,'Already in a room.');
    const room=findRoom(msg.code); if(!room)return error(ws,`Room not found: ${String(msg.code||'').toUpperCase()}`);
    if(room.phase!=='lobby')return error(ws,'That game has already started.');
    try{
      const p=room.addPlayer(msg.name,false); room.connections.set(p.id,ws); session.room=room; session.playerId=p.id;
      send(ws,{type:'joined',roomCode:room.code,playerId:p.id,host:false,state:room.serialize(p.id)}); broadcast(room);
    }catch(e){error(ws,e.message)}
    return;
  }
  if(msg.type==='rejoinRoom'){
    if(session.room) return error(ws,'Already in a room.');
    const room=findRoom(msg.code); if(!room)return error(ws,`Room not found: ${String(msg.code||'').toUpperCase()}`);
    const p=room.player(msg.playerId); if(!p)return error(ws,'Player session not found.');
    room.connections.set(p.id,ws); session.room=room; session.playerId=p.id;
    send(ws,{type:'joined',roomCode:room.code,playerId:p.id,host:p.id===room.hostPlayerId,rejoined:true,state:room.serialize(p.id)});
    broadcast(room); return;
  }
  const room=session.room; if(!room)return error(ws,'Join or create a room first.');
  const actor=room.player(session.playerId);
  if(!actor)return error(ws,'Player session not found.');
  if(msg.type==='startGame'){
    if(actor.id!==room.hostPlayerId)return error(ws,'Only the host can start the game.');
    if(room.players.length<2)return error(ws,'Need at least 2 players.');
    try{room.startGame();broadcast(room);}catch(e){error(ws,e.message)} return;
  }
  if(msg.type==='nextRound') {
    if(actor.id!==room.hostPlayerId)return error(ws,'Only the host can start the next round.');
    if(room.phase!=='roundSummary')return error(ws,'The room is not waiting for a next round.');
    room.startNextRound(); broadcast(room); return;
  }
  if(msg.type==='leaveRoom'){
    actor.alive=false; room.removeConnection(actor.id); send(ws,{type:'left'}); return;
  }
  if(room.phase!=='turn') return error(ws,'The game is not accepting turn actions.');
  const active=room.active();
  if(!active)return error(ws,'No active player.');
  if(msg.type==='draw'){
    if(actor.id!==active.id)return error(ws,'It is not your turn.');
    if(room.roundState.drawnThisTurn)return error(ws,'You can draw only one card per turn.');
    const deck=msg.deck==='operator'?room.operatorDeck:room.numberDeck;
    if(!deck.length)return error(ws,'That deck is empty.');
    const card=deck.shift(); actor.hand.push(card); room.roundState.drawnThisTurn=true; room.addEvent({type:'draw',playerId:actor.id,deck:msg.deck,card}); broadcast(room); return;
  }
  if(msg.type==='pass'){
    if(actor.id!==active.id)return error(ws,'It is not your turn.');
    if(!room.roundState.drawnThisTurn)return error(ws,'Draw exactly one card before passing.');
    const survivors=room.alive(); const ids=survivors.map(p=>p.id); const pos=ids.indexOf(actor.id); const step=room.settings.direction==='clockwise'?1:-1;
    room.roundState.activeId=ids[(pos+step+ids.length)%ids.length]; room.roundState.drawnThisTurn=false; broadcast(room); return;
  }
  if(msg.type==='attempt'){
    if(actor.id!==active.id)return error(ws,'It is not your turn.');
    if(!room.roundState.drawnThisTurn)return error(ws,'Draw exactly one card before attempting.');
    room.dhappa={mode:'attempt',targetId:actor.id,callerId:actor.id,seconds:room.settings.dhappaSeconds,startedAt:Date.now()};
    broadcast(room); return;
  }
  if(msg.type==='dhappa'){
    if(actor.id!==active.id)return error(ws,'It is not your turn.');
    const target=room.player(msg.targetId);
    if(!target||!target.alive||target.id===actor.id)return error(ws,'Choose another living player.');
    room.dhappa={mode:'callout',targetId:target.id,callerId:actor.id,seconds:room.settings.dhappaSeconds,startedAt:Date.now()};
    broadcast(room); return;
  }
  if(msg.type==='submitExpression'){
    if(!room.dhappa)return error(ws,'No active expression challenge.');
    const mode=room.dhappa.mode;
    // For a Dhappa call-out, the CALLER proves the claim using the TARGET'S cards.
    // For a normal attempt, the attempting player proves it using their own cards.
    const expressionPlayerId=room.dhappa.targetId;
    const submittingPlayerId=mode==='callout'?room.dhappa.callerId:room.dhappa.targetId;
    if(actor.id!==submittingPlayerId)return error(ws,'Only the player resolving this expression may submit it.');
    const expressionPlayer=room.player(expressionPlayerId);
    const indices=Array.isArray(msg.indices)?msg.indices:[];
    const tokens=[];
    for(const idx of indices){ if(!Number.isInteger(idx)||idx<0||idx>=expressionPlayer.hand.length)return error(ws,'Invalid card selection.'); tokens.push(expressionPlayer.hand[idx]); }
    const evald=evaluateExpression(tokens);
    if(!evald.valid || Math.abs(evald.value-room.roundState.target)>1e-9)return error(ws,evald.valid?`Expression equals ${evald.value}, target is ${room.roundState.target}.`:evald.error);
    const callerId=room.dhappa.callerId;
    const targetId=room.dhappa.targetId;
    room.dhappa=null;
    room.roundState.drawnThisTurn=false;
    if(mode==='callout'){
      // Successful call-out demonstration: caller immediately earns +3 and the called-out player is eliminated.
      const caller=room.player(callerId);
      const target=room.player(targetId);
      if(!caller||!caller.alive||!target||!target.alive)return error(ws,'The Dhappa target is no longer available.');
      room.awardKick(caller,target);
      const res=room.eliminateAndAdvance(target.id,caller.id);
      if(res.roundEnded){ broadcast(room); return; }
      broadcast(room); return;
    }
    room.awardRoundWin(expressionPlayer);
    const res=room.eliminateAndAdvance(expressionPlayer.id,expressionPlayer.id);
    if(res.roundEnded){ broadcast(room); return; }
    broadcast(room); return;
  }
  if(msg.type==='failChallenge'){
    if(!room.dhappa)return error(ws,'No active expression challenge.');
    const mode=room.dhappa.mode;
    const expressionPlayerId=mode==='callout'?room.dhappa.callerId:room.dhappa.targetId;
    if(actor.id!==expressionPlayerId)return error(ws,'Only the caller/attempting player can fail the challenge.');
    const failed=room.player(expressionPlayerId);
    room.dhappa=null; room.roundState.drawnThisTurn=false;
    room.addEvent({type:'failed',playerId:failed.id,points:0});
    const res=room.eliminateAndAdvance(failed.id,failed.id);
    broadcast(room); return;
  }
  if(msg.type==='kick'){
    if(!room.dhappa || room.dhappa.mode!=='callout')return error(ws,'There is no active Dhappa callout.');
    if(actor.id!==room.dhappa.callerId)return error(ws,'Only the caller can resolve this kick.');
    const target=room.player(room.dhappa.targetId); if(!target||!target.alive)return error(ws,'Target is no longer available.');
    room.dhappa=null; room.roundState.drawnThisTurn=false; room.awardKick(actor,target);
    const res=room.eliminateAndAdvance(target.id,actor.id);
    broadcast(room); return;
  }
  if(msg.type==='cancelChallenge'){
    if(!room.dhappa)return;
    if(actor.id!==room.dhappa.callerId)return error(ws,'Only the caller can cancel.');
    room.dhappa=null; broadcast(room); return;
  }
  error(ws,'Unknown action.');
}

function tickRooms(){
  const now=Date.now();
  for(const room of rooms.values()){
    if(room.phase!=='turn')continue;
    const active=room.active(); if(!active)continue;
    if(room.dhappa){
      const rem=Math.max(0,room.settings.dhappaSeconds-Math.floor((now-room.dhappa.startedAt)/1000));
      room.dhappa.seconds=rem;
      if(rem<=0){
        const target=room.player(room.dhappa.targetId); const caller=room.player(room.dhappa.callerId); const mode=room.dhappa.mode;
        room.dhappa=null;
        if(target&&target.alive){
          if(mode==='callout'){
            // Caller failed to prove the call-out within the allotted time.
            const failed=caller && caller.alive ? caller : target;
            room.addEvent({type:'timeout',playerId:failed.id,points:0});
            const res=room.eliminateAndAdvance(failed.id,failed.id);
            if(res.roundEnded){broadcast(room);continue;}
          } else if(mode==='attempt'){
            room.addEvent({type:'timeout',playerId:target.id,points:0});
            const res=room.eliminateAndAdvance(target.id,target.id);
            if(res.roundEnded){broadcast(room);continue;}
          }
        }
        broadcast(room);
      } else broadcast(room);
      continue;
    }
    // Main turn timer: server authoritative.
    if(now-room.lastTick>=1000){
      const delta=Math.floor((now-room.lastTick)/1000); room.lastTick += delta*1000; active.remainingTime=Math.max(0,active.remainingTime-delta);
      if(active.remainingTime<=0){
        room.addEvent({type:'timeout',playerId:active.id,points:0});
        const res=room.eliminateAndAdvance(active.id,active.id); if(res.roundEnded){broadcast(room);continue;}
      }
      broadcast(room);
    }
  }
}
setInterval(tickRooms,250);

function getLanIPv4(){
  const nets=os.networkInterfaces();
  for(const entries of Object.values(nets)){
    for(const net of entries||[]){
      if(net.family==='IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

const server=http.createServer((req,res)=>{
  if(req.url==='/health'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true,rooms:rooms.size}));return;}
  if(req.url==='/lan-info'){res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({ip:getLanIPv4(),port:PORT}));return;}
  const url=new URL(req.url,'http://localhost');
  let file=url.pathname==='/'?'/index.html':url.pathname;
  const fp=path.normalize(path.join(PUBLIC_DIR,file));
  if(!fp.startsWith(PUBLIC_DIR)){res.writeHead(403);res.end('Forbidden');return;}
  fs.readFile(fp,(err,data)=>{
    if(err){res.writeHead(404);res.end('Not found');return;}
    const ext=path.extname(fp);const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
    res.writeHead(200,{'content-type':types[ext]||'application/octet-stream'});res.end(data);
  });
});
const wss=new WebSocketServer({server,path:'/ws'});
wss.on('connection',(ws)=>{
  ws.isAlive=true;
  ws.on('pong',()=>{ws.isAlive=true;});
  const session={room:null,playerId:null};
  ws.on('message',raw=>{try{handleAction(ws,session,JSON.parse(raw.toString()))}catch(e){error(ws,e.message||'Malformed message')}});
  ws.on('close',()=>{if(session.room&&session.playerId){session.room.removeConnection(session.playerId,ws);broadcast(session.room)}});
});
const heartbeat=setInterval(()=>{
  for(const ws of wss.clients){
    if(ws.isAlive===false){ws.terminate();continue;}
    ws.isAlive=false; ws.ping();
  }
},25000);
heartbeat.unref?.();
server.listen(PORT,HOST,()=>console.log(`Combine server listening on http://${HOST}:${PORT}`));
