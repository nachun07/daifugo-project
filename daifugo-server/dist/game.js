"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupGameHandlers = setupGameHandlers;
const engine_1 = require("./engine");
const rooms = new Map();
function makeRoomCode() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
}
function setupGameHandlers(io) {
    io.on('connection', (socket) => {
        console.log('client connected', socket.id);
        socket.on('create_room', (data) => {
            const code = makeRoomCode();
            const room = { code, players: [{ id: socket.id, name: data.name || 'Player' }], state: undefined };
            rooms.set(code, room);
            socket.join(code);
            socket.emit('room_created', { code, players: room.players.map(p => ({ id: p.id, name: p.name })) });
        });
        socket.on('join_room', (data) => {
            const room = rooms.get(data.code);
            if (!room) {
                socket.emit('error', { message: 'Room not found' });
                return;
            }
            room.players.push({ id: socket.id, name: data.name });
            socket.join(data.code);
            io.to(data.code).emit('room_update', { players: room.players.map(p => ({ id: p.id, name: p.name })) });
        });
        socket.on('start_game', (data) => {
            const room = rooms.get(data.code);
            if (!room) {
                socket.emit('error', { message: 'Room not found' });
                return;
            }
            const names = room.players.map(p => p.name);
            room.state = (0, engine_1.initGame)(names);
            io.to(data.code).emit('game_state', { state: room.state });
        });
        socket.on('action', (data) => {
            // find room
            const roomCode = data.code || Array.from(socket.rooms).find(r => r !== socket.id);
            if (!roomCode) {
                socket.emit('error', { message: 'Not in a room' });
                return;
            }
            const room = rooms.get(roomCode);
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
                io.to(roomCode).emit('game_state', { state: room.state });
                return;
            }
            if (data.type === 'play') {
                const selected = data.cards || [];
                // validate
                if (!(0, engine_1.isLegalPlay)(room.state, room.state.hands[playerIndex], selected)) {
                    socket.emit('invalid_play', { message: 'Illegal move' });
                    return;
                }
                const next = (0, engine_1.applyPlay)(room.state, playerIndex, selected);
                room.state = next;
                io.to(roomCode).emit('game_state', { state: room.state });
                return;
            }
        });
        socket.on('disconnect', () => {
            console.log('disconnect', socket.id);
            for (const [code, room] of rooms.entries()) {
                const before = room.players.length;
                room.players = room.players.filter(p => p.id !== socket.id);
                if (room.players.length !== before) {
                    io.to(code).emit('room_update', { players: room.players.map(p => ({ id: p.id, name: p.name })) });
                }
                if (room.players.length === 0)
                    rooms.delete(code);
            }
        });
    });
}
