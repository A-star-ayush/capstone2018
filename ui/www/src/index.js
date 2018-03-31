// TODO : passwd should not be displayed while typing

const serverAddress = "https://13.126.97.148:10000/";
const geocodeAddress = "https://maps.googleapis.com/maps/api/geocode/";
const jsonHook = "json?";
const userHook = "usr?";
const gpsHook = "gps?";
const wisdomHook = "wisdom?";

function $(id) {
	return document.getElementById(id);
}

window.onload = function() {

	var gpsForm = $("gpsForm");
	var userForm = $("userForm");
	var analyticForm = $("analyticForm");

	var googleMap = $("googleMap");
	var geocodeOutput = $("geocodeOutput");
	var analyticOutput = $("analyticOutput");

	var gpsRadioButtons = $("gpsRadioButtons");
	var gpsEntries = $("gpsEntries");
	var radio_geocodelist = $("radio_geocodelist");
	var radio_map = $("radio_map");


	var gpsData = [];
	var geocodeList = [];

	var session = 0;
	var https = require('https');
	var httpsRequestCount = 0;

	// to allow node to connect through https to websites with self-signed certificates
	process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

	function myMap() {
		var mapProp = {
    		center:new google.maps.LatLng(gpsData[0].lat, gpsData[0].lng),
    		zoom:15,
		};
			
		var map = new google.maps.Map(googleMap, mapProp);
		
		for (let i = 0; i < gpsData.length; ++i) {
			var marker = new google.maps.Marker({
          		position: new google.maps.LatLng(gpsData[i].lat, gpsData[i].lng),
          		map: map
        	});
		}
        googleMap.style.display = "block";
	}

	function makeHTTPSRequest(https_address, hook, req, callback, callback_data) {
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
				callback(res.statusCode, data, callback_data);
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

		gpsRadioButtons.style.display = "";
		googleMap.style.display = "";
		geocodeOutput.innerHTML = "";
		radio_geocodelist.checked = false;
		radio_map.checked = false;
		
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
			gpsRadioButtons.style.display = "";
			gpsData = null;
			geocodeList = null;
		}
		else {
			gpsEntries.innerHTML = "[Entries: " + data.length + "]";
			gpsRadioButtons.style.display = "block";
			geocodeOutput.innerHTML = "";
			gpsData = data;
			geocodeList = [];
		}
	}

	radio_geocodelist.onchange = radio_map.onchange = function(e) {
		if (gpsData == null)
			return;

		if (radio_geocodelist.checked) {
			googleMap.style.display = "";
			if (geocodeList.length != gpsData.length) {
				for (let i = 0; i < gpsData.length; ++i) {
					let request = "latlng=" + gpsData[i].lat +"," + gpsData[i].lng + "&key=AIzaSyAj3V84hCmsgzxp_x_YESVNY1ttjgsoFY4";
					++httpsRequestCount;
					makeHTTPSRequest(geocodeAddress, jsonHook, request, geocodeCallback, i);
				}
			}
			function displayGeocode() {
				if (httpsRequestCount != 0) {
					geocodeOutput.innerHTML = "Getting geolocations ...";
					setTimeout(displayGeocode, 1000);
				}
				else {
					geocodeOutput.innerHTML = "";
					var output = "";
					for (let i = 0; i < geocodeList.length; ++i)
						output += gpsData[i].time + " : " + geocodeList[i];
					geocodeOutput.innerHTML = output;
				}
			}
			setTimeout(displayGeocode, 100);
		} else if (radio_map.checked) {
			geocodeOutput.innerHTML = "";
			myMap();
		}
	}

	function geocodeCallback(statusCode, data, index) {
		--httpsRequestCount;
		if (statusCode != 200)
			geocodeList[index] = "Invalid geocode request" + "<br>";
		else 
			geocodeList[index] = data['results'][0]['formatted_address'] + "<br>";
	}

	
	function analyticCallback(statusCode, data) {
		if (statusCode != 200)
			analyticOutput.innerHTML = "Invalid request";
		else {
			analyticOutput.innerHTML = "Total Distance traveled: " + data[0].distance + " meters." + "<br>"
									 + "Time Elapsed: " + data[0].time + " seconds." + "<br>"
									 + "Average Speed: " + data[0].speed + " m/s." + "<br>";
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