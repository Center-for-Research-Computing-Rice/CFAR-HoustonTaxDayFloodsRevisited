// Initialize the map centered on Houston, Texas
const homePosition = [29.6014573, -95.1410888];
const homeZoom = 12;

const map = L.map('viewDiv', {
    zoomControl: false // Disable default zoom control
}).setView(homePosition, homeZoom);

// Create custom home button control
L.Control.HomeButton = L.Control.extend({
    options: {
        position: 'bottomright'
    },
    onAdd: function(map) {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        const homeBtn = L.DomUtil.create('a', 'leaflet-control-home', container);
        homeBtn.href = '#';
        homeBtn.title = 'Go Home';
        homeBtn.innerHTML = '🏠';
        homeBtn.style.cssText = 'width: 36px; height: 36px; line-height: 36px; text-align: center; font-size: 20px; padding: 0; display: flex; align-items: center; justify-content: center;';
        
        L.DomEvent.on(homeBtn, 'click', L.DomEvent.preventDefault);
        L.DomEvent.on(homeBtn, 'click', function() {
            map.setView(homePosition, homeZoom);
        });
        
        return container;
    }
});

// Add home button control above zoom control
new L.Control.HomeButton({ position: 'bottomright' }).addTo(map);

// Add zoom control to bottom-right corner
L.control.zoom({
    position: 'bottomright'
}).addTo(map);

// Define basemap tile layers - all free, no API token required
const basemaps = {
    osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors',
        name: 'OpenStreetMap'
    }),
    'cartodb-positron': L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© CartoDB',
        name: 'CartoDB Positron'
    }),
    'cartodb-voyager': L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© CartoDB',
        name: 'CartoDB Voyager'
    }),
    'esri-aerial': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: '© Esri',
        name: 'Satellite'
    }),
    'usgs-topo': L.tileLayer('https://services.arcgisonline.com/arcgis/rest/services/USA_Topo_Maps/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 16,
        attribution: '© USGS',
        name: 'USGS Topographic'
    })
};

// Add default basemap to the map
basemaps['cartodb-positron'].addTo(map);

// Define overlay layers for flood data
const overlayLayers = {
    historic: L.tileLayer('https://tiles.arcgis.com/tiles/lqRTrQp2HrfnJt8U/arcgis/rest/services/TD_historic_HC_CC_Clip2/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        opacity: 0.7,
        attribution: '© ArcGIS',
        name: 'Historic Flood Data'
    }),
    transposed: L.tileLayer('https://tiles.arcgis.com/tiles/lqRTrQp2HrfnJt8U/arcgis/rest/services/TD_transposed_HC_CC_Clip/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        opacity: 0.7,
        attribution: '© ArcGIS',
        name: 'Transposed Flood Data'
    }),
    centroids: L.esri.featureLayer({
        url: 'https://services.arcgis.com/lqRTrQp2HrfnJt8U/arcgis/rest/services/res_centriods_HC_CC/FeatureServer/0',
        pointToLayer: function(feature, latlng) {
            return L.circleMarker(latlng, {
                radius: 4,
                fillColor: '#FF6B6B',
                color: '#FF6B6B',
                weight: 1,
                opacity: 0.8,
                fillOpacity: 0.8
            });
        },
        onEachFeature: function(feature, layer) {
            layer.bindPopup(`ID: ${feature.id}`);
        }
    })
};

// Add default flood data layer to the map
overlayLayers.historic.addTo(map);
let currentFloodLayer = 'historic';

// Basemap switcher functionality
const basemapDropdown = document.getElementById('basemap-dropdown');

basemapDropdown.addEventListener('change', function(event) {
    const selectedBasemap = event.target.value;
    
    // Remove all basemaps
    Object.values(basemaps).forEach(layer => {
        if (map.hasLayer(layer)) {
            map.removeLayer(layer);
        }
    });
    
    // Add selected basemap
    basemaps[selectedBasemap].addTo(map);
    
    // Ensure flood data layer is on top
    overlayLayers[currentFloodLayer].bringToFront();
    
    console.log('Basemap changed to:', selectedBasemap);
});

