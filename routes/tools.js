const express = require('express');
const router = express.Router();

const { DatabaseSync } = require('node:sqlite');
const database = new DatabaseSync('db.db');

//Links to all tool pages
router.get('/', (req, res) => {
    res.render('tools');
});

//create and delete tags
router.get('/tags', (req, res) => {
    const getTags = database.prepare('SELECT * FROM tags');
    const tags = getTags.all();
    res.render('tags', {'tags': tags});
});

//show all playlists
router.get('/playlists', (req, res) => {
    req.sapi.getUserPlaylists()
    .then(data => {
        res.render('playlists', data.body);
    })
    .catch(err => {
        console.log(err);
        res.render('playlists')
    })
});

//shows all tracks in a playlist
router.get('/playlists/:id', getAllTracks, (req, res) => {
        const playlistInsert = database.prepare('INSERT INTO playlists (uri, tracks) VALUES (?, ?) ON CONFLICT(uri) DO UPDATE SET tracks = excluded.tracks');
        playlistInsert.run(req.params.id, JSON.stringify(req.tracks));
        res.render('playlist', {'tracks': req.tracks, 'id': req.params.id});
});

//shows tracks from playlist in order and allows tagging
router.get('/playlists/:id/tag/:no', (req, res) => {
    const playlistGet = database.prepare('SELECT tracks FROM playlists WHERE uri = ?');
    const playlist = JSON.parse(playlistGet.get(req.params.id).tracks);
    const track = playlist[req.params.no];
    //console.log(track);
    if(track) {
        if (track.is_local) {
            res.render('tagLocal', {'no': req.params.no, 'id': req.params.id});
            return;
            //TODO: add support for local tracks
        }
        req.sapi.getMyCurrentPlaybackState({ market: 'DE' })
        .then(data => {
            if (data.body.is_playing && (data.body.item.id == track.track.id || data.body.item.linked_from?.id == track.track.id)) {	
            } else {
            req.sapi.play({ uris: [track.track.uri] })
            .then(data => {
                console.log('Play "' + track.track.name + '" | Status: ' + data.statusCode);
                playCheck(track, req);
            })
            .catch(err => {
                console.log(err);
            });
            }
        })
        .catch(err => {
            console.log(err);
        });
        const getTags = database.prepare('SELECT tags FROM tracks WHERE uri = ?');
        const response = getTags.get(track.track.id);
        var tags = response ? JSON.parse(response.tags) : [];
        const getAvailableTags = database.prepare('SELECT * FROM tags');
        var availableTags = getAvailableTags.all();
        //console.log(tags);
        res.render('tag', {'track': track, 'no': req.params.no, 'id': req.params.id, 'tags': tags, 'availableTags': availableTags});
    } else {
        res.send('Track not found');
    }
});

//TODO
//allows tagging fror individual tracks, out of playlist order
router.get('/songs/:id/tag', (req, res) => {
    res.send('TODO');
});

//merge playlists based on tags
router.get('/filter', (req, res) => {
    const getTags = database.prepare('SELECT * FROM tags');
    const tags = getTags.all();
    req.sapi.getUserPlaylists()
    .then(data => {
        res.render('filter', {'items':data.body.items, 'tags': tags});
    })
    .catch(err => {
        console.log(err);
        res.render('filter')
    })
});

//Middleware to get all tracks in a playlist
async function getAllTracks(req, res, next) {
    let tracks = [];
    let nextUrl = null;

    try {
        do {
            const data = await req.sapi.getPlaylistTracks(req.params.id, { offset: tracks.length });
            tracks = tracks.concat(data.body.items);
            nextUrl = data.body.next;
        } while (nextUrl);

        req.tracks = tracks;
        next();
    } catch (err) {
        console.log(err);
        res.status(500).send('Error fetching tracks');
    }
}


//Workaround for play call sometimes not working
var checkTimeoutID = null;
function playCheck(track, req) {
    clearTimeout(checkTimeoutID);
    checkTimeoutID = setTimeout(() => {
        req.sapi.getMyCurrentPlaybackState({ market: 'DE' })
        .then(data => {
            if (data.body.device.is_private_session) {
                console.log('Checked: Private session');
                return;
            }
            if (data.body.is_playing && (data.body.item.id == track.track.id || data.body.item.linked_from?.id == track.track.id)) {
                console.log('Checked: Actually playing');
            } else {
                console.log('Checked: Not playing');
                req.sapi.play({ uris: [track.track.uri] })
                .then(data => {
                    console.log('Retry "' + track.track.name + '" | Status: ' + data.statusCode);
                })
                .catch(err => {
                    console.log(err);
                });
            }
        })
        .catch(err => {
            console.log(err);
        });
    }, 1000);
}


module.exports = router;