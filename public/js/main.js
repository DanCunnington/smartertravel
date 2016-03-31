//Faye client
//var client;

var map;

var group;

var showDebugBBOX = true;

var watsonCalls;
var transportAPICalls;

var tweets = [];
var camerasOnRoute = [];
var busStops = [];


function status(text, spinner) {
  if (spinner) {
    $('#spinner').show();
  } else {
  	$('#spinner').hide();
  }
  $("#status").html(text);
}

function loadOperatorPicker() {
  status('Loading operators..', true);
  
  $("#operator_picker").hide();
  $("#operator_picker").off("change", operatorPicked);

/*  // get operators list data
  $.ajax({
    url: 'http://fcc.transportapi.com/v3/uk/bus/operators.json?limit=350&sort_by=count',
    dataType: 'jsonp',
    success: function(result) {*/
    
  result = operators(); //load static file instead, since currently the sort_by=count param functionality is not deployed (coming soon)
    
      status('Pick a bus route', false);
      // Got operators data. Load operators into the dropdown
      var operatorPicker = $("#operator_picker");
      operatorPicker.empty();
      operatorPicker.append("<option value='pick' selected>Pick an operator...</option>");
      $.each(result, function() {
        operatorPicker.append($("<option />").val(this.code).text(this.short_name));
      });
      operatorPicker.show();

      operatorPicker.on("change", operatorPicked);
 //   }
 // });
}

function operatorPicked() {
  operatorCode = $("#operator_picker").val()
  if (operatorCode=='pick') {
    // User selected to the non-option. flash error?
  } else {
    loadLinePicker(operatorCode);
  }
}

function loadLinePicker(operatorCode) {
  $("#line_picker").hide();
  $("#line_picker").off("change", linePicked);
  
  status('Getting bus lines for operator', true);
  $.ajax({
    url: 'http://fcc.transportapi.com/v3/uk/bus/routes/' + operatorCode + '.json',
    dataType: 'jsonp',
    success: function(result) {
    	
      status('Got lines', false);
      lines = result.lines;

      var linePicker = $("#line_picker");
      linePicker.empty();
      linePicker.append("<option value='pick' selected>Pick a line...</option>");
      $.each(lines, function() {
        linePicker.append($("<option />").val(this).text(this));
      });

      linePicker.on("change", linePicked);

      linePicker.show();
    }
  });
}

function linePicked() {
  operatorCode = $("#operator_picker").val()
  lineName = $("#line_picker").val()

  if (lineName=='pick') {
    // User selected to the non-option. flash error?
  } else {
    selectLine(operatorCode, lineName);
  }
}

function selectLine(operatorCode, lineName) {
  console.log('selected line ' + operatorCode + ' ' + lineName);
  
  mapStopsAndTweets(operatorCode, lineName, showCounts);
  
  getRouteGeometry(operatorCode, lineName, function(polyline) {	  
    polyline.addTo(group);
    map.fitBounds(polyline.getBounds());
  
    mapCamerasOnBusRoute(polyline, showCounts);
  });
}

function showCounts() {
	status('',false);
	$("#counts").html( "Bus stops: " + busStops.length + "<br>" +
		               "Tweets: " + tweets.length + "<br>" +
		               "Cameras: " + camerasOnRoute.length);
}

function initMap() {
  map = L.map('map').setView([51.505, -0.09], 13);

  group = new L.featureGroup();
  map.addLayer(group);

  L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
}

function mapStopsAndTweets(operatorCode, lineName, callback) {
  group.clearLayers();

  var url = '/disruption/' + operatorCode + '/' + lineName;
  console.log('getting bus stops from local api: ' + url);

  status('Getting stops and tweets', true);
  $.ajax({
    url: url ,
    success: function(result) {
      console.log(result);
      $("#transportAPICalls").html(result.transportAPICalls);
      status('Got stops and tweets', false);
      console.log('got disruption:');
      console.log(result);

      if (result.busStops.err) {
        alert(result.busStops.err);

      } else if (result.busStops.length==0) {
        alert('Error getting that route. No stops');

      } else {
        busStops = result.busStops;

        console.log('adding stops to map');
        for (var i=0; i<busStops.length; i++) {
          var stop = busStops[i];
          //L.marker([stop.latitude, stop.longitude]).bindPopup('stop ' + i).addTo(group);

          if (showDebugBBOX) {
            var ne = [stop.latitude+0.01, stop.longitude+0.01];
            var sw = [stop.latitude-0.01, stop.longitude-0.01];

            var bounds = [ne,sw];
            var boundingBox = L.rectangle(bounds,
            	{color: "#ff7800",
            	 weight: 1,
            	 fillOpacity: 0.1 }
            );
            group.addLayer(boundingBox);
          }
        }

        if (result.tweets.err) {
          console.log('result.tweets.err:' + result.tweets.err);
        } else {
          //tweets = result.tweets.tweets;
          tweets = result.tweets;

          for (var i=0; i<tweets.length; i++) {
            var tweet = tweets[i];
            console.log('adding tweet to map');
            console.log(tweet);
            var markerText = "<p>Text:<br><i>'" + escapeHtml(tweet.text) + "'</i></p>"/* +
                             "<p>sentimentType: '" + tweet.sentimentType + "'</p>";*/

            var lat = tweet.coordinates.coordinates[1];
            var lon = tweet.coordinates.coordinates[0];

            var TweetIcon = L.Icon.Default.extend({
            options: {
                  iconUrl: 'marker-icon-twitter.png' 
            }
         });
         var tweetIcon = new TweetIcon();

            L.marker([lat,lon],{icon: tweetIcon}).bindPopup(markerText).addTo(group);
          }
        }

        map.fitBounds(group.getBounds());
        callback();
      }
    }

  });
}


