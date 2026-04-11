"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initDb = initDb;
exports.loadRooms = loadRooms;
exports.saveRooms = saveRooms;
exports.deleteRoom = deleteRoom;
const pg_1 = require("pg");
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@postgres:5432/daifugo';
const pool = new pg_1.Pool({ connectionString: DATABASE_URL });
async function initDb() {
    await pool.query(`CREATE TABLE IF NOT EXISTS rooms (
    code TEXT PRIMARY KEY,
    data JSONB NOT NULL
  )`);
}
async function loadRooms() {
    await initDb();
    const res = await pool.query('SELECT code, data FROM rooms');
    const obj = {};
    for (const row of res.rows) {
        obj[row.code] = row.data;
    }
    return obj;
}
async function saveRooms(obj) {
    await initDb();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const [code, data] of Object.entries(obj)) {
            await client.query(`INSERT INTO rooms(code,data) VALUES($1,$2) ON CONFLICT(code) DO UPDATE SET data = $2`, [code, data]);
        }
        await client.query('COMMIT');
    }
    catch (e) {
        await client.query('ROLLBACK');
        throw e;
    }
    finally {
        client.release();
    }
}
async function deleteRoom(code) {
    await initDb();
    await pool.query('DELETE FROM rooms WHERE code=$1', [code]);
}
