# Custom Spotify Playlistfilter

Define cutom tags, tag songs, filter and merge your playlists with them

You need Spotify Premium to use this since it controlls the active Spotify session to play the songs you are tagging
## Installation

1. Install the dependencies:
    ```sh
    npm install
    ```

2. Create a Spotify app [here](https://developer.spotify.com/dashboard)

3. Set Redirect URI to `http://localhost:3000/callback`. API/SKD to `Web API`

4. Copy the `credentials.js.template` to `credentials.js` and fill in your Client ID and secret

5. Run with:
    ```sh
    node app.js
    ```

6. Open Spotify on any device

7. Navigate to `http://localhost:3000`

## Development
I designed this mostly for my own needs, but requests (and PRs) are welcome!