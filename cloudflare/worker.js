import { DurableObject } from 'cloudflare:workers';

const MAX_PLAYERS = 6;
const MIN_PLAYERS = 2;
const COLORS = ['#ff5c5c','#ffd447','#61d98a','#55a5ff','#bd7cff','#ff9f43'];
const I_WON_POINTS = [5,3,2,1,1];
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...CORS, ...extra }
  });
}

function cryptoId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function roomCode() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => ROOM_ALPHABET[b % ROOM_ALPHABET.length]).join('');
}

function shuffle(a) {
  const x = [...a];
  for (let i=x.length-1;i>0;i--) {
    const j = Math.floor(Math.random()*(i+1));
    [x[i],x[j]]=[x[j],x[i]];
  }
  return x;
}

function makeNumberDeck() {
  return Array.from({length:10}, (_, n) => String(n)).flatMap(n => Array(4).fill(n));
}

function makeOperatorDeck() {
  return ['+','-','*','/'].flatMap(op => Array(4).fill(op));
}

function precedence(op) { return (op === '+' || op === '-') ? 1 : 2; }

function tokenizeCards(tokens) {
  const out = [];
  let number = '';
  const flush = () => {
    if (number) {
      out.push({type:'num', value:Number(number)});
      number = '';
    }
  };
  for (const raw of (tokens || [])) {
    const t = String(raw);
    if (/^\d$/.test(t)) number += t;
    else if (['+','-','*','/'].includes(t)) {
      flush(); out.push({type:'op', value:t});
    } else if (t === '(' || t === ')') {
      flush(); out.push({type:t, value:t});
    } else return null;
  }
  flush();
  return out;
}

// Finalized Combine rules: adjacent number cards concatenate; standard BEDMAS;
// parentheses are free and may be used without a card cost.
function evaluateExpression(tokens) {
  const lex = tokenizeCards(tokens || []);
  if (!lex || !lex.length) return {valid:false,error:'No expression.'};
  if (!lex.some(x => x.type === 'num') || !lex.some(x => x.type === 'op')) {
    return {valid:false,error:'Expression must contain at least one number and one operator.'};
  }

  const values = [];
  const ops = [];
  let expectValue = true;
  let depth = 0;
  const apply = () => {
    if (values.length < 2 || !ops.length) return false;
    const b = values.pop();
    const a = values.pop();
    const op = ops.pop();
    let v;
    if (op === '+') v = a + b;
    else if (op === '-') v = a - b;
    else if (op === '*') v = a * b;
    else {
      if (b === 0) return false;
      v = a / b;
    }
    if (!Number.isFinite(v)) return false;
    values.push(v);
    return true;
  };

  for (const t of lex) {
    if (t.type === 'num') {
      if (!expectValue) return {valid:false,error:'Two number groups need an operator unless their number cards are adjacent.'};
      values.push(t.value);
      expectValue = false;
    } else if (t.type === 'op') {
      if (expectValue) return {valid:false,error:'Operator cannot appear here.'};
      while (ops.length && ops.at(-1) !== '(' && precedence(ops.at(-1)) >= precedence(t.value)) {
        if (!apply()) return {valid:false,error:'Invalid expression.'};
      }
      ops.push(t.value);
      expectValue = true;
    } else if (t.type === '(') {
      if (!expectValue) return {valid:false,error:'An opening parenthesis must follow an operator or start the expression.'};
      ops.push('(');
      depth += 1;
    } else if (t.type === ')') {
      if (expectValue || depth <= 0) return {valid:false,error:'Unbalanced parentheses.'};
      while (ops.length && ops.at(-1) !== '(') {
        if (!apply()) return {valid:false,error:'Invalid expression.'};
      }
      if (ops.at(-1) !== '(') return {valid:false,error:'Unbalanced parentheses.'};
      ops.pop();
      depth -= 1;
      expectValue = false;
    }
  }
  if (expectValue) return {valid:false,error:'Expression cannot end with an operator.'};
  if (depth !== 0) return {valid:false,error:'Unbalanced parentheses.'};
  while (ops.length) {
    if (ops.at(-1) === '(') return {valid:false,error:'Unbalanced parentheses.'};
    if (!apply()) return {valid:false,error:'Invalid expression.'};
  }
  if (values.length !== 1 || !Number.isFinite(values[0])) return {valid:false,error:'Invalid expression.'};
  return {valid:true,value:values[0]};
}

