import express from 'express'
import passport from 'passport'
import { Strategy as GitHubStrategy } from 'passport-github2'

const router = express.Router()

passport.serializeUser((user: any, done) => done(null, user))
passport.deserializeUser((obj: any, done) => done(null, obj))

const clientId = process.env.GITHUB_CLIENT_ID || ''
const clientSecret = process.env.GITHUB_CLIENT_SECRET || ''
const callbackURL = process.env.GITHUB_CALLBACK_URL || 'http://localhost:4000/auth/github/callback'

if(clientId && clientSecret){
  passport.use(new (GitHubStrategy as any)({ 
    clientID: clientId, 
    clientSecret: clientSecret, 
    callbackURL: callbackURL 
  },
  function(accessToken: string, refreshToken: string, profile: any, done: any) {
    return done(null, { id: profile.id, username: profile.username || profile.displayName, profile });
  }));
} else {
  console.warn('GitHub OAuth not configured: GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET missing')
}

router.get('/github', passport.authenticate('github', { scope: ['user:email'] }))

router.get('/github/callback',
  passport.authenticate('github', { failureRedirect: '/auth/failure' }),
  (req, res) => {
    // Successful auth — redirect to client
    res.redirect('/')
  }
)

router.get('/failure', (req, res) => res.status(401).send('Authentication failed'))

export default router
