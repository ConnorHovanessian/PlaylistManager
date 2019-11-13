/**
 * This is an example of a basic node.js script that performs
 * the Authorization Code oAuth2 flow to authenticate against
 * the Spotify Accounts.
 *
 * For more information, read
 * https://developer.spotify.com/web-api/authorization-guide/#authorization_code_flow
 */

var express = require('express'); // Express web server framework
var request = require('request'); // "Request" library
const bodyParser = require('body-parser');
var cors = require('cors');
var querystring = require('querystring');
var cookieParser = require('cookie-parser');

var client_id = '10ba0bec142940c68112ab872a1f1e0d'; // Your client id
var client_secret = '1fcc16596ce44d2085d5b484a9c1cae8'; // Your secret
var redirect_uri = 'http://localhost:8888/callback'; // Your redirect uri

/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
var generateRandomString = function(length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

var stateKey = 'spotify_auth_state';
var app = express();
var userID = "sampleID";
var access_token = "sampleAccessToken";

app.use(express.static(__dirname + '/public'))
   .use(cors())
   .use(cookieParser());

app.get('/login', function(req, res) {

  var state = generateRandomString(16);
  res.cookie(stateKey, state);

  // your application requests authorization
  var scope = 'user-read-private user-read-email playlist-read-private playlist-read-collaborative playlist-modify-public playlist-modify-private';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: scope,
      redirect_uri: redirect_uri,
      state: state
    }));
});

app.get('/callback', function(req, res) {

  // your application requests refresh and access tokens
  // after checking the state parameter

  var code = req.query.code || null;
  var state = req.query.state || null;
  var storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }));
  } else {
    res.clearCookie(stateKey);
    var authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code: code,
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code'
      },
      headers: {
        'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
      },
      json: true
    };

    request.post(authOptions, function(error, response, body) {
      if (!error && response.statusCode === 200) {

        access_token = body.access_token;
        var refresh_token = body.refresh_token;

        var options = {
          url: 'https://api.spotify.com/v1/me',
          headers: { 'Authorization': 'Bearer ' + access_token },
          json: true
        };

        // use the access token to access the Spotify Web API
        request.get(options, function(error, response, body) {
          console.log(body);
          userID = body.id;
        });

        // we can also pass the token to the browser to make requests from there
        res.redirect('/#' +
          querystring.stringify({
            access_token: access_token,
            refresh_token: refresh_token
          }));
      } else {
        res.redirect('/#' +
          querystring.stringify({
            error: 'invalid_token'
          }));
      }
    });
  }
});
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.get('/refresh_token', function(req, res) {
  // requesting access token from refresh token
  var refresh_token = req.query.refresh_token;
  var authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
    form: {
      grant_type: 'refresh_token',
      refresh_token: refresh_token
    },
    json: true
  };
  request.post(authOptions, function(error, response, body) {
    if (!error && response.statusCode === 200) {
      var access_token = body.access_token;
      res.send({
        'access_token': access_token
      });
    }
  });
});


app.post('/split_playlist', (req, res) => {
  console.log(`Playlist name is: ${req.body.pname}.`);
  var originalName = req.body.pname;

  //GET https://api.spotify.com/v1/playlists/{playlist_id}/tracks

  var options = {
    url: 'https://api.spotify.com/v1/playlists/' + req.body.pid + '/tracks',
    headers: { 'Authorization': 'Bearer ' + access_token },
    json: true
  };
  var trackYears = [];
  var trackIDs = [];
  var originalName = req.body.pname;
  getTracks(options, trackYears, trackIDs, originalName);
});

//Used to recursively get pages of tracks from playlist: ends when body.url = null
const getTracks = function(options, trackYears, trackIDs, originalName) {
  console.log('original name: ' + originalName);
  if(options.url !=null ){
    request.get(options, function(error, response, body) {
      if (!error && response.statusCode === 200) {
        options.url = body.next;
        for(i = 0; i<body.items.length; i++)
        {
            //console.log(body.items[i].added_at.substring(0,4) + " " + body.items[i].track.id);
            trackYears.push(body.items[i].added_at.substring(0,4));
            trackIDs.push(body.items[i].track.uri);
        }
        console.log("Current size of trackYears: " + trackYears.length);
        getTracks(options, trackYears, trackIDs, originalName);
      }
      else{
        console.log(response.statusCode + "  " + response.statusMessage);
        options.url = null;
        return response.statusCode;
      } 
    });
  }
  //Only hit when all tracks are categorized by year
  else {
    var uniqueYears = onlyUnique(trackYears);

    for(i=0;i<uniqueYears.length;i++){
      var trackIDsByYear = []
      for(j=0;j<trackYears.length;j++){
        if(trackYears[j] == uniqueYears[i]){
          trackIDsByYear.push(trackIDs[j]);
        }
      }
      var playlistName = originalName + " " + uniqueYears[i];
      makePlaylist(playlistName, trackIDsByYear);
    }
  }
};

function onlyUnique(fullArray) { 
  var arr = [];
  var set = new Set();
  for(i=0;i<fullArray.length;i++){
    if(!set.has(fullArray[i])){
      set.add(fullArray[i]);
      arr.push(fullArray[i]);
    }
  }
  console.log(arr);
  return(arr);
}

//POST https://api.spotify.com/v1/users/{user_id}/playlists
const makePlaylist = function(name, trackIDs) {
  var options = {
    url: 'https://api.spotify.com/v1/users/'+userID+'/playlists',
    headers: { 'Authorization': 'Bearer ' + access_token },
    body: JSON.stringify({
      'name': name,
      'public': false
  })
  };
  request.post(options, function(error, response, body) {
    if (!error && (response.statusCode === 200 || response.statusCode === 201)) {
      var parsed = JSON.parse(body);
      fillPlaylist(parsed.id, trackIDs);
    }
    else{
      console.log(response.statusCode + "  " + response.statusMessage);
      console.log(body);
      options.url = null;
      return response.statusCode;
    }
  });
}

//POST https://api.spotify.com/v1/playlists/{playlist_id}/tracks
const fillPlaylist = function(playlistID, trackIDs) {

  var toFill = trackIDs.length;
  var numCallsNeeded = Math.ceil(toFill / 100);

  //Can only send 100 tracks at a time, so we iterate per 100
  for(i=0; i<numCallsNeeded; i++)
  {
    var trackIDsSegment = trackIDs.slice(0+100*i, Math.min(100 + 100*i, toFill));

    var options = {
      url: 'https://api.spotify.com/v1/playlists/'+playlistID+'/tracks',
      headers: { 'Authorization': 'Bearer ' + access_token },
      body: JSON.stringify({
        'uris': trackIDsSegment
    })
    };

    request.post(options, function(error, response, body) {
      if (!error && (response.statusCode === 200 || response.statusCode === 201)) {
      }
      else{
        console.log('fill unsuccessful');
        console.log(response.statusCode + "  " + response.statusMessage);
        console.log(body);
        return response.statusCode;
      } 
    });
  }
}

console.log('Listening on 8888');
app.listen(8888);