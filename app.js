// Initialize the map centered on Houston, Texas
const homePosition = [29.6014573, -95.1410888];
const homeZoom = 12;

const map = L.map('viewDiv', {
    zoomControl: false // Disable default zoom control
}).setView(homePosition, homeZoom);

// Color scale function for flood depth mapping
function getFloodColor(depth) {
    if (depth === null || depth === undefined) return '#cccccc'; // Gray for null values
    if (depth <= 0) return '#ffffff'; // No flood
    if (depth <= 2) return '#ccffff'; // Light flood
    if (depth <= 4) return '#66d9ff'; // Moderate flood
    if (depth <= 6) return '#0099ff'; // Heavy flood
    if (depth <= 8) return '#0047b2'; // Severe flood
    return '#F523F5'; // Extreme flood
}

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
            const depthValue = feature.properties[currentCentroidField];
            const color = getFloodColor(depthValue);
            
            return L.circleMarker(latlng, {
                radius: 2,
                fillColor: color,
                color: '#dfdcdcbe',
                weight: 1,
                opacity: 0.9,
                fillOpacity: 0.8
            });
        },
        onEachFeature: function(feature, layer) {
            const histValue = feature.properties.TD_histori || 'N/A';
            const transValue = feature.properties.TD_transpo || 'N/A';
            layer.bindPopup(`<b>Historic Flood Depth:</b> ${histValue} ft<br><b>Transposed Flood Depth:</b> ${transValue} ft`);
        }
    })
};

// Add default flood data layer to the map
overlayLayers.historic.addTo(map);
let currentFloodLayer = 'historic';
let currentCentroidField = 'TD_histori'; // Track which field to display for centroids

// Fetch and display statistics immediately on page load
function fetchAndDisplayStatistics() {
    console.log('Fetching feature data from ArcGIS...');
    
    const query = {
        where: '1=1',
        outFields: '*',
        returnGeometry: false,
        f: 'json'
    };
    
    const queryString = new URLSearchParams(query).toString();
    const url = `https://services.arcgis.com/lqRTrQp2HrfnJt8U/arcgis/rest/services/res_centriods_HC_CC/FeatureServer/0/query?${queryString}`;
    
    fetch(url)
        .then(response => response.json())
        .then(data => {
            console.log('Features fetched:', data.features.length);
            updateStatisticsDisplay(data.features, currentCentroidField);
        })
        .catch(error => {
            console.error('Error fetching features:', error);
        });
}

function updateStatisticsDisplay(features, field) {
    const stats = {
        'No Flood': 0,
        'Light (0-2 ft)': 0,
        'Moderate (2-4 ft)': 0,
        'Heavy (4-6 ft)': 0,
        'Severe (6-8 ft)': 0,
        'Extreme (8-10+ ft)': 0
    };
    
    const colors = {
        'No Flood': '#ffffff',
        'Light (0-2 ft)': '#ccffff',
        'Moderate (2-4 ft)': '#66d9ff',
        'Heavy (4-6 ft)': '#0099ff',
        'Severe (6-8 ft)': '#0047b2',
        'Extreme (8-10+ ft)': '#F523F5'
    };
    
    // Count features in each class
    features.forEach(feature => {
        if (feature.attributes) {
            const depth = feature.attributes[field];
            
            if (depth === null || depth === undefined) {
                return;
            }
            
            if (depth <= 0) {
                stats['No Flood']++;
            } else if (depth <= 2) {
                stats['Light (0-2 ft)']++;
            } else if (depth <= 4) {
                stats['Moderate (2-4 ft)']++;
            } else if (depth <= 6) {
                stats['Heavy (4-6 ft)']++;
            } else if (depth <= 8) {
                stats['Severe (6-8 ft)']++;
            } else {
                stats['Extreme (8-10+ ft)']++;
            }
        }
    });
    
    console.log('Statistics updated:', stats);
    
    // Display statistics
    const statsContent = document.getElementById('stats-content');
    let html = '';
    for (const [label, count] of Object.entries(stats)) {
        html += `<div class="stat-line">
            <div>
                <span class="stat-color" style="background-color: ${colors[label]};"></span>
                <span class="stat-label">${label}</span>
            </div>
            <span class="stat-count">${count}</span>
        </div>`;
    }
    statsContent.innerHTML = html;
}

// Fetch statistics when page loads
fetchAndDisplayStatistics();

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
    if (currentFloodLayer !== 'none' && map.hasLayer(overlayLayers[currentFloodLayer])) {
        map.removeLayer(overlayLayers[currentFloodLayer]);
    }
    
    // Add new flood layer if not "none"
    if (selectedRaster !== 'none') {
        overlayLayers[selectedRaster].addTo(map);
        overlayLayers[selectedRaster].bringToFront();
        
        // Update centroid field to match the selected raster layer
        if (selectedRaster === 'historic') {
            currentCentroidField = 'TD_histori';
        } else if (selectedRaster === 'transposed') {
            currentCentroidField = 'TD_transpo';
        }
        
        // Update statistics for new field
        const query = {
            where: '1=1',
            outFields: '*',
            returnGeometry: false,
            f: 'json'
        };
        
        const queryString = new URLSearchParams(query).toString();
        const url = `https://services.arcgis.com/lqRTrQp2HrfnJt8U/arcgis/rest/services/res_centriods_HC_CC/FeatureServer/0/query?${queryString}`;
        
        fetch(url)
            .then(response => response.json())
            .then(data => {
                updateStatisticsDisplay(data.features, currentCentroidField);
            })
            .catch(error => console.error('Error fetching features:', error));
        
        // Refresh centroids layer if it's visible
        if (map.hasLayer(overlayLayers.centroids)) {
            map.removeLayer(overlayLayers.centroids);
            overlayLayers.centroids.addTo(map);
        }
    }
    
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

// Centroid field selector functionality
const centroidFieldDropdown = document.getElementById('centroid-field-dropdown');

centroidFieldDropdown.addEventListener('change', function(event) {
    currentCentroidField = event.target.value;
    
    // Update statistics for new field
    const statsContent = document.getElementById('stats-content');
    if (statsContent.innerHTML.includes('Load centroids')) {
        // Stats haven't been loaded yet
        return;
    }
    
    // Fetch and update statistics with new field
    const query = {
        where: '1=1',
        outFields: '*',
        returnGeometry: false,
        f: 'json'
    };
    
    const queryString = new URLSearchParams(query).toString();
    const url = `https://services.arcgis.com/lqRTrQp2HrfnJt8U/arcgis/rest/services/res_centriods_HC_CC/FeatureServer/0/query?${queryString}`;
    
    fetch(url)
        .then(response => response.json())
        .then(data => {
            updateStatisticsDisplay(data.features, currentCentroidField);
        })
        .catch(error => console.error('Error fetching features:', error));
    
    // Refresh centroids layer if it's visible
    if (map.hasLayer(overlayLayers.centroids)) {
        map.removeLayer(overlayLayers.centroids);
        overlayLayers.centroids.addTo(map);
    }
    
    console.log('Centroid field changed to:', currentCentroidField);
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

// Sidebar collapse/expand functionality
const sidebarToggle = document.getElementById('sidebar-toggle');
const sidebar = document.getElementById('sidebar');

sidebarToggle.addEventListener('click', function() {
    sidebar.classList.toggle('collapsed');
    sidebarToggle.textContent = sidebar.classList.contains('collapsed') ? '›' : '‹';
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
