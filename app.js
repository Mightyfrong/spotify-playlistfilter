const express = require('express')
var SpotifyWebApi = require('spotify-web-api-node');
const app = express()
const port = 3000

const { DatabaseSync } = require('node:sqlite');
const database = new DatabaseSync('db.db');

database.prepare('CREATE TABLE IF NOT EXISTS "playlists" ("uri"	TEXT NOT NULL UNIQUE, "tracks" TEXT NOT NULL, PRIMARY KEY("uri"))').run();
database.prepare('CREATE TABLE IF NOT EXISTS "tags" ("tag" TEXT NOT NULL UNIQUE, "display" TEXT NOT NULL, PRIMARY KEY("tag"))').run();
database.prepare('CREATE TABLE IF NOT EXISTS "tracks" ("uri" TEXT NOT NULL UNIQUE, "tags"	TEXT,	PRIMARY KEY("uri"))').run();
database.prepare('CREATE TABLE IF NOT EXISTS "user" ("user_id" INTEGER NOT NULL, "refresh_token" TEXT NOT NULL, PRIMARY KEY("user_id" AUTOINCREMENT))').run();


const credentials = require('./credentials.js');
var scopes = [
  'user-read-private',
  'user-read-email',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-private',
  'playlist-modify-public'
];

var sapi = new SpotifyWebApi(credentials);
getRefreshToken = database.prepare('SELECT refresh_token FROM user WHERE user_id = 0');
refreshToken = getRefreshToken.get();
if (refreshToken) {
  sapi.setRefreshToken(refreshToken.refresh_token);
  refreshAccessToken();
}

app.set('view engine', 'ejs');

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get('/login', (req, res) => {
  var authorizeURL = sapi.createAuthorizeURL(scopes);
  res.redirect(authorizeURL);
})

app.get('/callback', (req, res) => {
  var code = req.query.code;
  sapi.authorizationCodeGrant(code).then(
    function(data) {
      console.log('The token expires in ' + data.body['expires_in']);
      console.log('The access token is ' + data.body['access_token']);
      console.log('The refresh token is ' + data.body['refresh_token']);
      console.log('The token is ' + data.body['token_type']);
      sapi.setAccessToken(data.body['access_token']);
      sapi.setRefreshToken(data.body['refresh_token']);
      const insertToken = database.prepare('INSERT INTO user (user_id, refresh_token) VALUES (0, ?) ON CONFLICT(user_id) DO UPDATE SET refresh_token = excluded.refresh_token');
      insertToken.run(data.body['refresh_token']);
    },
    function(err) {
      console.log('Something went wrong!', err);
    }
  );
  setTimeout(() => {
    res.redirect('/tools');
  }, 2000);
})


const tools = require('./routes/tools');
const api = require('./routes/api');
const { get } = require('http');
app.use(attachAPI);
app.use(isLoggedIn);
app.use('/tools', tools);
app.use('/api', api);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})


//Middleware to attach the Spotify API to every request
function attachAPI(req, res, next) {
  req.sapi = sapi;
  next();
}

//Middleware to check if the user is logged in on every request
function isLoggedIn(req, res, next) {
  if (sapi.getAccessToken() == null) {
    res.redirect('/');
  } else {
    next();
  }
}

//refresh the access token
function refreshAccessToken() {
  sapi.refreshAccessToken().then(
    function(data) {
      console.log('The access token has been refreshed!');

      // Save the access token so that it's used in future calls
      sapi.setAccessToken(data.body['access_token']);
      if (data.body['refresh_token']) {
        sapi.setRefreshToken(data.body['refresh_token']);
        const insertToken = database.prepare('INSERT INTO user (user_id, refresh_token) VALUES (0, ?) ON CONFLICT(user_id) DO UPDATE SET refresh_token = excluded.refresh_token');
        insertToken.run(data.body['refresh_token']);
      }
    },
    function(err) {
      console.log('Could not refresh access token', err);
    }
  );
}

//refresh access token every 55 minutes, as it expires after 1 hour
setInterval(refreshAccessToken, 1000 * 60 * 55);