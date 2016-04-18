var express = require('express');
var router = express.Router();
var http = require('http');
var https = require('https');

var request = require('request');

var faye = require('faye');
//var client = new faye.Client('http://localhost:8000/faye');

var watson = require('watson-developer-cloud');
var alchemy_language = watson.alchemy_language({
  api_key: process.env.WATSON_ALCHEMY_KEY
});

var visual_recognition = watson.visual_recognition({
  username: 'process.env.WATSON_VISUAL_RECOGNITION_USERNAME',
  password: 'process.env.WATSON_VISUAL_RECOGNITION_PASSWORD',
  version: 'v2-beta',
  version_date: '2015-12-02'
});


var fs = require('fs');
//var xml2js = require('xml2js');
var jsonfile = require('jsonfile');

var db = require('../utils/db.js');


var watsonCalls;
var transportAPICalls;

/* GET home page. */
router.get('/', function(req, res, next) {

    res.render('index', { title: 'Hursley Hack' });
});

// router.get('/test', function(req,res,next) {
//     client.publish('/test',{test: "testing aaron"});
// });


//Initial aim - Show disruption over the last week for a specified bus route

//Do historical data search first - Display historical tweets for desired area - Tweets are 1 week old onwards

//CCTV IMAGES - Can do realtime view - congested or not for a bus route. E.g.
//              get current congestion for route.



//GET disruption information for a particular bus number
router.get('/disruption/:operator/:number', function(req,res,next) {

    var operator = req.params.operator;
    var number = req.params.number;

    getBusStops(operator,number,function(busStops){
        if (busStops.err) {
            return res.json({'busStops': {'err': busStops.err}});
        }
        getTweetsForBusStops(operator,number,busStops,function(tweets) {

            if (tweets.err) {
                return res.json({busStops: busStops, 'tweets': {'err': tweets.err}});
            }

            sentiment(tweets,function(sentimentTweets) {

                if (sentimentTweets.err) {
                    return res.json({busStops: busStops, 'tweets': {'err': sentimentTweets.err}});
                }

                res.json({busStops: busStops, tweets: sentimentTweets, transportAPICalls: transportAPICalls});
            });
        });
    });
});


//TEST for bus stops
router.get('/busStops/:operator/:number',function(req,res,next) {
    var operator = req.params.operator;
    var number = req.params.number;

    getBusStops(operator,number,function(busStops){
        res.json({stops: busStops});
    });
});

//TEST for tweets
router.get('/tweets/:operator/:number',function(req,res,next) {
    var operator = req.params.operator;
    var number = req.params.number;

    getBusStops(operator,number,function(busStops){
        if (busStops.err) {
            return res.json({'err': busStops.err});
        }
        getTweetsForBusStops(operator,number,busStops,function(tweets) {

            if (tweets.err) {
                return res.json({'err': tweets.err});
            }

            /*
            sentiment(tweets,function(sentimentTweets) {

                if (sentimentTweets.err) {
                   return res.json({'err': sentimentTweets.err});
                }

                res.json({tweets: sentimentTweets});
            });
            */
            
            res.json({tweets: tweets});
        });
    });
});


//Callsback an array of tweet objects including sentiment data
//as well as an overall summary
function sentiment(tweets,callback) {
    return callback(tweets);

    var apiResponses = 0;
    var sentimentTweets = []
    var averageSentimentScore = 0;

    //Perform sentiment analysis on Tweets
    for (var i=0; i<tweets.length; i++) {
        (function(iteration) {
            var tweetText = tweets[iteration].text
            alchemy_language.sentiment({text: tweetText}, function (err, response) {

                emitWatsonEvent();

                apiResponses++;
                if (err) {
                    console.log('sentiment analysis error:', err);
                } else {                

                    if (response.docSentiment.score) {
                        sentimentTweets.push({'tweet': tweets[iteration], 'sentimentScore': response.docSentiment.score, 'sentimentType': response.docSentiment.type});
                        averageSentimentScore = averageSentimentScore + parseFloat(response.docSentiment.score);
                        
                    } else {
                        sentimentTweets.push({'tweet': tweets[iteration], 'sentimentScore': 0, 'sentimentType': response.docSentiment.type});
                    }

                    if (apiResponses == tweets.length) {

                        //Finish
                        var avgSent = averageSentimentScore/apiResponses;
                        var avgSentType;
                        if (avgSent > 0) {
                            avgSentType = 'positive';
                        } else if (avgSent < 0) {
                            avgSentType = 'negative';
                        } else {
                            avgSentType = 'neutral';
                        }

                        callback({'averageSentimentScore': avgSent, 'averageSentimentType': avgSentType, 'numberOfTweets': sentimentTweets.length, 'tweets': sentimentTweets});

                    }
                } 
            });
        })(i);
    }

    if (tweets.length == 0) {
        callback({"err": "no tweets"});
    } 
}


