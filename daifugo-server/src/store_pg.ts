import { Pool } from 'pg'

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@postgres:5432/daifugo'

const pool = new Pool({ connectionString: DATABASE_URL })

export async function initDb() {
  await pool.query(`CREATE TABLE IF NOT EXISTS rooms (
    code TEXT PRIMARY KEY,
    data JSONB NOT NULL
  )`)
}

export async function loadRooms(): Promise<Record<string, any>>{
  await initDb()
  const res = await pool.query('SELECT code, data FROM rooms')
  const obj: Record<string, any> = {}
  for(const row of res.rows){ obj[row.code] = row.data }
  return obj
}

export async function saveRooms(obj: Record<string, any>){
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
    throw e
  }finally{
    client.release()
  }
}

export async function deleteRoom(code:string){
  await initDb()
  await pool.query('DELETE FROM rooms WHERE code=$1', [code])
}
