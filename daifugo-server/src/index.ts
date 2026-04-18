import express from 'express'
import http from 'http'
import session from 'express-session'
import passport from 'passport'
import { Server as IOServer } from 'socket.io'
import { setupGameHandlers } from './game_v2'
import authRouter from './auth'
import { createClient } from 'redis'
import { createAdapter } from '@socket.io/redis-adapter'

;(async ()=>{
  const app = express()

  // session & passport for optional OAuth
  app.use(session({ secret: process.env.SESSION_SECRET || 'dev-secret', resave: false, saveUninitialized: false }))
  app.use(passport.initialize())
  app.use(passport.session())
  app.use('/auth', authRouter)

  const server = http.createServer(app)
  const io = new IOServer(server, { 
    cors: { 
      origin: "*", 
      methods: ["GET", "POST"]
    } 
  })

  const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379'
  try{
    const pubClient = createClient({ url: REDIS_URL })
    const subClient = pubClient.duplicate()
    await Promise.all([pubClient.connect(), subClient.connect()])
    io.adapter(createAdapter(pubClient, subClient))
    console.log('Redis adapter connected')
  }catch(e){
    console.warn('Redis adapter skip: ', e instanceof Error ? e.message : e)
  }

  // Manual CORS for all requests
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
  });

  app.get('/', (req, res) => res.send('Daifugo server is UP and RUNNING'))

  const PORT = Number(process.env.PORT) || 4000
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server listening on port ${PORT}`)
    
    // Initialize handlers AFTER starting the server to avoid blocking
    setupGameHandlers(io).catch(err => console.error('setupGameHandlers error:', err))
  })
})()
