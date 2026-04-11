import { Server, Socket } from 'socket.io'
import { initGame, isLegalPlay, applyPlay, GameState, Card } from './engine'
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
      socket.emit('room_resumed', { code: data.code, playerId: p.playerId })
      io.to(data.code).emit('room_update', { players: room.players.map(pm=>({id:pm.id,name:pm.name, playerId:pm.playerId})) })
      if(room.state) io.to(data.code).emit('game_state', { state: room.state })
    })

    socket.on('create_room', async (data:{name:string})=>{
      const code = makeRoomCode()
      const playerId = uuidv4()
      const room:Room = { code, players: [{ id: socket.id, name: data.name || 'Player', playerId }], state: undefined }
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
      const names = room.players.map(p=>p.name)
      room.state = initGame(names)
      await persistAll()
      io.to(data.code).emit('game_state', { state: room.state })
    })

    socket.on('action', async (data:{code?:string, type:'play'|'pass', cards?: Card[]})=>{
      const roomCode = data.code || Array.from(socket.rooms).find(r=>r!==socket.id)
      if(!roomCode){ socket.emit('error', {message:'Not in a room'}) ; return }
      const room = inMemory.get(roomCode as string)
      if(!room || !room.state){ socket.emit('error', {message:'Game not started'}); return }
      const playerIndex = room.players.findIndex(p=>p.id===socket.id)
      if(playerIndex===-1){ socket.emit('error',{message:'Player not in room'}) ; return }

      if(data.type === 'pass'){
        room.state.currentPlayer = (room.state.currentPlayer + 1) % room.state.hands.length
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
        const next = applyPlay(room.state, playerIndex, selected)
        room.state = next
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
