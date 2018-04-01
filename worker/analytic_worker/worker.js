process.on('SIGINT', function(){
	console.log("Received a interrupt signal. Exiting.");
	process.exit(1);
});

/* ### Constants ### */

const lb_ip = "127.0.0.1";
const lb_port = 30000;
const worker_type = "analytic";

const db_host = 'localhost';
const db_user = 'root';
const db_passwd = 'qweasdzxc';
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
var ml = require('ml-regression');

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
		});
		
		aggregateCallback = processRequest;
		mq.on('data', aggregateData);
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
								performOtherCalculations(data, req, 1);
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
								performOtherCalculations(data, req, 1);
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
	const SLR = ml.SLR;
	let regressionModel_lat = new SLR(data.time, data.lat);
	let regressionModel_lng = new SLR(data.time, data.lng);
	mq.write(makeBuffer({ type: messageType.DATA, id: req.id, 
							data: [regressionModel_lat.predict(req.time), regressionModel_lng.predict(req.time)] }));
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

function performOtherCalculations(data, req, intervals) {
	let rply = [];
	let intervalLength = Math.floor(data.time.length / intervals);

	let startIndex = 0;
	let endIndex = -1;

	while (intervals--) {
		let totalDistance = 0;
		let averageSpeed = 0;

		startIndex = endIndex + 1;
		endIndex = startIndex + intervalLength - 1;
		if (intervals == 0)
			endIndex = data.time.length - 1;


		let timeElapsed = data.time[endIndex] - data.time[startIndex];

		for (let i = startIndex; i < endIndex; ++i) {
			let dist = distance(data.lat[i], data.lng[i], data.lat[i+1], data.lng[i+1]);
			console.log(data.lat[i] + "," + data.lng[i] + " " + data.lat[i+1] + "," + data.lng[i+1] + " " + "dist: " + dist);
			totalDistance += dist;
		}
	
		averageSpeed = totalDistance / timeElapsed;
	
		rply.push({'distance' : totalDistance, 'speed' : averageSpeed, 'time' : timeElapsed });
	}
	
	mq.write(makeBuffer({ type: messageType.DATA, id: req.id, data: rply }));
}