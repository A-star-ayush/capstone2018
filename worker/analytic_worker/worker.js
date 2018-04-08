process.on('SIGINT', function(){
	console.log("Received a interrupt signal. Exiting.");
	process.exit(1);
});

/* ### Constants ### */

const lb_ip = "13.127.40.45";
const lb_port = 30000;
const worker_type = "analytic";

const db_host = '192.168.43.93';
const db_user = 'root';
const db_passwd = 'QweAsdZxc1!';
const db_db = 'vehicles';

const messageType = {
	'DATA' : 0x04,
	'HEARTBEAT' : 0x08,
	'WISDOM' : 0x10
};

const R = 6371000;

/* ### Required Modules ### */

var fs = require('fs');
var tcp = require('net');
var mysql = require('mysql');
var regression = require('regression');

/* ### Connections ### */

var mq;
var db;

/* ### Utilities ### */

function makeBuffer(x) {
	var str = JSON.stringify(x);
	let len = 4;
	len += str.length;

	var buf = Buffer.allocUnsafe(len);
	buf.writeInt32LE(len);
	buf.write(str, 4);

	return buf;
}

let aggregateCallback = null;
let bytesToRead = -1;
let bytesRead = 0;
let bufferArray = [];

function aggregateData(data) {
	if (bytesToRead == -1) {
		bytesToRead = data.readInt32LE();
		bytesRead = 0;
	}

	bufferArray.push(data);
	bytesRead += data.length;
		
	if (bytesRead >= bytesToRead) {
		let buf = Buffer.concat(bufferArray, bytesRead);
		while (bytesRead >= bytesToRead) {
			aggregateCallback(JSON.parse(buf.toString('utf8', 4, bytesToRead)));
			bytesRead -= bytesToRead;
			if (bytesRead != 0) {
				buf = buf.slice(bytesToRead);
				bytesToRead = buf.readInt32LE();
				bufferArray = [];
				bufferArray.push(buf);
			} else
				bufferArray = [];
		}

		if (bufferArray.length == 0)
			bytesToRead = -1;
	}
}

/* ### Worker Registration ### */

var registrationClient = tcp.createConnection(lb_port, lb_ip, () => {
	console.log("Connected to " + registrationClient.remoteAddress + ":" + registrationClient.remotePort + ".");	
});

aggregateCallback = processRequirements;
registrationClient.on('data', aggregateData);


function processRequirements(arr) {
	for (let i = 0; i < arr.length; ++i) {
		if (arr[i] === "type")
			registrationClient.write(makeBuffer([arr[i], worker_type]));
		else if (arr[i] === "cpu")
			registrationClient.write(makeBuffer([arr[i], 1]));
		else if (arr[i] === "memory")
			registrationClient.write(makeBuffer([arr[i], 2048]));
		else if (arr[i] === "_users")
			registrationClient.write(makeBuffer([arr[i], {}]));
		else if (arr[i] === "_vehicles")
			registrationClient.write(makeBuffer([arr[i], []]));
		else {
			if (arr[i][0] == '_')
				continue;
			else {
				registrationClient.end(makeBuffer(["withdraw"]));
				console.log("Could not meet the requirements for registration.");
				process.exit(1);
			}
		}
	}

	registrationClient.write(makeBuffer(["done"]));
	registrationClient.removeListener('data', aggregateData);

	registrationClient.on('data', function(data) {
		let port = parseInt(data.toString());
		mq = tcp.createConnection(port, lb_ip, () => {
			console.log("Established a MQ with " + mq.remoteAddress + ":" + mq.remotePort +".");
			db = mysql.createConnection({
				host: db_host,
				user: db_user,
				password: db_passwd,
				database: db_db
			});

			db.connect((err) => {
				if (err) {
					console.log("Problem connecting with database. Exiting");
					process.exit(1);
				}

				console.log("Connected to the database");
			});
			
			setInterval(function() {
				mq.write(makeBuffer({ type: messageType.HEARTBEAT }));
			}, 5000);
		});
		
		aggregateCallback = processRequest;
		mq.setKeepAlive(true);
		mq.on('data', aggregateData);
		mq.on('error', () => {
			console.log("Received an error on MQ. Exiting now.");
			process.exit(1);
		});
		mq.on('end', ()=> {
			console.log("MQ Ended. Exiting now.");
			process.exit(1);
		});
		mq.on('close', () => {
			console.log("MQ Closed. Exiting now.");
			process.exit(1);
		});
	
		registrationClient.end();
	});
}

