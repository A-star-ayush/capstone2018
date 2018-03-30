// TODO : passwd should not be displayed while typing

const serverAddress = "https://13.126.97.148:10000/";
const geocodeAddress = "https://maps.googleapis.com/maps/api/geocode/";
const jsonHook = "json?";
const userHook = "usr?";
const gpsHook = "gps?";
const wisdomHook = "wisdom?";

window.onload = function() {
	var gpsForm = document.getElementById("gpsForm");
	var userForm = document.getElementById("userForm");
	var analyticForm = document.getElementById("analyticForm");

	var googleMap = document.getElementById("googleMap");
	var geocodeOutput = document.getElementById("geocodeOutput");
	var analyticOutput = document.getElementById("analyticOutput");

	var session = 0;
	var https = require('https');

	// to allow node to connect through https to websites with self-signed certificates
	process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

	function myMap(lat, lng) {
		var mapProp = {
    		center:new google.maps.LatLng(lat, lng),
    		zoom:15,
		};
			
		var map = new google.maps.Map(googleMap, mapProp);
	
		var marker = new google.maps.Marker({
          position: new google.maps.LatLng(lat, lng),
          map: map
        });
        googleMap.style.display = "block";
	}

	function makeHTTPSRequest(https_address, hook, req, callback) {
		https.get(https_address + hook + req, function(res) {
			res.setEncoding('utf8');
			var result = "";
			res.on('data', function(data) {
				result = result + data;
			});
			res.on('end', function() {
				var data = null;
				if (res.statusCode == 200)
					data = JSON.parse(result);
				callback(res.statusCode, data);
			});
		}); 
	}

	userForm.onsubmit = function(e) {
		e.preventDefault();
		var name = userForm.name.value;
		var pass = userForm.pass.value;
		var request = "name=" + name + "&pass=" + pass;
		makeHTTPSRequest(serverAddress, userHook, request, userCallback);
	};

	gpsForm.onsubmit = function(e) {
		e.preventDefault();
		var time = gpsForm.time.value;
		var source = gpsForm.source.value;
		var request = "time=" + time + "&source=" + source + "&session=" + session;
		makeHTTPSRequest(serverAddress, gpsHook, request, gpsCallback);
	};

	analyticForm.onsubmit = function(e) {
		e.preventDefault();
		var timeFrom = analyticForm.timeFrom.value;
		var time = analyticForm.time.value;
		var source = analyticForm.source.value;
		var intervals = analyticForm.intervals.value;

		var request = "source=" + source;	
		if (timeFrom.length > 0)
			request += "&timeFrom=" + timeFrom;
		if (time.length > 0)
			request += "&time=" + time;
		if (intervals.length > 0)
			request += "&intervals=" +intervals;
		request += "&session=" + session;

		makeHTTPSRequest(serverAddress, wisdomHook, request, analyticCallback);
	};


	function gpsCallback(statusCode, data) {
		if (statusCode != 200) {
			googleMap.style.display = "";
			geocodeOutput.innerHTML = "Invalid server request";
		}
		else {
			var first = data[0];
			myMap(first.lat, first.lng);
			var request = "latlng=" + first.lat +"," + first.lng + "&key=AIzaSyAj3V84hCmsgzxp_x_YESVNY1ttjgsoFY4";
			geocodeOutput.innerHTML = "";
			makeHTTPSRequest(geocodeAddress, jsonHook, request, geocodeCallback);
		}
	}

	function geocodeCallback(statusCode, data) {
		if (statusCode != 200)
			geocodeOutput.innerHTML = "Invalid geocode request";
		else 
			geocodeOutput.innerHTML += data['results'][0]['formatted_address'] + "<br>";
	}

	
	function analyticCallback(statusCode, data) {
		if (statusCode != 200)
			analyticOutput.innerHTML = "Invalid request";
		else {
			analyticOutput.innerHTML = JSON.stringify(data);
		}
	}

	
	function userCallback(statusCode, data) {
		if (statusCode != 200)
			geocodeOutput.innerHTML = analyticOutput.innerHTML = "Not logged in.";
		else {
			session = data.session;
			geocodeOutput.innerHTML = analyticOutput.innerHTML = "Logged in.";
		}			
	}
}