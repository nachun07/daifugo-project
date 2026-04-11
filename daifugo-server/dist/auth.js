"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const passport_1 = __importDefault(require("passport"));
const passport_github2_1 = require("passport-github2");
const router = express_1.default.Router();
passport_1.default.serializeUser((user, done) => done(null, user));
passport_1.default.deserializeUser((obj, done) => done(null, obj));
const clientId = process.env.GITHUB_CLIENT_ID || '';
const clientSecret = process.env.GITHUB_CLIENT_SECRET || '';
const callbackURL = process.env.GITHUB_CALLBACK_URL || 'http://localhost:4000/auth/github/callback';
if (clientId && clientSecret) {
    passport_1.default.use(new passport_github2_1.Strategy({ clientID: clientId, clientSecret, callbackURL }, function (accessToken, refreshToken, profile, done) {
        // minimal user profile — store at session
        return done(null, { id: profile.id, username: profile.username || profile.displayName, profile });
    }));
}
else {
    console.warn('GitHub OAuth not configured: GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET missing');
}
router.get('/github', passport_1.default.authenticate('github', { scope: ['user:email'] }));
router.get('/github/callback', passport_1.default.authenticate('github', { failureRedirect: '/auth/failure' }), (req, res) => {
    // Successful auth — redirect to client
    res.redirect('/');
});
router.get('/failure', (req, res) => res.status(401).send('Authentication failed'));
exports.default = router;
