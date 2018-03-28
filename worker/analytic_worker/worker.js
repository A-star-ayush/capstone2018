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
	if (req.type == messageType.WISDOM) {
		// console.log("Received a WISDOM request.");
		// TO DO : Can perform some periodic regression even when there is no request

		let data;
		if ("timeFrom" in req) {
			db.query("SELECT time, latitude, longitude from " + req.source + " WHERE time > " + req.timeFrom + ";",
				function(err, results, fields) {
					if (err)
						console.log("Received an error while processing WISOM request: " + req.source + "," + req.timeFrom + ".");
					else {
						data = parseQueryResult(results);
						if ("time" in req)
							performRegression(data, req);
						else
							performOtherCalculations(data, req);
					}
			});
		} else {
			db.query("SELECT time, latitude, longitude from " + req.source + ";",
				function(err, results, fields) {
					if (err)
						console.log("Received an error while processing WISDOM request: " + req.source + ".");
					else {
						data = parseQueryResult(results);
						if ("time" in req)
							performRegression(data, req);
						else
							performOtherCalculations(data, req);
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
		ans.lat.push(results[i].latitude);
		ans.lng.push(results[i].longitude);
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

function performOtherCalculations(data, req) {
	mq.write(makeBuffer({ type: messageType.DATA, id: req.id, data: ["yet to be implemented 2.0"] }));
}