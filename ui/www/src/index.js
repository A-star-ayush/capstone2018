// TODO : passwd should not be displayed while typing

const https_address = "https://127.0.0.1:10000/";

window.onload = function() {
	var gpsMenu = document.getElementById("gpsMenu");
	var gpsForm = document.getElementById("gpsForm");
	var googleMap = document.getElementById("googleMap");

	var userMenu = document.getElementById("userMenu");
	var userForm = document.getElementById("userForm");

	userMenu.onclick = function() {
		if (gpsForm.style.display == "block")
			gpsForm.style.display = "";

		if (userForm.style.display == "") {
			userForm.style.display = "block";
		}
		else {
			userForm.style.display = "";
			userForm.name.value = "";
			userForm.pass.value = "";
		}

		if (googleMap.style.display != "")
			googleMap.style.display = "";
	}

	gpsMenu.onclick = function() {
		if (userForm.style.display == "block")
			userForm.style.display = "";
		
		if (gpsForm.style.display == "") {
			gpsForm.style.display = "block";
		}
		else {
			gpsForm.style.display = "";
			gpsForm.time.value = "";
			gpsForm.source.value = "";
		}

		if (googleMap.style.display != "")
			googleMap.style.display = "";
	}

	var session = 0;
	var bl = require('bl');
	var https = require('https');

	process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

	function makeHTTPSRequest(source, time, display, arr) {
		https.get(https_address + "gps?source="+source+"&time="+time+"&session="+session, function(res) {
			res.setEncoding('utf8');
			var result = "";
			res.on('data', function(data) {
				result = result + data;
			});
			res.on('end', function() {
				if (res.statusCode != 200) {
					googleMap.style.display = "";
					console.log(res.statusCode);
					console.log(result);
					return;
				}
				var data = JSON.parse(result);
				data = data[0];
				console.log(data);
				if (display) {
					googleMap.style.display = "block";
					myMap(data.lat, data.lng);
					
					/*https.get("https://maps.googleapis.com/maps/api/geocode/json?latlng=" + data.lat+","+data.lng+
					"&key=AIzaSyAj3V84hCmsgzxp_x_YESVNY1ttjgsoFY4", function(res2) {
						res2.setEncoding('utf-8');
						var result2 = "";
						console.log("CHECK1");
						res2.on('data', function(data){
							console.log("CHECK2");
							result2 += data;
						});
						res2.on('end', function() {
							console.log("CHECK3");
							var data2 = JSON.parse(result2);
							console.log(data2['results'][0]['formatted_address']);
						});
					}); */
							
				} else {
					arr.push(data);
				}
			});
		}); 
	}

	gpsForm.onsubmit = function(e) {
		e.preventDefault();
		var time = gpsForm.time.value;
		var source = gpsForm.source.value;

		makeHTTPSRequest(source, time, true);
	};


	function myMap(lat, lng) {
		var mapProp= {
    		center:new google.maps.LatLng(lat, lng),
    		zoom:15,
		};
			
		var map=new google.maps.Map(document.getElementById("googleMap"),mapProp);
	
		var marker = new google.maps.Marker({
          position: new google.maps.LatLng(lat, lng),
          map: map
        });
	}

	userForm.onsubmit = function(e) {
		e.preventDefault();
		var name = userForm.name.value;
		var pass = userForm.pass.value;

		https.get(https_address + "usr?name="+name+"&pass="+pass, function(res) {
			res.setEncoding('utf8');
			var result = "";
			res.on('data', function(data) {
				result = result + data;
			});
			res.on('end', function() {
				if (res.statusCode != 200) {
					console.log(res.statusCode);
					console.log(result);
					return;
				}
				var data = JSON.parse(result);
				session = data.session;
				console.log(session);
			});
		}); 
	};
}