const express = require('express');
const router = express.Router();

const { DatabaseSync } = require('node:sqlite');
const database = new DatabaseSync('db.db');

//API call to toggle playback
router.put('/pp', (req, res) => {
    req.sapi.getMyCurrentPlaybackState({ market: 'DE' })
    .then(data => {
        if(data.body.is_playing) {
            req.sapi.pause()
            .then(data => {
                res.send('paused')
            })
            .catch(err => {
                console.log(err);
                res.send(err)
            })
        } else {
            req.sapi.play()
            .then(data => {
                res.send('playing')
            })
            .catch(err => {
                console.log(err);
                res.send(err)
            })
        }
    })
});

//API call to start playback of a specific track
router.put('/play/:id', (req, res) => {
    req.sapi.getMyCurrentPlaybackState({ market: 'DE' })
    .then(data => {
        if (data.body.is_playing && data.body.item.id == req.params.id) {
            res.send('already playing');
        } else {
            req.sapi.play({ uris: [req.params.id] })
            .then(data => {
                res.send('playing');
            })
            .catch(err => {
                console.log(err);
                res.send(err);
            });
        }
    })
    .catch(err => {
        console.log(err);
        res.send(err);
    });
});

//API call to pause playback
router.put('/pause', (req, res) => {
    req.sapi.pause()
    .then(data => {
        res.send('paused')
    })
    .catch(err => {
        console.log(err);
        res.send(err)
    })
});

//API call to seek to a specific position in the current track
router.put('/seekTo', (req, res) => {
    req.sapi.seek(req.body.position)
    .then(data => {
        res.send('seeked');
    })
    .catch(err => {
        console.log(err);
        res.send(err);
    });
});

//API call to get current playback position
router.get('/progress', (req, res) => {
    req.sapi.getMyCurrentPlaybackState({ market: 'DE' })
    .then(data => {
        res.send({'position': data.body.progress_ms, 'id': data.body.item ? data.body.item.id : 'private', 'linked_from_id': data.body.item ? data.body.item.linked_from ? data.body.item.linked_from.id : 'not linked' : 'private'});
    })
});

//API call to add a tag
router.put('/tags/add', (req, res) => {
    const tagInsert = database.prepare('INSERT INTO tags (tag, display) VALUES (?, ?) ON CONFLICT(tag) DO UPDATE SET display = excluded.display');
    tagInsert.run(req.body.tag, req.body.display);
    res.send('Tag added');
});

//API call to remove a tag
router.delete('/tags/delete', (req, res) => {
    const tagDelete = database.prepare('DELETE FROM tags WHERE tag = ?');
    tagDelete.run(req.body.tag);
    res.send('Tag deleted');
});

//API call to add tracks tags to DB
router.put('/tag/:id', (req, res) => {
    const trackInsert = database.prepare('INSERT INTO tracks (uri, tags) VALUES (?, ?) ON CONFLICT(uri) DO UPDATE SET tags = excluded.tags');
    //console.log(req.body.tags);
    trackInsert.run(req.params.id, JSON.stringify(req.body.tags));
    res.send('Tag added');
});

//API call to merge playlists
router.post('/merge', merge, (req, res) => {
    res.send('Merged');
});

//Middleware to merge playlists
async function merge (req, res, next){

    var playlists = req.body.playlists;
    var tagsNeeded = req.body.tagsNeeded;
    var tagsExcluded = req.body.tagsExcluded;
    var mergeTo = req.body.mergeTo;

    //get tracks for all playlists from DB
    //TODO: maybe get up to date list from Spotify; db is used to avoid multiple API calls when tagging 
    var playlistTracks = [];
    for (var i = 0; i < playlists.length; i++) {
        const playlistGet = database.prepare('SELECT tracks FROM playlists WHERE uri = ?');
        const playlist = JSON.parse(playlistGet.get(playlists[i]).tracks);
        playlistTracks.push(playlist);
    }
    //array of counters for all playlists 
    var counters = [];
    for (var i = 0; i < playlists.length; i++) {
        counters.push(0);
    }
    //merge by date added
    //compare dateAdded for songs at all current counters, choose oldest, increment counter for playlist, get song tags from DB, check them and add to final list, repeat till all playlists are empty
    var mergedTracks = [];
    while (true) {
        var oldest = null;
        var oldestIndex = null;
        for (var i = 0; i < playlists.length; i++) {
            if (counters[i] < playlistTracks[i].length) {
                if (oldest == null || playlistTracks[i][counters[i]].added_at < oldest) {
                    oldest = playlistTracks[i][counters[i]].added_at;
                    oldestIndex = i;
                }
            }
        }
        if (oldest == null) {
            break;
        }
        var track = playlistTracks[oldestIndex][counters[oldestIndex]];
        counters[oldestIndex]++;
        //TODO: add support for local tracks
        if (track.is_local) {
            continue;
        }
        const getTags = database.prepare('SELECT tags FROM tracks WHERE uri = ?');
        const response = getTags.get(track.track.id);
        var tags = response ? JSON.parse(response.tags) : [];
        var add = true;
        for (var i = 0; i < tagsNeeded.length; i++) {
            if (!tags.includes(tagsNeeded[i])) {
            add = false;
            break;
            }
        }
        if (!add) {
            continue;
        }
        for (var i = 0; i < tagsExcluded.length; i++) {
            if (tags.includes(tagsExcluded[i])) {
            add = false;
            break;
            }
        }
        if (add) {
            mergedTracks.push(track);
        }
    }
    //call Spotify API and add final list to mergeTo, limit is 100, loop accordingly
    //TODO: maybe make unique uris toggleable
    var uris = new Set();
    console.log(mergedTracks.length);
    for (var i = 0; i < mergedTracks.length; i++) {
        uris.add(mergedTracks[i].track.uri);
    }
    uris = [...uris];
    var i = 0;
    while (i < uris.length) {
        var uris100 = uris.slice(i, i + 100);
        req.sapi.addTracksToPlaylist(mergeTo, uris100)
        .catch(err => {
            console.log(err);
        });
        i += 100;
        //wait for 100ms to avoid wrong order
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    next();
}

module.exports = router;