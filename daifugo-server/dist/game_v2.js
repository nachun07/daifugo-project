"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupGameHandlers = setupGameHandlers;
const engine_1 = require("./engine");
const store_pg_1 = require("./store_pg");
const uuid_1 = require("uuid");
const inMemory = new Map();
function makeRoomCode() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
}
async function persistAll() {
    const obj = {};
    for (const [k, v] of inMemory.entries())
        obj[k] = v;
    await (0, store_pg_1.saveRooms)(obj);
}
async function setupGameHandlers(io) {
    // load persisted rooms
    const persisted = await (0, store_pg_1.loadRooms)();
    for (const [code, r] of Object.entries(persisted)) {
        inMemory.set(code, r);
    }
    io.on('connection', (socket) => {
        console.log('client connected', socket.id);
        socket.on('resume', (data) => {
            const room = inMemory.get(data.code);
            if (!room) {
                socket.emit('error', { message: 'Room not found' });
                return;
            }
            const p = room.players.find(pp => pp.playerId === data.playerId);
            if (!p) {
                socket.emit('error', { message: 'Player not found' });
                return;
            }
            // rebind socket id
            p.id = socket.id;
            socket.join(data.code);
            socket.emit('room_resumed', { code: data.code, playerId: p.playerId });
            io.to(data.code).emit('room_update', { players: room.players.map(pm => ({ id: pm.id, name: pm.name, playerId: pm.playerId })) });
            if (room.state)
                io.to(data.code).emit('game_state', { state: room.state });
        });
        socket.on('create_room', async (data) => {
            const code = makeRoomCode();
            const playerId = (0, uuid_1.v4)();
            const room = { code, players: [{ id: socket.id, name: data.name || 'Player', playerId }], state: undefined };
            inMemory.set(code, room);
            await persistAll();
            socket.join(code);
            socket.emit('room_created', { code, players: room.players.map(p => ({ id: p.id, name: p.name, playerId: p.playerId })), yourPlayerId: playerId });
        });
        socket.on('join_room', async (data) => {
            const room = inMemory.get(data.code);
            if (!room) {
                socket.emit('error', { message: 'Room not found' });
                return;
            }
            const playerId = (0, uuid_1.v4)();
            room.players.push({ id: socket.id, name: data.name, playerId });
            socket.join(data.code);
            await persistAll();
            io.to(data.code).emit('room_update', { players: room.players.map(p => ({ id: p.id, name: p.name, playerId: p.playerId })) });
            socket.emit('joined', { code: data.code, yourPlayerId: playerId });
        });
        socket.on('start_game', async (data) => {
            const room = inMemory.get(data.code);
            if (!room) {
                socket.emit('error', { message: 'Room not found' });
                return;
            }
            const names = room.players.map(p => p.name);
            room.state = (0, engine_1.initGame)(names);
            await persistAll();
            io.to(data.code).emit('game_state', { state: room.state });
        });
        socket.on('action', async (data) => {
            const roomCode = data.code || Array.from(socket.rooms).find(r => r !== socket.id);
            if (!roomCode) {
                socket.emit('error', { message: 'Not in a room' });
                return;
            }
            const room = inMemory.get(roomCode);
            if (!room || !room.state) {
                socket.emit('error', { message: 'Game not started' });
                return;
            }
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            if (playerIndex === -1) {
                socket.emit('error', { message: 'Player not in room' });
                return;
            }
            if (data.type === 'pass') {
                room.state.currentPlayer = (room.state.currentPlayer + 1) % room.state.hands.length;
                await persistAll();
                io.to(roomCode).emit('game_state', { state: room.state });
                return;
            }
            if (data.type === 'play') {
                const selected = data.cards || [];
                if (!(0, engine_1.isLegalPlay)(room.state, room.state.hands[playerIndex], selected)) {
                    socket.emit('invalid_play', { message: 'Illegal move' });
                    return;
                }
                const next = (0, engine_1.applyPlay)(room.state, playerIndex, selected);
                room.state = next;
                await persistAll();
                io.to(roomCode).emit('game_state', { state: room.state });
                return;
            }
        });
        socket.on('disconnect', async () => {
            console.log('disconnect', socket.id);
            for (const [code, room] of inMemory.entries()) {
                const before = room.players.length;
                room.players = room.players.filter(p => p.id !== socket.id);
                if (room.players.length !== before) {
                    io.to(code).emit('room_update', { players: room.players.map(p => ({ id: p.id, name: p.name, playerId: p.playerId })) });
                }
                if (room.players.length === 0) {
                    inMemory.delete(code);
                    try {
                        await (0, store_pg_1.deleteRoom)(code);
                    }
                    catch (e) {
                        console.warn('deleteRoom failed', e);
                    }
                }
            }
            await persistAll();
        });
    });
}
