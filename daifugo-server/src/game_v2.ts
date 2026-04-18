import { Server, Socket } from 'socket.io'
import { initGame, isLegalPlay, applyPlay, handlePass, GameState, Card } from './engine'
import { loadRooms, saveRooms, deleteRoom } from './store_pg'
import { v4 as uuidv4 } from 'uuid'

type Room = {
  code: string
  players: { id:string, name:string, playerId: string }[]
  state?: GameState
}

const inMemory = new Map<string, Room>()

function makeRoomCode(){
  return Math.random().toString(36).slice(2,8).toUpperCase()
}

async function persistAll(){
  const obj: Record<string, any> = {}
  for(const [k,v] of inMemory.entries()) obj[k]=v
  await saveRooms(obj)
}

function scheduleNextCPU(io: Server, roomCode: string, room: Room){
  if(!room.state) return;
  const next = room.state.currentPlayer;
  const nextPlayer = room.players[next];
  if(!nextPlayer) return;
  // If next player is a CPU (id starts with 'cpu-')
  if(nextPlayer.id.startsWith('cpu-') && !room.state.finished.includes(next)){
    // Check game not over
    if(room.state.finished.length < room.state.hands.length - 1){
      setTimeout(() => {
        // Re-check state in case it changed
        const r = inMemory.get(roomCode);
        if(!r || !r.state) return;
        if(r.state.currentPlayer !== next) return;
        // Emit a synthetic cpu_auto action
        const fakeData = { code: roomCode, type: 'cpu_auto' as const };
        // Directly process
        processCPUAuto(io, roomCode, r);
      }, 700 + Math.random() * 500);
    }
  }
}

async function processCPUAuto(io: Server, roomCode: string, room: Room){
  if(!room.state) return;
  const playerIndex = room.state.currentPlayer;
  const hand = room.state.hands[playerIndex];
  
  if(!hand || hand.length === 0 || room.state.finished.includes(playerIndex)){
    room.state = handlePass(room.state);
    await persistAll();
    io.to(roomCode).emit('game_state', { state: room.state });
    scheduleNextCPU(io, roomCode, room);
    return;
  }

  let found = false;
  const groups: Record<string, Card[]> = {};
  for(const c of hand){
    if(!groups[c.rank]) groups[c.rank] = [];
    groups[c.rank].push(c);
  }

  const pileLen = room.state.pile.length > 0 
    ? room.state.pile[room.state.pile.length-1].cards.length 
    : 0;
  const targetCounts = pileLen > 0 ? [pileLen] : [1, 2, 3];

  for(const count of targetCounts){
    for(const [, cards] of Object.entries(groups)){
      if(cards.length >= count){
        const selected = cards.slice(0, count);
        if(isLegalPlay(room.state, hand, selected)){
          room.state = applyPlay(room.state, playerIndex, selected);
          found = true;
          break;
        }
      }
    }
    if(found) break;
  }

  if(!found) room.state = handlePass(room.state);

  await persistAll();
  io.to(roomCode).emit('game_state', { state: room.state });
  scheduleNextCPU(io, roomCode, room);
}

