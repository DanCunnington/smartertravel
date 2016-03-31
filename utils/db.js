var exports = module.exports = {};
var mongoose = require('mongoose');

var options = { server: { socketOptions: { connectTimeoutMS: 30000 } },
replset: { socketOptions: { connectTimeoutMS : 30000 } } };

var mongodbUri = 'mongodb://dan:smartertravel@ds011389.mlab.com:11389/traffic-cameras';
var db;
var Camera;
var connected = false;

var connect = function(callbackFunc) {

	mongoose.connect(mongodbUri, options);

	db = mongoose.connection;

	db.on('error', console.error.bind(console, 'connection error:'));

	db.once('open',function callback() {

		// Create camera schema
		var cameraSchema = mongoose.Schema({
			filename: String,
			lat: String,
			lng: String,
		});

  		// Store result documents in a collection called "cameras"
  		Camera = mongoose.model('cameras', cameraSchema);

  		connected = true;
  		callbackFunc();
  	});
}

// If the Node process ends, close the Mongoose connection
process.on('SIGINT', function() {

	if (connected) {
		mongoose.connection.db.close(function () {
			console.log('Mongoose disconnected on app termination');
			process.exit(0);
		});
	} else {
		process.exit(0);
	}

});


exports.addCamera = function(camera, callback) {

	if (!connected) {
		connect(function() {
			addCameraToDb(camera,callback);
		});
	} else {
		addCameraToDb(camera,callback);
	}
}

var addCameraToDb = function(camera,callback) {
	// Create seed data
	var newCamera = new Camera({
		filename: camera.filename,
		lat: camera.lat,
		lng: camera.lng
	});


	newCamera.save(function(err) {
		if (err) {
			console.log(err);
		}

		callback();
	});
}

exports.viewCameras = function(callback) {
	if (!connected) {
		connect(function() {
			viewCamerasFromDb(callback);
		});
	} else {
		viewCamerasFromDb(callback);
	}
}

var viewCamerasFromDb = function(callback) {
	Camera.find({}).exec(function (err, docs){

		if (err) {
			console.log(err);
		}
		callback(docs);
	});
}

exports.deleteCameras = function(callback) {
	if (!connected) {
		connect(function() {
			deleteCamerasFromDb(callback);
		});
	} else {
		deleteCamerasFromDb(callback);
	}
}

var deleteCamerasFromDb = function(callback) {
	mongoose.connection.db.collection('cameras').drop(function (err) {
		if (err) {
			console.log(err);
		}
		callback();
	});
}

exports.deleteCamera = function(id,callback) {
	if (!connected) {
		connect(function() {
			deleteCameraFromDb(id,callback);
		});
	} else {
		deleteCameraFromDb(id,callback);
	}
}

var deleteCameraFromDb = function(id,callback) {
	Camera.findByIdAndRemove(id, function() {
		callback();
	});
}

exports.addBulk = function(docs,callback) {
	console.log(docs);
	if (!connected) {
		console.log("connecting");
		connect(function() {
			console.log("inserting");
			Camera.insertMany(docs, callback);	
		})
	} else {

		Camera.insertMany(docs, callback);
	}
	
}

exports.connect = connect;