var map = L.map('map').setView([39.74739, -105], 2);

L.tileLayer('https://{s}.tiles.mapbox.com/v3/mapbox.blue-marble-topo-bathy-jan/{z}/{x}/{y}.png', {
	maxZoom: 18,
	attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, ' +
		'<a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, ' +
		'Imagery © <a href="http://mapbox.com">Mapbox</a>',
	id: 'examples.map-20v6611k'
}).addTo(map);

function onEachFeature(feature, layer) {
    // does this feature have a property named popupContent?
    if (feature.properties) {
        layer.bindPopup(feature.properties.location + ' // ' + feature.properties.station_id + ' // ' + feature.properties.temp_f + ' // ' + feature.properties.weather);
    }
}

L.geoJson([stations], {
	onEachFeature: onEachFeature,

	pointToLayer: function (feature, latlng) {
		var rgb = temp_to_rgb(feature.properties.temp_f),
			rgb_formatted = 'rgb(' + rgb.map(function(r) { return Math.round(r); }).join(",") + ')';
		return L.circleMarker(latlng, {
			radius: 4,
			fillColor: rgb_formatted,
			color: rgb_formatted,
			weight: 1,
			opacity: 1,
			fillOpacity: 0.8
		});
	}
}).addTo(map);
