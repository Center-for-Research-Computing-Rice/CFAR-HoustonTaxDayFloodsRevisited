// Initialize the map centered on Houston, Texas
const map = L.map('viewDiv', {
    zoomControl: false // Disable default zoom control
}).setView([29.6014573, -95.1410888], 12);

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
basemaps.osm.addTo(map);

// Define overlay layers for flood data
const overlayLayers = {
    floodData: L.tileLayer('https://tiles.arcgis.com/tiles/lqRTrQp2HrfnJt8U/arcgis/rest/services/TD_historic_HC_CC_Clip2/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        opacity: 0.7,
        attribution: '© ArcGIS',
        name: 'Historic Flood Data'
    })
};

// Add flood data layer to the map
overlayLayers.floodData.addTo(map);

// Basemap switcher functionality
const basemapDropdown = document.getElementById('basemap-dropdown');
const basemapName = document.getElementById('basemap-name');

basemapDropdown.addEventListener('change', function(event) {
    const selectedBasemap = event.target.value;
    const selectedLabel = event.target.options[event.target.selectedIndex].text;
    
    // Remove all basemaps
    Object.values(basemaps).forEach(layer => {
        if (map.hasLayer(layer)) {
            map.removeLayer(layer);
        }
    });
    
    // Add selected basemap
    basemaps[selectedBasemap].addTo(map);
    basemapName.textContent = selectedLabel;
    console.log('Basemap changed to:', selectedBasemap);
});

// Make map globally accessible for future modifications
window.leafletMap = map;
window.basemapsConfig = basemaps;

// Log successful initialization
console.log('Leaflet map initialized for Houston, Texas');
