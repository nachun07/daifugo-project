"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const express_session_1 = __importDefault(require("express-session"));
const passport_1 = __importDefault(require("passport"));
const socket_io_1 = require("socket.io");
const game_v2_1 = require("./game_v2");
const auth_1 = __importDefault(require("./auth"));
const redis_1 = require("redis");
const redis_adapter_1 = require("@socket.io/redis-adapter");
(async () => {
    const app = (0, express_1.default)();
    // session & passport for optional OAuth
    app.use((0, express_session_1.default)({ secret: process.env.SESSION_SECRET || 'dev-secret', resave: false, saveUninitialized: false }));
    app.use(passport_1.default.initialize());
    app.use(passport_1.default.session());
    app.use('/auth', auth_1.default);
    const server = http_1.default.createServer(app);
    const io = new socket_io_1.Server(server, { cors: { origin: '*' } });
    const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';
    try {
        const pubClient = (0, redis_1.createClient)({ url: REDIS_URL });
        const subClient = pubClient.duplicate();
        await Promise.all([pubClient.connect(), subClient.connect()]);
        io.adapter((0, redis_adapter_1.createAdapter)(pubClient, subClient));
        console.log('Redis adapter connected');
    }
    catch (e) {
        console.warn('Failed to connect Redis adapter, continuing without it', e);
    }
    app.get('/', (req, res) => res.send('Daifugo server running'));
    // initialize async handlers
    await (0, game_v2_1.setupGameHandlers)(io);
    const PORT = process.env.PORT || 4000;
    server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
})();