export class CombineRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.room = null;
  }

  async load() {
    if (this.room) return this.room;
    this.room = await this.ctx.storage.get('room');
    return this.room;
  }

  async save() {
    await this.ctx.storage.put('room', this.room);
  }

  player(id) { return this.room?.players.find(p => p.id === id); }
  alive() { return this.room?.players.filter(p => p.alive) || []; }
  active() { return this.player(this.room?.roundState?.activeId); }

  async initialize(hostName, settings, code) {
    await this.load();
    if (this.room) return json({error:'Room already exists.'}, 409);
    this.room = {
      phase: 'lobby',
      hostPlayerId: null,
      players: [],
      round: 0,
      settings: {
        targetScore: Math.max(1, Number(settings?.targetScore || 11)),
        playerSeconds: Math.max(1, Number(settings?.playerSeconds || 120)),
        dhappaSeconds: Math.max(5, Number(settings?.dhappaSeconds || 30)),
        direction: settings?.direction === 'clockwise' ? 'clockwise' : 'counterclockwise'
      },
      roundState: null,
      roundHistory: [],
      numberDeck: [],
      operatorDeck: [],
      dhappa: null,
      winnerId: null,
      createdAt: Date.now(),
      turnStartedAt: null,
      code: String(code || '').toUpperCase()
    };
    const p = this.addPlayer(hostName);
    this.room.hostPlayerId = p.id;
    await this.save();
    return json({ok:true, playerId:p.id, state:this.serialize(p.id)});
  }

  addPlayer(name) {
    if (this.room.players.length >= MAX_PLAYERS) throw new Error('Room is full.');
    const p = {
      id: cryptoId(),
      name: String(name || 'Player').trim().slice(0,20) || `Player ${this.room.players.length+1}`,
      color: COLORS[this.room.players.length],
      score: 0,
      roundScore: 0,
      alive: true,
      hand: [],
      remainingTime: this.room.settings.playerSeconds
    };
    this.room.players.push(p);
    return p;
  }

  async beginRound(number) {
    this.room.round = number;
    this.room.phase = 'turn';
    this.room.numberDeck = shuffle(makeNumberDeck());
    this.room.operatorDeck = shuffle(makeOperatorDeck());
    const a = this.room.numberDeck.shift();
    const b = this.room.numberDeck.shift();
    this.room.roundState = {
      target: Number(`${a}${b}`),
      targetCards: [a,b],
      activeId: null,
      drawnThisTurn: false,
      finishCount: 0,
      events: []
    };
    for (const p of this.room.players) {
      p.alive = true;
      p.roundScore = 0;
      p.hand = [];
      p.remainingTime = this.room.settings.playerSeconds;
    }
    const starter = this.room.players[Math.floor(Math.random()*this.room.players.length)];
    this.room.roundState.activeId = starter.id;
    this.room.turnStartedAt = Date.now();
    this.room.dhappa = null;
    await this.persistAndSchedule();
  }

  effectiveRemaining(player, now=Date.now()) {
    if (!player) return 0;
    if (this.room.phase !== 'turn' || this.room.dhappa || !this.room.turnStartedAt || this.room.roundState?.activeId !== player.id) {
      return Math.max(0, player.remainingTime);
    }
    return Math.max(0, player.remainingTime - Math.max(0, now-this.room.turnStartedAt)/1000);
  }

  async syncMainTimer(now=Date.now()) {
    if (this.room.phase !== 'turn' || this.room.dhappa) return false;
    const active = this.active();
    if (!active || !this.room.turnStartedAt) return false;
    const remaining = this.effectiveRemaining(active, now);
    if (remaining <= 0) {
      active.remainingTime = 0;
      this.addEvent({type:'timeout', playerId:active.id, points:0});
      await this.eliminateAndAdvance(active.id, active.id, false);
      return true;
    }
    active.remainingTime = remaining;
    this.room.turnStartedAt = now;
    return false;
  }

  startDhappa(mode, targetId, callerId) {
    const now = Date.now();
    // Freeze active player's normal clock while the expression challenge is running.
    const active = this.active();
    if (active && this.room.turnStartedAt) active.remainingTime = this.effectiveRemaining(active, now);
    this.room.turnStartedAt = null;
    this.room.dhappa = {
      mode,
      targetId,
      callerId,
      startedAt: now,
      expiresAt: now + this.room.settings.dhappaSeconds*1000,
      seconds: this.room.settings.dhappaSeconds
    };
  }

  addEvent(e) {
    this.room.roundState.events.push({...e, ts:Date.now()});
  }

  awardRoundWin(p) {
    const pts = I_WON_POINTS[this.room.roundState.finishCount] ?? 0;
    this.room.roundState.finishCount += 1;
    p.roundScore += pts;
    this.addEvent({type:'win', playerId:p.id, points:pts});
    return pts;
  }

  awardKick(caller, target) {
    caller.roundScore += 3;
    this.addEvent({type:'kick', playerId:caller.id, targetId:target.id, points:3});
  }

  async eliminateAndAdvance(targetId, advanceFromId, persist=true) {
    const target = this.player(targetId);
    if (!target) return {roundEnded:false};
    target.alive = false;
    const survivors = this.alive();
    if (survivors.length === 1) {
      this.addEvent({type:'last', playerId:survivors[0].id, points:0});
      await this.finishRound();
      return {roundEnded:true};
    }
    const ids = survivors.map(p=>p.id);
    const actorPos = ids.indexOf(advanceFromId);
    let pos;
    if (actorPos >= 0) {
      const step = this.room.settings.direction === 'clockwise' ? 1 : -1;
      pos = (actorPos + step + ids.length) % ids.length;
    } else {
      pos = 0;
    }
    this.room.roundState.activeId = ids[pos];
    this.room.roundState.drawnThisTurn = false;
    this.room.turnStartedAt = Date.now();
    if (persist) await this.persistAndSchedule();
    return {roundEnded:false};
  }

  async finishRound() {
    this.room.phase = 'roundSummary';
    this.room.turnStartedAt = null;
    this.room.dhappa = null;
    for (const p of this.room.players) p.score += p.roundScore;
    this.room.roundHistory.push({
      round:this.room.round,
      target:this.room.roundState.target,
      scores:this.room.players.map(p=>({id:p.id,roundScore:p.roundScore,total:p.score}))
    });
    const winner = this.room.players.find(p => p.score >= this.room.settings.targetScore);
    if (winner) {
      this.room.phase = 'gameOver';
      this.room.winnerId = winner.id;
    }
    await this.save();
  }

  async persistAndSchedule() {
    await this.save();
    await this.scheduleAlarm();
  }

  async scheduleAlarm() {
    if (!this.room) return;
    if (this.room.phase !== 'turn') {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    if (this.room.dhappa?.expiresAt) {
      await this.ctx.storage.setAlarm(this.room.dhappa.expiresAt);
      return;
    }
    const active = this.active();
    if (active && this.room.turnStartedAt) {
      // If the active player has already consumed part of their clock, remainingTime is the authoritative base.
      await this.ctx.storage.setAlarm(this.room.turnStartedAt + active.remainingTime*1000);
    }
  }

  async alarm() {
    await this.load();
    if (!this.room || this.room.phase !== 'turn') return;
    const now = Date.now();
    if (this.room.dhappa) {
      if (now < this.room.dhappa.expiresAt) {
        await this.ctx.storage.setAlarm(this.room.dhappa.expiresAt);
        return;
      }
      const mode = this.room.dhappa.mode;
      const caller = this.player(this.room.dhappa.callerId);
      const target = this.player(this.room.dhappa.targetId);
      this.room.dhappa = null;
      this.room.roundState.drawnThisTurn = false;
      if (mode === 'callout') {
        if (caller?.alive) {
          this.addEvent({type:'timeout',playerId:caller.id,points:0});
          await this.eliminateAndAdvance(caller.id, caller.id, false);
        }
      } else if (mode === 'attempt') {
        if (target?.alive) {
          this.addEvent({type:'timeout',playerId:target.id,points:0});
          await this.eliminateAndAdvance(target.id, target.id, false);
        }
      }
      await this.persistAndSchedule();
      this.broadcast();
      return;
    }
    const active = this.active();
    if (!active || !this.room.turnStartedAt) return;
    active.remainingTime = 0;
    this.addEvent({type:'timeout',playerId:active.id,points:0});
    await this.eliminateAndAdvance(active.id, active.id, false);
    await this.persistAndSchedule();
    this.broadcast();
  }

  serialize(viewerId) {
    const now = Date.now();
    const sockets = this.ctx.getWebSockets ? this.ctx.getWebSockets() : [];
    const online = new Set();
    for (const ws of sockets) {
      try { const a = ws.deserializeAttachment?.(); if (a?.playerId) online.add(a.playerId); } catch {}
    }
    const players = this.room.players.map(p => ({
      ...p,
      remainingTime: this.effectiveRemaining(p, now),
      online: online.has(p.id)
    }));
    return {
      serverNow: now,
      code: this.room.code,
      phase: this.room.phase,
      round: this.room.round,
      hostPlayerId: this.room.hostPlayerId,
      settings: this.room.settings,
      winnerId: this.room.winnerId || null,
      players,
      roundState: this.room.roundState ? {
        target:this.room.roundState.target,
        targetCards:this.room.roundState.targetCards,
        activeId:this.room.roundState.activeId,
        drawnThisTurn:this.room.roundState.drawnThisTurn,
        finishCount:this.room.roundState.finishCount,
        events:this.room.roundState.events.slice(-30),
        numberCardsLeft:this.room.numberDeck.length,
        operatorCardsLeft:this.room.operatorDeck.length,
        turnDeadlineAt:this.room.turnStartedAt && !this.room.dhappa ? this.room.turnStartedAt + (this.active()?.remainingTime||0)*1000 : null
      } : null,
      dhappa:this.room.dhappa ? {...this.room.dhappa} : null,
      me:viewerId
    };
  }

  sendState(ws, viewerId) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({type:'state',state:this.serialize(viewerId)}));
  }

  broadcast() {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        const a = ws.deserializeAttachment?.();
        if (a?.playerId) this.sendState(ws, a.playerId);
      } catch {}
    }
  }

  closeOtherSockets(playerId, except) {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        const a = ws.deserializeAttachment?.();
        if (a?.playerId === playerId && ws !== except) ws.close(4001,'Reconnected');
      } catch {}
    }
  }

  async onSocketMessage(ws, msg) {
    const attachment = ws.deserializeAttachment?.() || {};
    const actor = this.player(attachment.playerId);
    if (!actor) return this.socketError(ws,'Player session not found.');

    // Rebase the main clock before processing any action. This also catches a just-expired turn.
    if (this.room.phase === 'turn' && !this.room.dhappa) {
      const expired = await this.syncMainTimer();
      if (expired) { this.broadcast(); return; }
    }

    if (msg.type === 'startGame') {
      if (actor.id !== this.room.hostPlayerId) return this.socketError(ws,'Only the host can start the game.');
      if (this.room.phase !== 'lobby') return this.socketError(ws,'The room is not in the lobby.');
      if (this.room.players.length < MIN_PLAYERS) return this.socketError(ws,'Need at least 2 players.');
      await this.beginRound(1); this.broadcast(); return;
    }

    if (msg.type === 'nextRound') {
      if (actor.id !== this.room.hostPlayerId) return this.socketError(ws,'Only the host can start the next round.');
      if (this.room.phase !== 'roundSummary') return this.socketError(ws,'The room is not waiting for the next round.');
      await this.beginRound(this.room.round + 1); this.broadcast(); return;
    }

    if (msg.type === 'leaveRoom') {
      const leavingHost = actor.id === this.room.hostPlayerId;
      this.room.players = this.room.players.filter(p => p.id !== actor.id);
      if (leavingHost) this.room.hostPlayerId = this.room.players[0]?.id || null;
      if (!this.room.players.length) {
        await this.ctx.storage.delete('room');
        this.room = null;
      } else {
        await this.save();
      }
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({type:'left'}));
      ws.close(1000,'Left room');
      this.broadcast();
      return;
    }

    if (this.room.phase !== 'turn') return this.socketError(ws,'The game is not accepting turn actions.');
    const active = this.active();
    if (!active) return this.socketError(ws,'No active player.');

    if (msg.type === 'draw') {
      if (actor.id !== active.id) return this.socketError(ws,'It is not your turn.');
      if (this.room.roundState.drawnThisTurn) return this.socketError(ws,'You can draw only one card per turn.');
      const deck = msg.deck === 'operator' ? this.room.operatorDeck : this.room.numberDeck;
      if (!deck.length) return this.socketError(ws,'That deck is empty.');
      const card = deck.shift();
      actor.hand.push(card);
      this.room.roundState.drawnThisTurn = true;
      this.addEvent({type:'draw',playerId:actor.id,deck:msg.deck,card});
      await this.persistAndSchedule(); this.broadcast(); return;
    }

    if (msg.type === 'pass') {
      if (actor.id !== active.id) return this.socketError(ws,'It is not your turn.');
      if (!this.room.roundState.drawnThisTurn) return this.socketError(ws,'Draw exactly one card before passing.');
      const ids = this.alive().map(p=>p.id);
      const pos = ids.indexOf(actor.id);
      const step = this.room.settings.direction === 'clockwise' ? 1 : -1;
      this.room.roundState.activeId = ids[(pos+step+ids.length)%ids.length];
      this.room.roundState.drawnThisTurn = false;
      this.room.turnStartedAt = Date.now();
      await this.persistAndSchedule(); this.broadcast(); return;
    }

    if (msg.type === 'attempt') {
      if (actor.id !== active.id) return this.socketError(ws,'It is not your turn.');
      if (!this.room.roundState.drawnThisTurn) return this.socketError(ws,'Draw exactly one card before attempting.');
      this.startDhappa('attempt', actor.id, actor.id);
      await this.persistAndSchedule(); this.broadcast(); return;
    }

    if (msg.type === 'dhappa') {
      if (actor.id !== active.id) return this.socketError(ws,'It is not your turn.');
      const target = this.player(msg.targetId);
      if (!target || !target.alive || target.id === actor.id) return this.socketError(ws,'Choose another living player.');
      this.startDhappa('callout', target.id, actor.id);
      await this.persistAndSchedule(); this.broadcast(); return;
    }

    if (msg.type === 'submitExpression') {
      if (!this.room.dhappa) return this.socketError(ws,'No active expression challenge.');
      const mode = this.room.dhappa.mode;
      const expressionPlayerId = mode === 'callout' ? this.room.dhappa.targetId : this.room.dhappa.targetId;
      const submittingPlayerId = mode === 'callout' ? this.room.dhappa.callerId : this.room.dhappa.targetId;
      if (actor.id !== submittingPlayerId) return this.socketError(ws,'Only the player resolving this expression may submit it.');
      const expressionPlayer = this.player(expressionPlayerId);
      const source = Array.isArray(msg.tokens) ? msg.tokens : [];
      const cards = [];
      for (const part of source) {
        if (typeof part === 'object' && Number.isInteger(part.index)) {
          if (part.index < 0 || part.index >= expressionPlayer.hand.length) return this.socketError(ws,'Invalid card selection.');
          cards.push(expressionPlayer.hand[part.index]);
        } else if (part === '(' || part === ')') {
          cards.push(part);
        } else {
          return this.socketError(ws,'Invalid expression token.');
        }
      }
      const evaluated = evaluateExpression(cards);
      if (!evaluated.valid || Math.abs(evaluated.value - this.room.roundState.target) > 1e-9) {
        return this.socketError(ws, evaluated.valid ? `Expression equals ${evaluated.value}; target is ${this.room.roundState.target}.` : evaluated.error);
      }

      this.room.dhappa = null;
      this.room.roundState.drawnThisTurn = false;
      this.room.turnStartedAt = null;

      if (mode === 'callout') {
        const caller = this.player(this.room.dhappa?.callerId || submittingPlayerId);
        const target = this.player(expressionPlayerId);
        // `caller` is resolved from the submitter because the challenge object was cleared.
        const actualCaller = this.player(submittingPlayerId);
        if (!actualCaller || !actualCaller.alive || !target || !target.alive) return this.socketError(ws,'The player state changed before resolution.');
        this.awardKick(actualCaller, target);
        await this.eliminateAndAdvance(target.id, actualCaller.id, false);
      } else {
        this.awardRoundWin(expressionPlayer);
        await this.eliminateAndAdvance(expressionPlayer.id, expressionPlayer.id, false);
      }
      await this.persistAndSchedule(); this.broadcast(); return;
    }

    if (msg.type === 'failChallenge') {
      if (!this.room.dhappa) return this.socketError(ws,'No active expression challenge.');
      const mode = this.room.dhappa.mode;
      const failingId = mode === 'callout' ? this.room.dhappa.callerId : this.room.dhappa.targetId;
      if (actor.id !== failingId) return this.socketError(ws,'Only the caller/attempting player can fail the challenge.');
      const failed = this.player(failingId);
      this.room.dhappa = null;
      this.room.roundState.drawnThisTurn = false;
      this.room.turnStartedAt = null;
      this.addEvent({type:'failed',playerId:failed.id,points:0});
      await this.eliminateAndAdvance(failed.id,failed.id,false);
      await this.persistAndSchedule(); this.broadcast(); return;
    }

    if (msg.type === 'kick') {
      if (!this.room.dhappa || this.room.dhappa.mode !== 'callout') return this.socketError(ws,'There is no active Dhappa callout.');
      if (actor.id !== this.room.dhappa.callerId) return this.socketError(ws,'Only the caller can resolve this kick.');
      const target = this.player(this.room.dhappa.targetId);
      if (!target || !target.alive) return this.socketError(ws,'Target is no longer available.');
      this.room.dhappa = null;
      this.room.roundState.drawnThisTurn = false;
      this.room.turnStartedAt = null;
      this.awardKick(actor,target);
      await this.eliminateAndAdvance(target.id,actor.id,false);
      await this.persistAndSchedule(); this.broadcast(); return;
    }

    if (msg.type === 'cancelChallenge') {
      if (!this.room.dhappa) return;
      if (actor.id !== this.room.dhappa.callerId) return this.socketError(ws,'Only the caller can cancel.');
      this.room.dhappa = null;
      this.room.turnStartedAt = Date.now();
      await this.persistAndSchedule(); this.broadcast(); return;
    }

    return this.socketError(ws,'Unknown action.');
  }

  socketError(ws, message) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({type:'error',message}));
  }

  async fetch(request) {
    await this.load();
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);

    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:CORS});

    if (parts[0] === 'internal') {
      if (request.method !== 'POST') return json({error:'Method not allowed'},405);
      let body={}; try { body=await request.json(); } catch {}
      if (parts[1] === 'create') return this.initialize(body.name, body.settings, body.code);
      if (parts[1] === 'join') {
        if (!this.room) return json({error:'Room not found.'},404);
        if (this.room.phase !== 'lobby') return json({error:'That game has already started.'},409);
        try {
          const p=this.addPlayer(body.name,false);
          await this.save();
          return json({ok:true,playerId:p.id,state:this.serialize(p.id)});
        } catch(e) { return json({error:e.message},409); }
      }
      if (parts[1] === 'rejoin') {
        if (!this.room) return json({error:'Room not found.'},404);
        const p=this.player(body.playerId);
        if (!p) return json({error:'Player session not found.'},404);
        return json({ok:true,playerId:p.id,state:this.serialize(p.id)});
      }
      return json({error:'Unknown internal endpoint.'},404);
    }

    if (request.headers.get('Upgrade') === 'websocket' && url.pathname === '/ws') {
      if (!this.room) return new Response('Room not found.',{status:404});
      const playerId=url.searchParams.get('playerId');
      const p=this.player(playerId);
      if (!p) return new Response('Player session not found.',{status:404});
      const pair=new WebSocketPair();
      const client=pair[0], server=pair[1];
      this.closeOtherSockets(playerId, server);
      this.ctx.acceptWebSocket(server, [playerId]);
      server.serializeAttachment({playerId});
      this.sendState(server,playerId);
      return new Response(null,{status:101,webSocket:client});
    }

    return json({error:'Not found'},404);
  }

  async webSocketMessage(ws, message) {
    try {
      const msg = typeof message === 'string' ? JSON.parse(message) : JSON.parse(new TextDecoder().decode(message));
      await this.load();
      await this.onSocketMessage(ws,msg);
    } catch (e) {
      this.socketError(ws,e?.message || 'Malformed message.');
    }
  }

  webSocketClose(ws) {
    // Explicit room membership persists in storage. A browser closing its tab only
    // drops the WebSocket connection; it does not remove the player from the room.
  }

  webSocketError(ws, error) {
    try { ws.serializeAttachment({ ...ws.deserializeAttachment?.(), lastError: String(error?.message || error) }); } catch {}
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:CORS});

    if (url.pathname === '/health') {
      return json({ok:true, service:'combine-cloudflare', durableObjects:true});
    }

    if (url.pathname === '/api/create' && request.method === 'POST') {
      let body={}; try { body=await request.json(); } catch {}
      for (let attempt=0; attempt<20; attempt++) {
        const code=roomCode();
        const id=env.COMBINE_ROOM.idFromName(code);
        const stub=env.COMBINE_ROOM.get(id);
        const result=await stub.fetch('https://room.internal/internal/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:body.name,settings:body.settings,code})});
        if (result.status===409) continue;
        if (!result.ok) return result;
        const data=await result.json();
        return json({roomCode:code,playerId:data.playerId,state:data.state});
      }
      return json({error:'Unable to allocate a room code.'},500);
    }

    if ((url.pathname === '/api/join' || url.pathname === '/api/rejoin') && request.method === 'POST') {
      let body={}; try { body=await request.json(); } catch {}
      const code=String(body.code||'').toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(code)) return json({error:'Invalid room code.'},400);
      const id=env.COMBINE_ROOM.idFromName(code);
      const stub=env.COMBINE_ROOM.get(id);
      const path=url.pathname==='/api/join'?'/internal/join':'/internal/rejoin';
      const payload=url.pathname==='/api/join'?{name:body.name}:{playerId:body.playerId};
      const result=await stub.fetch(`https://room.internal${path}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
      const text=await result.text();
      return new Response(text,{status:result.status,headers:{'content-type':'application/json',...CORS}});
    }

    if (request.headers.get('Upgrade') === 'websocket' && url.pathname === '/ws') {
      const code=String(url.searchParams.get('room')||'').toUpperCase();
      if (!code) return new Response('Missing room code.',{status:400});
      if (!/^[A-Z0-9]{6}$/.test(code)) return new Response('Invalid room code.',{status:400});
      const id=env.COMBINE_ROOM.idFromName(code);
      const stub=env.COMBINE_ROOM.get(id);
      return stub.fetch(request);
    }

    return json({service:'combine-cloudflare',health:'/health'},200);
  }
};
