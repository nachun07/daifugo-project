import { Pool } from 'pg'

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@postgres:5432/daifugo'

const pool = new Pool({ connectionString: DATABASE_URL })

export async function initDb() {
  await pool.query(`CREATE TABLE IF NOT EXISTS rooms (
    code TEXT PRIMARY KEY,
    data JSONB NOT NULL
  )`)
  await pool.query(`CREATE TABLE IF NOT EXISTS rooms_backup (
    code TEXT,
    data JSONB NOT NULL,
    tag TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)
}

export async function loadRooms(): Promise<Record<string, any>>{
  try {
    await initDb()
    const res = await pool.query('SELECT code, data FROM rooms')
    const obj: Record<string, any> = {}
    for(const row of res.rows){ obj[row.code] = row.data }
    return obj
  } catch (e) {
    console.warn('Postgres connection failed. Operating in in-memory mode.', e instanceof Error ? e.message : e)
    return {} // Return empty if DB fails
  }
}

export async function saveRooms(obj: Record<string, any>){
  try {
    await initDb()
    const client = await pool.connect()
    try{
      await client.query('BEGIN')
      for(const [code, data] of Object.entries(obj)){
        await client.query(`INSERT INTO rooms(code,data) VALUES($1,$2) ON CONFLICT(code) DO UPDATE SET data = $2`, [code, data])
      }
      await client.query('COMMIT')
    }catch(e){
      await client.query('ROLLBACK')
      console.warn('saveRooms fail:', e)
    }finally{
      client.release()
    }
  } catch (e) {
    console.warn('saveRooms: connection fail', e)
  }
}

export async function deleteRoom(code:string){
  try {
    await initDb()
    await pool.query('DELETE FROM rooms WHERE code=$1', [code])
  } catch (e) {
    console.warn('deleteRoom fail', e)
  }
}

// バックアップ保存
export async function saveRoomsBackup(obj: Record<string, any>, tag: string) {
  try {
    await initDb()
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      for(const [code, data] of Object.entries(obj)){
        await client.query(`INSERT INTO rooms_backup(code, data, tag) VALUES($1, $2, $3)`, [code, data, tag])
      }
      await client.query('COMMIT')
    } catch(e) {
      await client.query('ROLLBACK')
      console.warn('backup fail', e)
    } finally {
      client.release()
    }
  } catch (e) {
    console.warn('saveBackup: connection fail', e)
  }
}

// 古いバックアップ削除
export async function cleanupOldBackups(keep: number) {
  try {
    await initDb()
    await pool.query(`DELETE FROM rooms_backup WHERE ctid NOT IN (
      SELECT ctid FROM (
        SELECT ctid, ROW_NUMBER() OVER (PARTITION BY code ORDER BY tag DESC) as rn FROM rooms_backup
      ) t WHERE t.rn <= $1
    )`, [keep])
  } catch (e) {
    console.warn('cleanup fail', e)
  }
}