function getTweetsForBusStops(operator,number,busStops,callback) {
    //Get Twitter Data through transport api transport buzz around a specific location
    //for the past week.

    //For all bus stops on the route
    var tweets = [];
    var tweetIds = [];
    var numberOfRequests = 0;
    for (var i=0; i<busStops.length; i++) {
        (function(iteration) {

            var box = getBoundingBox(busStops[i].latitude, busStops[i].longitude);

            //Make a request to transport api
            url = 'http://transportapi.com/v3/uk/buzz/tweets.json?' + 
              'app_id='+process.env.TRANSPORT_API_APP_ID+'&app_key='+process.env.TRANSPORT_API_APP_KEY+'&' +
              'q=bus&' +
              'limit=1000&' + 
              'within='+box.sw.lon+','+box.sw.lat+','+box.ne.lon+','+box.ne.lat;

            console.log(url);
            
            request(url, function (error, response, body) {
            		
                emitTransportAPIEvent();

                var incomingTweets = JSON.parse(body);
                if (incomingTweets.error) {
                    return callback({err: incomingTweets.error});
                }
                numberOfRequests++;
                if (!error && response.statusCode == 200) {

                    for (var j=0; j<incomingTweets.length; j++) {
                    
                        // console.log(incomingTweets[j]._id);
                        // console.log(tweets);
                        //check if id exists in tweet ids array
                        if (tweetIds.indexOf(incomingTweets[j]._id) == -1) {
                        	// We don't already have it. Add to array
                        	
                            tweets.push( incomingTweets[j] ); //(Whole structure as returned by TransportAPI)
                            tweetIds.push(incomingTweets[j]._id);
                        }
                    }
                    
                } else {
                    console.log(error);
                    console.log(response.statusCode);
                }
                
                if (numberOfRequests == busStops.length) {
                    //finish
                    if (tweets.length != 0) {
                      callback(tweets);  
                    } else {
                      callback({"err": "No tweets available for this bus route"});
                    }
                }
            });
        })(i);
        
    }  
    if (busStops.length == 0) {
        callback({"err": "No bus stops available"});
    }     
}

function getBusStops(operator,number,callback) {
    var busStops = [];
    
    getOriginAtcocodeAndDirection(operator,number,function(originAtcocode, direction) {
        // Construct a URL including the origin atcocode and tomorrows date
        var d = new Date();
        d.setDate(d.getDate() + 1) //tomorrow
        var date = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
        
        var time = '9:00';
        var url = 'http://fcc.transportapi.com/v3/uk/bus/route/'+operator+'/'+number+'/' + direction + '/'+originAtcocode+'/'+date+'/'+time+'/timetable.json';
   
        //Get geolocation data from transport api - get all bus stop locations for this operator and number
        request(url, function (error, response, body) {
            emitTransportAPIEvent();
          console.log('Getting stops. (post-redirect) URL:' + response.request.uri.href);
          var data = JSON.parse(body);
          if (data.error) {
        	  return callback({err: data.error});
          }
          
          if (!error && response.statusCode == 200) {
            //Extract bus stop name and location
            var stops = data.stops;
            if (stops) {
                for (var i=0; i<stops.length; i++) {
          
                    busStop = stops[i];
                    busStops.push({"name": busStop.name, "atcocode": busStop.atcocode, "latitude": busStop.latitude, "longitude": busStop.longitude });
                }   
                callback(busStops);
            } else {
                callback({"err": "No bus stops returned from TransportAPI"});
            }
            
          } else {
            console.log(error);
            console.log(response.statusCode);
          }
          
        });
    
   });
}


