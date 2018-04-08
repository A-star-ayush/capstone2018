process.on('SIGINT', function(){
	console.log("Received a interrupt signal. Exiting.");
	process.exit(1);
});

/* ### Constants ### */

const lb_ip = "13.127.40.45";
const lb_port = 30000;
const worker_type = "data";

const db_host = '192.168.43.93';
const db_user = 'root';
const db_passwd = 'QweAsdZxc1!';
const db_db = 'vehicles';

const messageType = {
	'PUSH': 0x01,
	'FETCH' : 0x02,
	'DATA' : 0x04,
	'HEARTBEAT' : 0x08,
};

/* ### Required Modules ### */

var fs = require('fs');
var tcp = require('net');
var mysql = require('mysql');

/* ### Data Strucutes ### */

var knownSources = [];
var knownUsers = {};

/* ### Connections ### */

var mq;
var db;

if (fs.existsSync("sources.txt"))
	knownSources = fs.readFileSync("sources.txt").toString().split('\n');

if (fs.existsSync("users.txt")) {
	let temp = [];
	temp = fs.readFileSync("users.txt").toString().split('\n');

	for (let i = 0; i < temp.length-1; ++i) {
		let t = temp[i].split(' ');
		knownUsers[t[0]] = t[1];
	}
}

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
			registrationClient.write(makeBuffer([arr[i], knownUsers]));
		else if (arr[i] === "_vehicles")
			registrationClient.write(makeBuffer([arr[i], knownSources]));
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
			console.log("Established a MQ with " + mq.remoteAddress + ":" + mq.remotePort + ".");
			db = mysql.createConnection({
				host: db_host,
				user: db_user,
				password: db_passwd,
				database: db_db
			});

			db.connect((err) => {
				if (err) {
					console.log("Problem connecting with database. Exiting.");
					process.exit(1);
				}

				console.log("Connected to the database.");
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
	
	if (req.type == messageType.PUSH) {
		req.time = parseInt(req.time);
		req.time += 53000;  // Adjust for UTC : India is 5 hours 30 minutes ahead of UTC
		db.query("INSERT INTO " + req.source + " VALUES (" + req.time + "," + req.lat + "," + req.lng + ");",
			function (err, results, fields) {
				if (err) 
					console.log("Received an error while processing PUSH request: " + req.source + "," + req.time + ".");
		});
	} else if (req.type == messageType.FETCH) {
		if (req.time.length == 1) {
			db.query("SELECT time, latitude, longitude from " + req.source + " ORDER BY time DESC LIMIT 1;",
				function(err, results, fields) {
					if (err) 
						console.log("Received an error while processing FETCH request: " + req.source + "," + req.time + ".");
					else {
						let reply = parseQueryResult(results);
						mq.write(makeBuffer({ type: messageType.DATA, id: req.id, data: reply }));
					}
			});
		} else {
			db.query("SELECT time, latitude, longitude from " + req.source + " WHERE time > " + req.time + " ORDER BY time;",
				function(err, results, fields) {
					if (err)
						console.log("Received an error while processing FETCH request: " + req.source + "," + req.time + ".");
					else {
						let reply = parseQueryResult(results);
						mq.write(makeBuffer({ type: messageType.DATA, id: req.id, data: reply }));
					}
			});
		}
	} else
		console.log("Encountered a request of unknown type. Skipping.");
}

function parseQueryResult(results) {
	let ans = [];
	for (let i = 0; i < results.length; ++i) {
		ans[i] = {};
		ans[i]['time'] = results[i].time;
		ans[i]['lat'] = results[i].latitude;
		ans[i]['lng'] = results[i].longitude;
	}
	return ans;
}