var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

require('dotenv').config();
var routes = require('./routes/index');

var http = require('http');

//Faye client
var faye = require('faye');

//Instantiate the app and also mount the faye server on port 8000
var app = express(),
    server = http.createServer(app),
    bayeux = new faye.NodeAdapter({mount : '/faye', timeout: 120});

bayeux.attach(server);
//server.listen(8888);
bayeux.on('handshake', function(clientId) {
    console.log('Client connected', clientId);
});


// cfenv provides access to your Cloud Foundry environment
// for more info, see: https://www.npmjs.com/package/cfenv
var cfenv = require('cfenv');



// view engine setup
app.set('views', path.join(__dirname, 'views'));


// uncomment after placing your favicon in /public
//app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));


app.use('/', routes);
app.set('view engine', 'ejs');

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

//error handlers

//development error handler
//will print stacktrace
if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});


// get the app environment from Cloud Foundry
//var appEnv = cfenv.getAppEnv();

// start server on the specified port and binding host
// app.listen(3000, function() {

// 	// print a message when the server starts listening
//   console.log("server starting on localhost:3000");
// });
var appEnv = cfenv.getAppEnv();

// start server on the specified port and binding host
server.listen(appEnv.port, '0.0.0.0', function() {

    // print a message when the server starts listening
  console.log("server starting on " + appEnv.url);
});

module.exports = app;
