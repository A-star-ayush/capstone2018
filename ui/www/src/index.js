const serverAddress = "https://13.127.40.45:10000/";
const geocodeAddress = "https://maps.googleapis.com/maps/api/geocode/";
const jsonHook = "json?";
const userHook = "usr?";
const gpsHook = "gps?";
const wisdomHook = "wisdom?";

window.onload = function() {

	function $(id) {
		return document.getElementById(id);
	}

	function formatTime(time) {
		if (time.length == 1) {
			time = 0;
			inputTokens = 0;
		}
		else {
			let tokens = time.split("/", 6);
			for (let i = 0; i < tokens.length; ++i) {
				if (tokens[i].length == 1)
					tokens[i] = "0" + tokens[i][0];
			}
			inputTokens = tokens.length;
			time = tokens.join('');
			if (time.length < 14) {
				let len = time.length;
				for (let i = 0; i < 14 - len; ++i)
					time += "0";
			}
		}

		return time;
	}

	function deformatTime(time) {
		let tokens = [ time.slice(0, 4), time.slice(4, 6), time.slice(6, 8),
					   time.slice(8, 10), time.slice(10, 12), time.slice(12, 14) ];
		return tokens.slice(inputTokens, 6).join(":");
	}


	var gpsForm = $("gpsForm");
	var userForm = $("userForm");
	var analyticForm = $("analyticForm");

	var googleMap = $("googleMap");
	var googleMap2 = $("googleMap2");
	var geocodeOutput = $("geocodeOutput");
	var analyticOutput = $("analyticOutput");

	var gpsRadioButtons = $("gpsRadioButtons");
	var gpsEntries = $("gpsEntries");
	var radio_geocodelist = $("radio_geocodelist");
	var radio_map = $("radio_map");
	var my_graph = $("myGraph");


	var gpsData = [];
	var geocodeList = [];

	var session = 0;
	var https = require('https');
	var httpsRequestCount = 0;
	var inputTokens = 0;

	// to allow node to connect through https to websites with self-signed certificates
	process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

	function myMap(gMap, data) {
		var mapProp = {
    		center:new google.maps.LatLng(data[0].lat, data[0].lng),
    		zoom:15,
		};
			
		var map = new google.maps.Map(gMap, mapProp);
		
		for (let i = 0; i < data.length; ++i) {
			var marker = new google.maps.Marker({
          		position: new google.maps.LatLng(data[i].lat, data[i].lng),
          		map: map
        	});
		}
        gMap.style.display = "block";
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
		
		var time = formatTime(gpsForm.time.value);
		var source = gpsForm.source.value;
		var request = "time=" + time + "&source=" + source + "&session=" + session;
		makeHTTPSRequest(serverAddress, gpsHook, request, gpsCallback);
	};

	analyticForm.onsubmit = function(e) {
		e.preventDefault();
		googleMap2.style.display = "";
		analyticOutput.innerHTML = "";
		my_graph.style.display = "";

		var time = analyticForm.time.value;
		if (time.length > 0)
			time = formatTime(time);
		var timeFrom = analyticForm.timeFrom.value;
		if (timeFrom.length > 0)
			timeFrom = formatTime(timeFrom);
		else
			inputTokens = 0;
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

		makeHTTPSRequest(serverAddress, wisdomHook, request, analyticCallback, time.length == 0 ? 0 : 1);
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
						output += deformatTime(gpsData[i].time.toString()) + " " + geocodeList[i];
					geocodeOutput.innerHTML = output;
				}
			}
			setTimeout(displayGeocode, 100);
		} else if (radio_map.checked) {
			geocodeOutput.innerHTML = "";
			myMap(googleMap, gpsData);
		}
	}

	function geocodeCallback(statusCode, data, index) {
		--httpsRequestCount;
		if (statusCode != 200)
			geocodeList[index] = "Invalid geocode request" + "<br>";
		else 
			geocodeList[index] = data['results'][0]['formatted_address'] + "<br>";
	}

	
	function analyticCallback(statusCode, data, type) {
		if (statusCode != 200) {
			googleMap2.style.display = "";
			my_graph.style.display = "";
			analyticOutput.innerHTML = "Invalid request";
		}
		else {
			if (type == 1) {
				if (data[0] == "NaN" || data[1] == "NaN")
					analyticOutput.innerHTML = "Cannot make a valid prediction with the dataset.";
				else {
					analyticOutput.innerHTML =  data[0] + "," + data[1];
					myMap(googleMap2, [{ lat: data[0], lng: data[1] }]);
				}
			} else {
				my_graph.style.display = "block";
				let trace_distance = { x: [], y: [], type: 'scatter', name: 'Distance' };
				let trace_time = { x: [], y: [], type: 'scatter', name: 'Time' };
				let trace_speed = { x: [], y: [], type: 'scatter', name: 'Speed' };

				for (let i = 0; i < data.length; ++i) {
					trace_distance.x.push(i);
					trace_distance.y.push(parseFloat(data[i].distance));

					trace_time.x.push(i);
					trace_time.y.push(data[i].time);

					if (data[i].time != 0) {
						trace_speed.x.push(i);
						trace_speed.y.push(parseFloat(data[i].speed));
					}
				}

				Plotly.newPlot(my_graph, [trace_distance, trace_time, trace_speed], {
					title: 'Inference Plot'
				});
			}
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