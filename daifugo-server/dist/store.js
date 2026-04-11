"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureDataDir = ensureDataDir;
exports.loadRooms = loadRooms;
exports.saveRooms = saveRooms;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const DATA_DIR = path_1.default.resolve(__dirname, '../../data');
const FILE = path_1.default.join(DATA_DIR, 'rooms.json');
async function ensureDataDir() {
    try {
        await fs_1.default.promises.mkdir(DATA_DIR, { recursive: true });
    }
    catch (e) { /* ignore */ }
}
async function loadRooms() {
    try {
        await ensureDataDir();
        const txt = await fs_1.default.promises.readFile(FILE, 'utf-8');
        return JSON.parse(txt || '{}');
    }
    catch (e) {
        return {};
    }
}
async function saveRooms(obj) {
    await ensureDataDir();
    await fs_1.default.promises.writeFile(FILE, JSON.stringify(obj, null, 2), 'utf-8');
}