// Raster layer toggle functionality
const rasterSelector = document.getElementById('raster-selector');

rasterSelector.addEventListener('change', function(event) {
    const selectedRaster = event.target.value;
    
    // Remove current flood layer
    if (map.hasLayer(overlayLayers[currentFloodLayer])) {
        map.removeLayer(overlayLayers[currentFloodLayer]);
    }
    
    // Add new flood layer
    overlayLayers[selectedRaster].addTo(map);
    overlayLayers[selectedRaster].bringToFront();
    
    currentFloodLayer = selectedRaster;
    console.log('Raster layer changed to:', selectedRaster);
});

// Feature layer (centroids) toggle functionality
const centroidsToggle = document.getElementById('centroids-toggle');

centroidsToggle.addEventListener('change', function(event) {
    if (event.target.checked) {
        overlayLayers.centroids.addTo(map);
        console.log('Centroids feature layer added');
    } else {
        if (map.hasLayer(overlayLayers.centroids)) {
            map.removeLayer(overlayLayers.centroids);
        }
        console.log('Centroids feature layer removed');
    }
});

// Opacity/Transparency slider functionality
const opacitySlider = document.getElementById('opacity-slider');
const opacityValue = document.getElementById('opacity-value');

opacitySlider.addEventListener('input', function(event) {
    const transparency = parseInt(event.target.value);
    const opacity = (100 - transparency) / 100;
    
    // Update opacity for both raster layers
    overlayLayers.historic.setOpacity(opacity);
    overlayLayers.transposed.setOpacity(opacity);
    
    // Update display value
    opacityValue.textContent = (100 - transparency) + '%';
    
    console.log('Raster layer opacity changed to:', opacity);
});

// Controls panel toggle functionality
const controlsToggle = document.getElementById('controls-toggle');
const controlsContent = document.getElementById('controls-content');

controlsToggle.addEventListener('click', function() {
    controlsContent.classList.toggle('collapsed');
    const arrow = controlsToggle.textContent.includes('▲') ? '▼' : '▲';
    controlsToggle.textContent = '⚙ Settings ' + arrow;
});

// Address search functionality
const addressSearch = document.getElementById('address-search');
const searchBtn = document.getElementById('search-btn');
let searchMarker = null;

function searchAddress(address) {
    const query = address + ', Houston, Texas';
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
    
    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.length > 0) {
                const result = data[0];
                const lat = parseFloat(result.lat);
                const lon = parseFloat(result.lon);
                
                // Center map on the found location
                map.setView([lat, lon], 15);
                
                // Remove previous marker if it exists
                if (searchMarker) {
                    map.removeLayer(searchMarker);
                }
                
                // Add marker at the searched location
                searchMarker = L.circleMarker([lat, lon], {
                    radius: 8,
                    fillColor: '#FF0000',
                    color: '#000',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.8
                }).bindPopup(result.display_name).addTo(map).openPopup();
                
                console.log('Address found:', result.display_name);
            } else {
                alert('Address not found');
                console.log('Address not found');
            }
        })
        .catch(error => {
            console.error('Search error:', error);
            alert('Error searching address');
        });
}

searchBtn.addEventListener('click', function() {
    const address = addressSearch.value.trim();
    if (address) {
        searchAddress(address);
    }
});

addressSearch.addEventListener('keypress', function(event) {
    if (event.key === 'Enter') {
        const address = addressSearch.value.trim();
        if (address) {
            searchAddress(address);
        }
    }
});

// Make map globally accessible for future modifications
window.leafletMap = map;
window.basemapsConfig = basemaps;

// Log successful initialization
console.log('Leaflet map initialized for Houston, Texas');
