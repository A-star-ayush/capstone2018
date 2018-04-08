/*const convnetjs = require('convnetjs');

let layer_defs = [];
let time = [[1], [2], [3], [4], [5], [6]];
let latitude = [[10], [20], [30], [40], [50], [60]];

const N = 6;
const Niters = 1000;

layer_defs.push({type:'input', out_sx:1, out_sy:1, out_depth:1});
layer_defs.push({type:'fc', num_neurons:20, activation:'relu'});
layer_defs.push({type:'fc', num_neurons:20, activation:'sigmoid'});
layer_defs.push({type:'regression', num_neurons:1});

let net = new convnetjs.Net();
net.makeLayers(layer_defs);

let trainer = new convnetjs.SGDTrainer(net, {learning_rate:0.01, momentum:0.0, batch_size:1, l2_decay:0.001});

let netx = new convnetjs.Vol(1,1,1);
let avloss = 0.0;

let iters;
for (iters = 0; iters < Niters; iters++) {
    for(let ix = 0; ix < N; ix++) {
      	netx.w = time[ix];
      	let stats = trainer.train(netx, latitude[ix]);
      	avloss += stats.loss;
    }
}

avloss /= (N * iters);
console.log("avloss: " + avloss);

console.log(net.forward(new convnetjs.Vol([10])).w[0]);
*/

/*const convnetjs = require('convnetjs');
var layer_defs = [];
layer_defs.push({type:'input', out_sx:1, out_sy:1, out_depth:2});
layer_defs.push({type:'fc', num_neurons:5, activation:'sigmoid'});
layer_defs.push({type:'regression', num_neurons:1});
var net = new convnetjs.Net();
net.makeLayers(layer_defs);
 
var x = new convnetjs.Vol([0.5, -1.3]);
 
// train on this datapoint, saying [0.5, -1.3] should map to value 0.7:
// note that in this case we are passing it a list, because in general
// we may want to  regress multiple outputs and in this special case we 
// used num_neurons:1 for the regression to only regress one.
var trainer = new convnetjs.SGDTrainer(net, 
              {learning_rate:0.01, momentum:0.0, batch_size:1, l2_decay:0.001});
trainer.train(x, [0.7]);
 
// evaluate on a datapoint. We will get a 1x1x1 Vol back, so we get the
// actual output by looking into its 'w' field:
var predicted_values = net.forward(x);
console.log('predicted value: ' + predicted_values.w[0]);*/




/*const R = 6371000;

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
	console.log("CHECK1: " + now + " " + then);
	let diff = (now % 100) - (then % 100);
	now = Math.floor(now / 100); 
	then = Math.floor(then / 100);
	console.log("CHECK2: " + now + " " + then);
	diff += ((now % 100) - (then % 100)) * 24;
	now = Math.floor(now / 100); 
	then = Math.floor(then / 100);
	console.log("CHECK3: " + now + " " + then);
	diff += ((now % 100) - (then % 100)) * 24 * 30;

	return diff;
}

function performOtherCalculations(data, intervals) {
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
		console.log(i);
		if (differ(data.time[prev], data.time[i])) {
			console.log("Inside Differ. prev: " + prev + " i: " + i);
			let timeElapsed;
			if (i >= 1)
				timeElapsed = hourDiffer(data.time[i - 1], data.time[prev]);
			else
				timeElapsed = 0;
			console.log("Time Elapsed: " + timeElapsed);
			let averageSpeed = totalDistance / timeElapsed;
			rply.push({'distance' : totalDistance.toFixed(2), 'speed' : averageSpeed.toFixed(2), 'time' : timeElapsed });
			totalDistance = 0;
			prev = i;	
		}

		let dist = distance(data.lat[i], data.lng[i], data.lat[i + 1], data.lng[i + 1]);
		totalDistance += dist;
		console.log("dist: " + dist);
	}

	if (prev != i) {
		console.log("After calculations. prev: " + prev + " i: " + i);
		let timeElapsed = hourDiffer(data.time[i], data.time[prev]);
		console.log("Time Elapsed: " + timeElapsed);
		let averageSpeed = totalDistance / timeElapsed;
		rply.push({'distance' : totalDistance.toFixed(2), 'speed' : averageSpeed.toFixed(2), 'time' : timeElapsed });	
	}

	console.log(rply);
}

let time = [20180403173114, 20180403213134, 20180404173155, 20180404203215, 20180405123235, 20180405173256, 20180405213316, 
			20180406173336, 20180406173357];
let lat = [12.845637, 12.845552, 12.845545, 12.845488, 12.845303, 12.845292, 12.845257, 12.845388, 12.845570];
let lng  = [80.152327, 80.152377, 80.152428, 80.152440, 80.152382, 80.152340, 80.152388, 80.152385, 80.152362];

let ans = { time: [], lat: [], lng: [] };
for (let i = 0; i < time.length; ++i) {
		ans.time.push(time[i]);
		ans.lat.push(lat[i]);
		ans.lng.push(lng[i]);
}

performOtherCalculations(ans, "day");
*/