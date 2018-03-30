
process.on('SIGINT', function(){
	console.log("Received a interrupt signal. Exiting.");
	process.exit(1);
});


/* ####### [ CONSTANTS ] ####### */

const my_ip = "0.0.0.0";
const messageType = {
	'PUSH': 0x01,
	'FETCH' : 0x02,
	'DATA' : 0x04,
	'HEARTBEAT' : 0x08,
	'WISDOM' : 0x10
};
const port_restAPI = 10000;
const port_dataSouce = 20000;
const port_workerRegistration = 30000;


/* ####### [ REQUIRED MODULES ] ####### */

var fs = require('fs');
var udp = require('dgram');
var tcp = require('net');
var crypto = require('crypto');
var url = require('url');
var https = require('https');

var https_credentials = {
	key : fs.readFileSync("key.pem"),
	cert: fs.readFileSync("cert.pem")
};


/* ####### [ CACHE ] ####### */

var knownSources = [];
var knownUsers = {};


/* ####### [ LOAD BALANCER ] ####### */

var dataWorkers = [];
var analyticWorkers = [];

var dataSchedule_state = {
	'min_pendingRequests' : 9999999,
	'max_requestsSince' : 0,
	'updateCounter' : 0
};

var wisdomSchedule_state = {
	'min_pendingRequests' : 9999999,
	'max_requestsSince' : 0,
	'updateCounter' : 0
};


let source_n_worker = {};

function scheduleWorker(workers, message, request) {
	if (workers.length == 0) {
		console.log("No workers. Cannot schedule request.");
		return;
	}

	let buf = makeBuffer(message);
	let y_max = 0;
	let assignedWorker = workers[0];
	
	let state;
	if (workers == analyticWorkers)
		state = wisdomSchedule_state;
	else
		state = dataSchedule_state;

	/* SOURCE MODULE */
	if (request != null && (request.source in source_n_worker)) {
		assignedWorker = source_n_worker[request.source];
		if (assignedWorker.pendingRequests > assignedWorker.capacity)
			y_max = 0;
		else {
			let temp = assignedWorker.pendingRequests / assignedWorker.capacity;
			y_max = (temp <= 1) ? 1 - temp : 0;
			console.log("source, y_max : " + y_max);
		}
	}

	/* JUMP MODULE */
	let rounds = Math.log2(workers.length);
	while (rounds--) {
		let r = Math.floor(Math.random() * workers.length);
		let worker = workers[r];
		let requestsSince = requestId - worker.maxRequestId;

		// console.log("r : " + r + " requestsSince : " + requestsSince + ".");

		if (state.updateCounter == 0) {
			state.min_pendingRequests = worker.pendingRequests;
			state.max_requestsSince = requestsSince;
			state.updateCounter = workers.length;
		} else {
			let update = false;
			if (worker.pendingRequests < state.min_pendingRequests) {
				state.min_pendingRequests = worker.pendingRequests;
				update = true;
			}

			if (requestsSince > state.max_requestsSince) {
				state.max_requestsSince = requestsSince;
				update = true;
			}

			if (update == true)
				state.updateCounter = workers.length;
			else
				--state.updateCounter;
		}
		
		console.log("state.max_requestsSince : " + state.max_requestsSince + " state.min_pendingRequests : " + 
			 state.min_pendingRequests + ".");

		let x1 = (state.max_requestsSince == 0) ? 1 : requestsSince / state.max_requestsSince;
		let x2 = (worker.pendingRequests == 0) ? 1 : state.min_pendingRequests / worker.pendingRequests;
		let y = 0.4*x1 + 0.6*x2;

		console.log("x1 : " + x1 + " x2 : " + x2 + " y : " + y + ".");
		if (y <= y_max)
			continue;
		else {
			y_max = y;
			assignedWorker = worker;
		}

		let r2 = Math.random();
		console.log("r2 : " + r2);
		if (y >= r2)
			break;
	}
	
	if (request != null) {
		++assignedWorker.pendingRequests;
		assignedWorker.maxRequestId = requestId;
		request['worker'] = assignedWorker;
		source_n_worker[request.source] = assignedWorker;
	}
	
	assignedWorker['mq'].write(buf);
}


/* ####### [ DATA SOURCE ] ####### */

var gpsServer = udp.createSocket("udp4");
gpsServer.on("message", parseGPSData);
gpsServer.bind(port_dataSouce);

console.log("Started data source server at port " + port_dataSouce + ".");