// Get the origin atcocode for the specifed bus route
// To do this we have to do a call and parse it out of the redirected URL
// (Which is not ideal! to be improved by TransportAPI)
function getOriginAtcocodeAndDirection(operator,number,callback) {
    var url = 'http://fcc.transportapi.com/v3/uk/bus/route/'+operator+'/'+number+'/timetable.json';
    
    request(url, function (error, response, body) {
      emitTransportAPIEvent();
      postRedirectURL = response.request.uri.href;
      console.log('postRedirectURL:' + postRedirectURL);
      tokens = postRedirectURL.split('/');
      direction = tokens[9];
      atcocode = tokens[10];
      callback(atcocode, direction);
    });
}



function getPolylineForBusRoute(operator,number,callback) {
    
    var polyLinePoints = [];
    //Get geolocation data from transport api - get all bus stop locations for this operator and number
    request('http://fcc.transportapi.com/v3/uk/bus/route/'+operator+'/'+number+'/timetable.json?edge_geometry=true', function (error, response, body) {

        emitTransportAPIEvent();
        var timetable = JSON.parse(body);
        if (timetable.error) {
            return callback({err: timetable.error});
        }
      if (!error && response.statusCode == 200) {

        //Extract bus stop name and location
        var stops = timetable.stops;
        if (stops) {
            for (var i=0; i<stops.length; i++) {

                busStop = stops[i];
                if (busStop.next) {
                    var polyline = busStop.next.coordinates;
                    for (var j=0; j<polyline.length; j++) {
                        polyLinePoints.push(polyline[j]);
                    }
                }
                
                //busStops.push({"name": busStop.name, "atcocode": busStop.atcocode, "latitude": busStop.latitude, "longitude": busStop.longitude });
            }   
            callback(polyLinePoints);
        } else {
            callback({"err": "No bus stops returned from TransportAPI"});
        }
        
      } else {
        console.log(error);
        console.log(response.statusCode);
      }
    });
}

function getBoundingBox(lat,lon) {
    return {ne: {lat: lat+0.01, lon: lon+0.01}, sw: {lat: lat-0.01, lon: lon-0.01}}
}



//Get visual recognition data through IBM Watson
            //Get list of CCTV cameras that are on the bus route
            //Take screen shot of each of these cameras
            //Run through visual recognition
            //Get classification results


//Write a crawler to hit TFL API
//Use this xml list
//file:///C:/Users/IBM_ADMIN/Downloads/jamcams-camera-list.xml

//parse it, extract file names for each camera.

//write a node script which then polls below endpoint for all cameras, save the image on hard disk
//http://www.tfl.gov.uk/tfl/livetravelnews/trafficcams/cctv/00001.01301.jpg

router.get('/cctv/startScraping', function(req,res,next) {
    parseCameraXML(function(json) {
        json = JSON.parse(json);
        var file = 'cameralist.json'
        
         
        // jsonfile.writeFile(file, JSON.parse(json), function (err) {
        //   console.error(err)
        // })

       var cameras = json.syndicatedFeed.cameraList[0].camera;//.cameraList.camera;
       var imagesDownloaded = 0;
       var bulkInsert = [];
        for (var i=0; i<cameras.length; i++) {
            (function(iteration){ 
                //Get filename, make request, save data to database
                var filename = cameras[i].file[0];
                //Get lat long
                var lat = cameras[i].lat[0];
                var lng = cameras[i].lng[0];

                var mongoObj = {filename: filename, lat: lat, lng: lng};
                bulkInsert.push(mongoObj);
                

                        //Make HTTP Request and download image
                        // downloadImage('http://www.tfl.gov.uk/tfl/livetravelnews/trafficcams/cctv/'+filename, 'cameraImages/'+filename, function(){
                        //   imagesDownloaded++;

                        //   if (imagesDownloaded == cameras.length) {
                        //     console.log("Finished ---------------");
                        //     res.json({"res": "finished"});
                        //   }
                        // });  
            })(i);
        }

        //Add to database
        // db.addBulk(bulkInsert, function() {

        //     res.json({"res": "finished"});
        // }) 
   });   
});