function escapeHtml(string) {
  var entityMap = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': '&quot;',
    "'": '&#39;',
    "/": '&#x2F;'
  };

  return String(string).replace(/[&<>"'\/]/g, function (s) {
    return entityMap[s];
  });
}


function plotAllCameras() {
  startMonitoring();
  $.get('/cameras/getAll', function(cameras) {
    cameras = cameras.docs;
    for (var i=0; i<cameras.length; i++) {
      var point = new L.LatLng(cameras[i].lat,cameras[i].lng);
      L.marker(point).bindPopup('Camera ' + i).addTo(group);
    }
  });
}

function getRouteGeometry(operatorCode, lineName, callback) { 
  startMonitoring();
  
  status('Getting route geometry', true);
  $.get("/polyline/"+operatorCode+"/"+lineName, function(result) {
  		  
    status('Got route geometry', false);
    var points = result.points;

    var pointList = [];
    for (var i=0; i<points.length; i++) {
      var lat = points[i][1];
      var lng = points[i][0];
      var newPoint = new L.LatLng(lat,lng);
      pointList.push(newPoint);
    }

    var polyline = L.polyline(pointList, {color: 'BLUE'});
    
    callback(polyline);
  });
}

function mapCamerasOnBusRoute(polyline, callback) {
  
  // Now get all cameras
  camerasOnRoute = [];
  status('Getting cameras along route', true);
  $.get('/cameras/getAll', function(cameras) {
  		  
    status('Got cameras', false);
    cameras = cameras.docs;
    // For each camera, check if it lies on polyline
    for (var i=0; i<cameras.length; i++) {
      var point = new L.LatLng(cameras[i].lat,cameras[i].lng);
  
      fraction = L.GeometryUtil.locateOnLine(map,polyline,point);
      interpolation = L.GeometryUtil.interpolateOnLine(map, polyline, fraction);
      locationOnLine = interpolation.latLng;
  
      distanceFromLine = locationOnLine.distanceTo(point).toFixed(0);
  
      if (distanceFromLine <= 100) {
         // point on line
         L.marker(point).bindPopup(cameras[i].filename).addTo(group);
         camerasOnRoute.push(cameras[i]);
         
         //Extend the Default marker class
         var CamIcon = L.Icon.Default.extend({
            options: {
                  iconUrl: 'marker-icon-camera.png' 
            }
         });
         var camIcon = new CamIcon();

         L.marker(point, {icon: camIcon}).bindPopup(cameras[i].filename).addTo(group);
           camerasOnRoute.push(cameras[i]);
      }
    }
    callback(camerasOnRoute);
  });
}

function drawPolyline(operator,number) {
  $.get("/polyline/"+operator+"/"+number, function(result) {
    var points = result.points;
    var pointList = [];
    for (var i=0; i<points.length; i++) {
      var lat = points[i][1];
      var lng = points[i][0];
      var newPoint = new L.LatLng(lat,lng);
      pointList.push(newPoint);
    }

  // create a red polyline from an array of LatLng points
  var polyline = L.polyline(pointList, {color: 'red'}).addTo(group);

  map.fitBounds(polyline.getBounds());
});
}


function fayeSubscriptions() {
  client.subscribe('/resetCalls',function(res){
  });

  client.subscribe('/incrementWatson',function(res){

    watsonCalls++;

    $("#watsonCalls").html(watsonCalls);
  });

  client.subscribe('/incrementTransportAPI',function(res){

    transportAPICalls++;

    $("#transportAPICalls").html(transportAPICalls);
  });
}

function startMonitoring() {
  watsonCalls = 0;
  transportAPICalls = 0;
  $("#watsonCalls").html(watsonCalls);
  $("#transportAPICalls").html(transportAPICalls);
  $.get('/startMonitoringTest',function(res){console.log(res)});
}

function getTweets() {
  startMonitoring();
  $.get('/tweets/LONDONBUS/88',function(res){
    console.log(res);
  })
}



$(document).ready(function() {
  // $.getScript('http://'+location.hostname+':8000/faye/client.js',function() {
  // });
//client = new Faye.Client("http://localhost:8000/faye");
  /*
  client.subscribe('/test',function(res){
    console.log(res);
    console.log("Yayyy Faye Client worked");
  });


  $.get('/test', function(res) {

  });*/

  //fayeSubscriptions();
  
  initMap();
  
  loadOperatorPicker();
  
  map.on('popupopen', function (e) {
    console.log(e);
    if (e.popup._content.indexOf("jpg") > -1) {
  
      var filename = e.popup._content;
      var pname = filename.split('.').join("");
      e.popup.setContent("<img src='cameraImages/"+filename+"'/><p id="+pname+">Classifying with IBM Watson....</p>");
      $.get('/classifyImage/'+filename, function(res) {
        $("#watsonCalls").html(1);
        if (res.err) {
          console.log(res.err);
          return;
        }
        console.log(res);
        if (res.confidence) {
          $("#"+pname).html("IBM Watson Classification: "+res.classification+" with a confidence score of: "+res.confidence);
        } else {
          console.log(pname);
          $("#"+pname).html("IBM Watson Classification: "+res.classification);
        }
  
      });
    }
  
  });

});