function parseGPSData(msg, rinfo) {
	let len = msg.readUInt8();
	if (rinfo.size != (len + 13)) {
		console.log("parseGPSData: malformed datagram.");
		return;
	}

	let sourceId = msg.toString('ascii', 1, len + 1);

	if(knownSources.indexOf(sourceId) < 0) {
		console.log("parseGPSData: Invalid source id.");
		return;
	}

	let timestamp = msg.readUInt32LE(len + 1);
	let latitude = msg.readFloatLE(len + 5);
	let longitude = msg.readFloatLE(len + 9);

	let req = { type: messageType.PUSH, source: sourceId, time: timestamp, lat: latitude, lng: longitude };
	scheduleWorker(dataWorkers, req, null);	
}


/* ####### [ UTILITIES ] ####### */

function makeBuffer(x) {
	var str = JSON.stringify(x);
	let len = 4;
	len += str.length;

	var buf = Buffer.allocUnsafe(len);
	buf.writeInt32LE(len);
	buf.write(str, 4);

	return buf;
}


/* ####### [ WORKER HANDLING ] ####### */

let requiredFields = ["type", "cpu", "memory", "_users", "_vehicles"];
let workerPort = 40000;

function registerWorker(client){
	console.log("Received a registration request from " + client.remoteAddress + ":" + client.remotePort + ".");
	client.write(makeBuffer(requiredFields));

	let bytesToRead = -1;
	let bytesRead = 0;
	let bufferArray = [];
	let sources = [];
	let worker = {};
	let users = {};

	client.on('data', function(data) {
		if (bytesToRead == -1) {
			bytesToRead = data.readInt32LE();
			bytesRead = 0;
		}

		bufferArray.push(data);
		bytesRead += data.length;
		
		if (bytesRead >= bytesToRead) {
			let buf = Buffer.concat(bufferArray, bytesRead);
			while (bytesRead >= bytesToRead) {
				registerReply(JSON.parse(buf.toString('utf8', 4, bytesToRead)));
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
	});

	function registerReply(arr) {
		if (arr[0] === "type" || arr[0] === "cpu" || arr[0] === "memory")
			worker[arr[0]] = arr[1];
		else if (arr[0] === "_users")
			users = arr[1];
		else if (arr[0] === "_vehicles")
			sources = arr[1];
		else if (arr[0] === "withdraw") {
			console.log("Worker registration for " + client.remoteAddress + ":" + client.remotePort + " failed.");
			client.end();
		} else if (arr[0] === "done") {
			console.log("Worker registration for " + client.remoteAddress + ":" + client.remotePort + " succeeded.");
			for (let i = 0; i < sources.length; ++i) {
				if (knownSources.indexOf(sources[i]) < 0) {
					knownSources.push(sources[i]);
					console.log("Added a new source: " + sources[i] + ".");
				}
			}

			for (let user in users) {
				knownUsers[user] = users[user];
				console.log("Added / Re-wrote a user: "  + user + ".");
			}

			let workerServer = tcp.createServer((connection) => {
				console.log("Established a MQ with " + connection.remoteAddress + ":" + connection.remotePort +".");
				worker['mq'] = connection;
				worker.pendingRequests = 0;
				worker.maxRequestId = requestId;
				// TO DO : Ask the worker for its capacity
				worker.capacity = 5;

				// TO DO: Error Checking for other types here and the time of deletion
				// Can be done here and at time of splicing or at the time of registration itself
				if (worker.type === "analytic") {
					analyticWorkers.push(worker);
					wisdomSchedule_state.updateCounter = analyticWorkers.length;
				}
				else {
					dataWorkers.push(worker);
					dataSchedule_state.updateCounter = dataWorkers.length;
				}

				connection.on('data', function(data) {
					if (bytesToRead == -1) {
						bytesToRead = data.readInt32LE();
						bytesRead = 0;
					}

					bufferArray.push(data);
					bytesRead += data.length;
		
					if (bytesRead >= bytesToRead) {
						let buf = Buffer.concat(bufferArray, bytesRead);
						while (bytesRead >= bytesToRead) {
							readMQ(JSON.parse(buf.toString('utf8', 4, bytesToRead)), worker);
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
				});

				connection.on('close', () => {
					console.log("Worker closed the connection: " + connection.remoteAddress + ":" + connection.remotePort + ".");
					workerExited();
				});

				connection.on('error', (err) => {
					console.log("Received an error on connection " + connection.remoteAddress + ":" + connection.remotePort + ".");
					workerExited();
				});

				// TO DO : Reschedule the requests assigned to the worker that just closed
				function workerExited() {
					let workers;
					if (worker.type === "analytic")
						workers = analyticWorkers;
					else
						workers = dataWorkers;

					let i;
					for (i = 0; i < workers.length; ++i) {
						if (workers[i]['mq'].remotePort == connection.remotePort)
							break;
					}
					if (i != workers.length) {
						for (let source in source_n_worker) {
							if (source_n_worker[source] == workers[i])
								delete source_n_worker[source];
						}

						workers.splice(i, 1);
						console.log("Closed. De-registered " + connection.remoteAddress + ":" + connection.remotePort + ".");
					}
					
					if (worker.type === "analytic")
						wisdomSchedule_state.updateCounter = analyticWorkers.length;
					else
						dataSchedule_state.updateCounter = dataWorkers.length;
				}
			});

			// TODO: if no connection within a timeout, close worker server
			workerServer.listen(workerPort, my_ip, 1);
			client.end(workerPort.toString());
			++workerPort;
		}
	}
}

var registrationServer = tcp.createServer(registerWorker);
registrationServer.listen(port_workerRegistration, my_ip);
console.log("Started worker registration at port " + port_workerRegistration + ".");

function readMQ(res, worker) {
	if (res.type == messageType.DATA) {
		if (res.id in requests) {
			let timeTaken = Date.now() - requests[res.id]['timestamp'];
			requests[res.id]['handle'].writeHead(200, { 'content-type' : 'text/json' });
			requests[res.id]['handle'].end(JSON.stringify(res.data));
			delete requests[res.id];
			--worker.pendingRequests;
		} else
			console.log("Received a response with no matching request.");
	}
}


/* ####### [ REST SERVER ] ####### */

var currentSessions = [];
var requests = {};

let requestId = 0;

function respondWithError(res, msg) {
	res.writeHead(404, { 'content-type' : 'text/plain' });
	res.write(msg);
	res.end();
}

function restResponse(req, res) {
	if (req.url.startsWith('/gps?')) {
		var queryData = url.parse(req.url, true).query;
		if ("time" in queryData && "source" in queryData && "session" in queryData) {
			if (currentSessions.indexOf(queryData.session) < 0) {
				respondWithError(res, "Session Id not registered.");
				return;
			}
			if (knownSources.indexOf(queryData.source) >= 0) {
				if (queryData.time >= -1) {
					if (dataWorkers.length == 0)
						respondWithError(res, "No worker to assign the request to. Try again later.");
					else {
						requests[requestId] = { type: messageType.FETCH, handle: res, source: queryData.source };
						let req = { type: messageType.FETCH, id : requestId, source: queryData.source, time: parseInt(queryData.time) };
						scheduleWorker(dataWorkers, req, requests[requestId]);
						requestId++;
					}
				} else
					respondWithError(res, "Invalid value supplied for time parameter.");
			} else
				respondWithError(res, "Data or connection for specified source doesn't exist.");
		} else 
			respondWithError(res, "Both time and source field must be specified along with the session ID.");
	} else if (req.url.startsWith('/usr?')) {
		var userInfo = url.parse(req.url, true).query;
		if ("name" in userInfo && "pass" in userInfo) {
			if (userInfo.name in knownUsers) {
				var hash = crypto.createHmac('sha256', 'a secret').update(userInfo.pass).digest('hex').toString();
				var password = knownUsers[userInfo.name];
				if (hash == password){
					var id = Math.floor(Math.random() * 50000).toString();
					currentSessions.push(id);
					var tmp = { session: id };
					res.writeHead(200, { 'content-type' : 'text/json' });
					res.end(JSON.stringify(tmp));
				} else
					respondWithError(res, "The password is incorrect.");
			} else
				respondWithError(res, "The user specified is not authorized.");

		} else
			respondWithError(res, "Must be of the form usr?name=<>&pass=<>.");

	} else if (req.url.startsWith('/wisdom?')) {
		var queryData = url.parse(req.url, true).query;
		if ("source" in queryData && "session" in queryData) {
			if (currentSessions.indexOf(queryData.session) < 0) {
				respondWithError(res, "Session Id not registered.");
				return;
			}
			if (knownSources.indexOf(queryData.source) >= 0) {
				if (analyticWorkers.length == 0)
						respondWithError(res, "No worker to assign the request to. Try again later.");
				else {
					requests[requestId] = { type: messageType.WISDOM, handle: res, source: queryData.source };
					let req = { type: messageType.WISDOM, id : requestId, source: queryData.source };
					if ("time" in queryData)
						req.time = parseInt(queryData.timeFrom);
					if ("timeFrom" in queryData)
						req.timeFrom = parseInt(queryData.time);
					if ("intervals" in queryData)
						req.intervals = parseInt(queryData.intervals);
					scheduleWorker(analyticWorkers, req, requests[requestId]);
					requestId++;
				}
			} else
				respondWithError(res, "Data or connection for the specified source doesn't exist.");
		} else
			respondWithError(res, "A wisom request must atleast contain a source field and session id.");
	} else
		respondWithError(res, "Must be either a valid GPS, USER or WISDOM request.");
}

let restServer = https.createServer(https_credentials, restResponse);
restServer.listen(port_restAPI);

console.log("Started a REST Server at port " + port_restAPI + ".");