router.get('/cameras/getAll', function(req,res,next) {
    getAllCameras(function(cameras) {
        res.json({docs: cameras});
    }); 
});



function getAllCameras(callback) {
    db.viewCameras(function(docs) {
        callback(docs);
    });
}



router.get('/polyline/:operator/:number',function(req,res,next) {

    var operator = req.params.operator;
    var number = req.params.number;
    
    getPolylineForBusRoute(operator,number, function(result) {
        res.json({points: result});
    });
});


router.get('/classifyImage/:filename', function(req,res,next) {
    //The service classifies and scores the images according to the selected classifiers on a range 0 - 1, 
    //where higher scores indicate greater correlation. A classifier's score is indicated by the score 
    //parameter. The service returns classifiers that meet a threshold score of at least 0.5. 
    //If no classifiers receive a score greater than 0.5, then no classifiers are returned.
    var filename = req.params.filename;
    var params = {
      images_file: fs.createReadStream('public/cameraImages/'+filename),
      classifier_ids: ['smartertravel_1454588344']
    };

    visual_recognition.classify(params, function(err, response) {
         emitWatsonEvent();
      if (err) {
        console.log(err);
        res.json({'err': err});    
      } else {
        console.log(JSON.stringify(response, null, 2));
        //res.json(response);

        //Get score and classification
        var result = response.images[0];
        if (result.scores) {
            result = result.scores[0];        
            //this indicates a positive classification
            res.json({classification: "Congested", confidence: result.score})
        } else {
            res.json({classification: "Not Congested"});
        }

      }
        
    });
});

function downloadImage(uri, filename, callback){

    request(uri).pipe(fs.createWriteStream(filename)).on('close', callback);

    // request.get(uri).on('error', function(err) {
    //     console.log(err);
    // }).pipe(fs.createWriteStream(filename)).on('close', function(){callback()});
    // var options = {
    //     host: uri
    //   , port: 80
    // }

    // http.get(options, function(res){
    //     var imagedata = ''
    //     res.setEncoding('binary')

    //     res.on('data', function(chunk){
    //         imagedata += chunk
    //     });

    //     res.on('end', function(){
    //         fs.writeFile(filename, imagedata, 'binary', function(err){
    //             if (err) throw err
    //             console.log('File saved.');
    //             callback();
    //         });
    //     });
    // });
}





function parseCameraXML(callback) {
     var XMLPath = "jamcams-camera-list.xml";
     callback(loadXMLDoc(XMLPath));
    function loadXMLDoc(filePath) {
        
        var json;
        try {
            var fileData = fs.readFileSync(filePath, 'ascii');

            var parser = new xml2js.Parser();
            parser.parseString(fileData.substring(0, fileData.length), function (err, result) {
            json = JSON.stringify(result);
           // console.log(JSON.stringify(result));
        });

//        console.log("File '" + filePath + "/ was successfully read.\n");
        return json;
    } catch (ex) {console.log(ex)}
 }
}

router.get('/startMonitoringTest', function(req,res,next) {
    startMonitoring();
    res.json({"status": "ok"});
});

function startMonitoring() {
    watsonCalls = 0;
    transportAPICalls = 0;

    //client.publish('/resetCalls', {'test':'testing'});
}

function emitWatsonEvent() {
    //client.publish('/incrementWatson', {'tester':'testing'});
    watsonCalls++;
}

function emitTransportAPIEvent() {
    //client.publish('/incrementTransportAPI', {'tester':'testing'});
    transportAPICalls++;
}

module.exports = router;
