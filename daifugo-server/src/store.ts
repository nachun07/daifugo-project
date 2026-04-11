import fs from 'fs'
import path from 'path'

const DATA_DIR = path.resolve(__dirname, '../../data')
const FILE = path.join(DATA_DIR, 'rooms.json')

export type RoomRecord = any

export async function ensureDataDir(){
  try{
    await fs.promises.mkdir(DATA_DIR, { recursive: true })
  }catch(e){ /* ignore */ }
}

export async function loadRooms(): Promise<Record<string, RoomRecord>>{
  try{
    await ensureDataDir()
    const txt = await fs.promises.readFile(FILE, 'utf-8')
    return JSON.parse(txt || '{}')
  }catch(e){
    return {}
  }
}

export async function saveRooms(obj: Record<string, RoomRecord>){
  await ensureDataDir()
  await fs.promises.writeFile(FILE, JSON.stringify(obj, null, 2), 'utf-8')
}
