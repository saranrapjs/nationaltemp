process.chdir(__dirname); // for cron
var glob = require("glob"),
	fs = require('fs'),
	request = require('request'),
	unzip = require('unzip'),
	async = require('async'),
	xml2js = require('xml2js'),
	geolib = require('geolib'),
	GeoJSON = require('geojson'),
	gramophone = require('gramophone'),
	pos = require('pos'),
	temp_to_rgb = require('./temp_to_rgb'),
	do_download = (process.argv[2] && process.argv[2] === 'true') ? true : false

var bad_stations = require('./weird_stations.json');

var a_few_days_ago = new Date();
a_few_days_ago.setDate(a_few_days_ago.getDate() - 3)

var stations = [];

async.waterfall([
	function download_files(callback) {
		if (do_download !== true) {
			callback(null, true);
		} else {
			console.log("DOWNLOADING XML FILES...")
			request('http://w1.weather.gov/xml/current_obs/all_xml.zip')
				.pipe(unzip.Extract({ path: 'all_xml' }))
				.on('finish', function() {
					callback(null, true);
				});			
		}
	},
	function find_files(res, callback) {
		glob("all_xml/*.xml", {}, callback);
	},
	function read_data(files, callback) {
	 	// files = files.splice(0, 400);
		console.log("READING IN DATA...")
		async.map(files, read_one, callback);
	},
	function filter_without_geography(result, callback) {
		console.log("FILTERING INVALID STATIONS...")
		async.filter(result, function does_hav_lat(item, cb) { 
			var good_to_go = (item && item.latitude && item.longitude && item.temp_f && item.station_id && item.observation_time_rfc822 && item.weather) ? true : false,
				obs_time = new Date(item.observation_time_rfc822);
			if (good_to_go === true && item.station_id.indexOf('4') === 0 || good_to_go === true && item.station_id.indexOf('6') === 0) {
				good_to_go = false; // probably a buoy?
			}
			if (good_to_go === true && item.latitude === "0" && item.longitude === "0") { // null island
				good_to_go = false;
			}
			if (good_to_go === true && item.location === 'Unknown Station') {
				good_to_go = false; // ignore these non-named ones?
			}
			if (good_to_go === true && bad_stations.indexOf(item.station_id) !== -1) {
				good_to_go = false;
			}
			if (good_to_go === true && obs_time < a_few_days_ago) { // not a recent observation
				good_to_go = false;
			}
			cb( good_to_go );
		}, function(results) {
			callback(null, results)
		});
	},
	function filter_too_close(result, callback) {
		async.filterSeries(result, function too_close(item, cb) { 
		var good_to_go = true,
			is_even = evenly_spread(item.latitude, item.longitude);
		if (is_even[0] === true) {
			stations.push(item)
		} else {
			// console.log("BAD FROM?", item.location, item.station_id, "NEAR", is_even[1].location, is_even[1].station_id)
			good_to_go = false;
		}
		cb(good_to_go);
		}, function(results) {
			callback(null, results);
		});
	},
	function do_average(result, callback) {
		console.log("CALCULATING AVERAGE...")
		var total = 0.0,
			text = '',
			avg;
		for (var i = 0; i < result.length; i++) {
			total += parseFloat(result[i].temp_f)
			text += result[i].weather + ' and ';
		};
		var words = gramophone.extract(text, {limit:10})

		avg = total / result.length;
		callback(null, {
			temp : avg.toFixed(2),
			forecast : generate_sentence(words),
			color : "rgb("+temp_to_rgb(avg)+")",
			now : new Date().toString(),
			num_stations : stations.length
		});
	}
], function(err, info) {
	console.log("NUM STATIONS", stations.length)
	console.log(info)
	var geo_j = GeoJSON.parse(stations, {Point: ['latitude', 'longitude'], include: ['location','station_id','temp_f','weather']});
	fs.writeFile('stations.json', 'var stations = ' + JSON.stringify(geo_j))
	write_html(info)
	write_svg(info.color)
});


function write_html(data) {
	var html = fs.readFileSync('./index.mustache').toString(); // dumb mustache :)
	for (var i in data) {
		html = html.replace('{{'+i+'}}', data[i])
	}
	fs.writeFile('index.html', html)
}
function write_svg(color) {
	var svg = fs.readFileSync('./us.svg').toString();
	svg = svg.replace("blue", color);
	fs.writeFile('current.svg', svg)
}

function randomOne(arr) {
	return arr[Math.floor(Math.random() * arr.length)];
};

function generate_sentence(words_array) {
	var nouns = [],
		adjs = [],
		cnj = [' and ', ', with ', ' with ']
	var taggedWords = new pos.Tagger().tag(words_array);
	for (i in taggedWords) {
	    var taggedWord = taggedWords[i];
	    if (taggedWord[0] === 'fog mist') {
	    	taggedWord[0] = 'fog/mist'
	    }
	    if (taggedWord[0] === 'overcast' || taggedWord[0] === 'partly cloudy') {
	    	taggedWord[1] = 'JJ';
	    }
		if (taggedWord[1].indexOf('NN') === 0) {
			nouns.push(taggedWord[0])
		}
		if (taggedWord[1] === 'JJ') {
			adjs.push(taggedWord[0])
		}
	}	
	var sentence = [ 
		randomOne(adjs)
	]
	if (Math.random() >= 0.5) {
		sentence.push(randomOne(cnj))
		sentence.push(randomOne(nouns))
	}
	sentence = sentence.join('')
	sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
	sentence += '.'
	return sentence;
}


function evenly_spread(latitude, longitude) {
	var is_evenly_spread = true,
		near_station,
		minimum_meters = 90000; 
	for (var i = 0; i < stations.length; i++) {
		var dist = geolib.getDistance(
			{latitude:latitude,longitude:longitude}, 
			{latitude: stations[i].latitude, longitude: stations[i].longitude});
		if (dist < minimum_meters) {
			near_station = stations[i];
			is_evenly_spread = false;
			break;
		}
	};
	return [ 
		is_evenly_spread,
		near_station
	];
}

function read_one(path, cb) {
	async.waterfall([ 
		function readfile(callback) {
			fs.readFile(path, callback);
		},
		function parsefile(data, callback) {
			xml2js.parseString(data, {explicitArray:false}, callback);
		},
		function getdata(data, callback) {
			data = (data.current_observation) ? data.current_observation : null;
			callback( null, data );
		}
	], function(err, result) {
		cb(null, (!err && result) ? result : false);
	});
}