export async function setupGameHandlers(io: Server){
  // load persisted rooms
  const persisted = await loadRooms()
  for(const [code, r] of Object.entries(persisted)){
    inMemory.set(code, r as Room)
  }

  io.on('connection', (socket: Socket) => {
    console.log('client connected', socket.id)

    socket.on('resume', (data:{code:string, playerId:string})=>{
      const room = inMemory.get(data.code)
      if(!room) { socket.emit('error', {message:'Room not found'}) ; return }
      const p = room.players.find(pp=>pp.playerId===data.playerId)
      if(!p){ socket.emit('error', {message:'Player not found'}) ; return }
      // rebind socket id
      p.id = socket.id
      socket.join(data.code)
      socket.emit('room_resumed', { code: data.code, playerId: p.playerId, state: room.state || null })
      io.to(data.code).emit('room_update', { players: room.players.map(pm=>({id:pm.id,name:pm.name, playerId:pm.playerId})) })
      if(room.state) io.to(data.code).emit('game_state', { state: room.state })
    })

    socket.on('create_room', async (data:{name:string, isSolo?:boolean})=>{
      const code = makeRoomCode()
      const playerId = uuidv4()
      const room:Room = { 
        code, 
        players: [{ id: socket.id, name: data.name || 'Player', playerId }], 
        state: undefined 
      }
      
      if(data.isSolo){
        room.players.push({ id: 'cpu-1', name: 'CPU (Normal)', playerId: 'cpu-1' })
        room.players.push({ id: 'cpu-2', name: 'CPU (Pro)', playerId: 'cpu-2' })
        room.players.push({ id: 'cpu-3', name: 'CPU (God)', playerId: 'cpu-3' })
      }

      inMemory.set(code, room)
      await persistAll()
      socket.join(code)
      socket.emit('room_created', { code, players: room.players.map(p=>({id:p.id,name:p.name,playerId:p.playerId})), yourPlayerId: playerId })
    })

    socket.on('join_room', async (data:{code:string, name:string})=>{
      const room = inMemory.get(data.code)
      if(!room){ socket.emit('error', { message: 'Room not found' }); return }
      const playerId = uuidv4()
      room.players.push({ id: socket.id, name: data.name, playerId })
      socket.join(data.code)
      await persistAll()
      io.to(data.code).emit('room_update', { players: room.players.map(p=>({id:p.id,name:p.name,playerId:p.playerId})) })
      socket.emit('joined', { code: data.code, yourPlayerId: playerId })
    })

    socket.on('start_game', async (data:{code:string})=>{
      const room = inMemory.get(data.code)
      if(!room) { socket.emit('error', {message:'Room not found'}); return }
      room.state = initGame(room.players.length)
      await persistAll()
      io.to(data.code).emit('game_state', { state: room.state })
      // If first player is CPU, auto-chain
      scheduleNextCPU(io, data.code, room)
    })

    socket.on('action', async (data:{code?:string, type:'play'|'pass'|'cpu_auto', cards?: Card[]})=>{
      const roomCode = data.code || Array.from(socket.rooms).find(r=>r!==socket.id)
      if(!roomCode){ socket.emit('error', {message:'Not in a room'}) ; return }
      const room = inMemory.get(roomCode as string)
      if(!room || !room.state){ socket.emit('error', {message:'Game not started'}); return }

      const playerIndex = room.state.currentPlayer;

      if(data.type === 'cpu_auto'){
        const hand = room.state.hands[playerIndex];
        if(!hand || hand.length === 0 || room.state.finished.includes(playerIndex)){
          // Skip this player
          room.state = handlePass(room.state);
          await persistAll();
          io.to(roomCode as string).emit('game_state', { state: room.state });
          // Chain: if next is also CPU
          scheduleNextCPU(io, roomCode as string, room);
          return;
        }

        let found = false;
        
        // Group cards by rank
        const groups: Record<string, typeof hand> = {};
        for(const c of hand){
          const key = c.rank;
          if(!groups[key]) groups[key] = [];
          groups[key].push(c);
        }
        
        // Determine how many cards to play (match pile count, or free if pile empty)
        const pileLen = room.state.pile.length > 0 
          ? room.state.pile[room.state.pile.length-1].cards.length 
          : 0;
        
        // Try to play matching pile count, or 1 if pile empty
        const targetCounts = pileLen > 0 ? [pileLen] : [1, 2, 3];
        
        for(const count of targetCounts){
          for(const [rank, cards] of Object.entries(groups)){
            if(cards.length >= count){
              const selected = cards.slice(0, count);
              if(isLegalPlay(room.state, hand, selected)){
                room.state = applyPlay(room.state, playerIndex, selected);
                found = true;
                break;
              }
            }
          }
          if(found) break;
        }

        if(!found) {
          room.state = handlePass(room.state);
        }
        
        await persistAll();
        io.to(roomCode as string).emit('game_state', { state: room.state });
        
        // Chain: auto-trigger next CPU if needed
        scheduleNextCPU(io, roomCode as string, room);
        return;
      }

      const senderIndex = room.players.findIndex(p=>p.id===socket.id)
      if(senderIndex === -1 || senderIndex !== playerIndex) return;

      if(data.type === 'pass'){
        room.state = handlePass(room.state)
        await persistAll()
        io.to(roomCode as string).emit('game_state', { state: room.state })
        return
      }

      if(data.type === 'play'){
        const selected = data.cards || []
        if(!isLegalPlay(room.state, room.state.hands[playerIndex], selected)){
          socket.emit('invalid_play', { message: 'Illegal move' })
          return
        }
        room.state = applyPlay(room.state, playerIndex, selected)
        await persistAll()
        io.to(roomCode as string).emit('game_state', { state: room.state })
        return
      }
    })

    socket.on('disconnect', async ()=>{
      console.log('disconnect', socket.id)
      for(const [code, room] of inMemory.entries()){
        const before = room.players.length
        room.players = room.players.filter(p=>p.id!==socket.id)
        if(room.players.length !== before){
          io.to(code).emit('room_update', { players: room.players.map(p=>({id:p.id,name:p.name,playerId:p.playerId})) })
        }
        if(room.players.length===0){
          inMemory.delete(code)
          try{ await deleteRoom(code) }catch(e){ console.warn('deleteRoom failed', e) }
        }
      }
      await persistAll()
    })
  })
}