function processRequest(req) {
	console.log("Received a request");
	
	if (req.type == messageType.WISDOM) {
		let data;
		if ("timeFrom" in req) {
			db.query("SELECT time, latitude, longitude from " + req.source + " WHERE time > " + req.timeFrom + " ORDER BY time;",
				function(err, results, fields) {
					if (err)
						console.log("Received an error while processing WISOM request: " + req.source + "," + req.timeFrom + ".");
					else {
						data = parseQueryResult(results);
						if ("time" in req)
							performRegression(data, req);
						else {
							if ("intervals" in req)
								performOtherCalculations(data, req, req.intervals);
							else
								performOtherCalculations(data, req, "day");
						}
					}
			});
		} else {
			db.query("SELECT time, latitude, longitude from " + req.source + " ORDER BY time;",
				function(err, results, fields) {
					if (err)
						console.log("Received an error while processing WISDOM request: " + req.source + ".");
					else {
						data = parseQueryResult(results);
						if ("time" in req)
							performRegression(data, req);
						else {
							if ("intervals" in req)
								performOtherCalculations(data, req, req.intervals);
							else
								performOtherCalculations(data, req, "day");
						}
					}
			});
		}
	} else
		console.log("Encountered a request of unknown type. Skipping.");
}

function parseQueryResult(results) {
	let ans = { time: [], lat: [], lng: [] };
	for (let i = 0; i < results.length; ++i) {
		ans.time.push(results[i].time);
		ans.lat.push(parseFloat(results[i].latitude));
		ans.lng.push(parseFloat(results[i].longitude));
	}
	return ans;
}

function performRegression(data, req) {
	let configuration = {
		order: 2,
		precision: 6
	};

	let data1 = [];
	let data2 = [];

	for (let i = 0; i < data.time.length; ++i)
		data1.push([data.time[i], data.lat[i]]);

	for (let i = 0; i < data.time.length; ++i)
		data2.push([data.time[i], data.lng[i]]);

	let result = regression.linear(data1, configuration);
	let predicted_lat = result.predict(parseInt(req.time))[1];

	result = regression.linear(data2, configuration);
	let predicted_lng = result.predict(parseInt(req.time))[1];
	
	mq.write(makeBuffer({ type: messageType.DATA, id: req.id,
						  data: [ predicted_lat, predicted_lng ] }));
}


// Using the Haversine formula to calculate distance
function distance(lat1, lng1, lat2, lng2) {
	let l1 = lat1 * Math.PI / 180;
	let l2 = lng1 * Math.PI / 180;
	let l3 = lat2 * Math.PI / 180;
	let l4 = lng2 * Math.PI / 180;

	let dl1 = l1 - l3;
	let dl2 = l2 - l4;
	let a = Math.pow(Math.sin(dl1 / 2), 2) + Math.cos(l1) * Math.cos(l3) * Math.pow(Math.sin(dl2 / 2), 2);
	let c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	
	return c * R;
}


function monthDiffer(one, two) {
	return one.toString().slice(4, 6) !== two.toString().slice(4, 6);
}

function yearDiffer(one, two) {
	return one.toString().slice(0, 5) !== two.toString().slice(0, 5);
}

function dayDiffer(one, two) {
	return one.toString().slice(6, 8) !== two.toString().slice(6, 8);
}

function hourDiffer(now, then) {
	now = Math.floor(now / 100); 
	then = Math.floor(then / 100);
	now = Math.floor(now / 100); 
	then = Math.floor(then / 100);
	let diff = (now % 100) - (then % 100);
	now = Math.floor(now / 100); 
	then = Math.floor(then / 100);
	diff += ((now % 100) - (then % 100)) * 24;
	now = Math.floor(now / 100); 
	then = Math.floor(then / 100);
	diff += ((now % 100) - (then % 100)) * 24 * 30;

	return diff;
}


function performOtherCalculations(data, req, intervals) {
	let rply = [];
	
	let totalDistance = 0;

	let differ = null;
	if (intervals === "year")
		differ = yearDiffer;
	else if (intervals === "month")
		differ = monthDiffer;
	else
		differ = dayDiffer;

	let prev = 0;
	let i;
	for (i = 0; i < data.time.length - 1; ++i) {
		if (differ(data.time[prev], data.time[i])) {
			let timeElapsed;
			if (i >= 1)
				timeElapsed = hourDiffer(data.time[i - 1], data.time[prev]);
			else
				timeElapsed = 0;
			let averageSpeed = totalDistance / timeElapsed;
			rply.push({'distance' : totalDistance.toFixed(2), 'speed' : averageSpeed.toFixed(2), 'time' : timeElapsed });
			totalDistance = 0;
			prev = i;	
		}

		totalDistance += distance(data.lat[i], data.lng[i], data.lat[i + 1], data.lng[i + 1]);
	}

	if (prev != i) {
		let timeElapsed = hourDiffer(data.time[i], data.time[prev]);
		let averageSpeed = totalDistance / timeElapsed;
		rply.push({'distance' : totalDistance.toFixed(2), 'speed' : averageSpeed.toFixed(2), 'time' : timeElapsed });	
	}

	mq.write(makeBuffer({ type: messageType.DATA, id: req.id, data: rply }));
}