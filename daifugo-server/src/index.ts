import express from 'express'
import http from 'http'
import { Server as IOServer } from 'socket.io'
import { setupGameHandlers } from './game_v2'

;(async ()=>{
  const app = express()
  const server = http.createServer(app)

  // Minimal CORS
  const io = new IOServer(server, { 
    cors: { 
      origin: "*", 
      methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling']
  })

  // Debug logging
  io.on('connection_error', (err) => {
    console.log('❌ Connection Error details:', err.req ? 'req present' : 'no req', err.code, err.message, err.context);
  });

  app.get('/', (req, res) => res.send('Daifugo server is UP and RUNNING (v2.1)'))
  app.get('/health', (req, res) => res.status(200).send('OK'))

  const PORT = Number(process.env.PORT) || 4000
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Final Test Server listening on port ${PORT}`)
    setupGameHandlers(io).catch(err => console.error('setupGameHandlers error:', err))
  })
})()
