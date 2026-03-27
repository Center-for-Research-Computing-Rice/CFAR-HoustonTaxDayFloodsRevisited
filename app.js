const [
    ArcGISMap,
    MapView,
    TileLayer,
    WebTileLayer,
    FeatureLayer,
    Basemap,
    GraphicsLayer,
    Graphic,
    Point,
    Home,
    Zoom
] = await $arcgis.import([
    "@arcgis/core/Map.js",
    "@arcgis/core/views/MapView.js",
    "@arcgis/core/layers/TileLayer.js",
    "@arcgis/core/layers/WebTileLayer.js",
    "@arcgis/core/layers/FeatureLayer.js",
    "@arcgis/core/Basemap.js",
    "@arcgis/core/layers/GraphicsLayer.js",
    "@arcgis/core/Graphic.js",
    "@arcgis/core/geometry/Point.js",
    "@arcgis/core/widgets/Home.js",
    "@arcgis/core/widgets/Zoom.js"
]);

const homePosition = { longitude: -95.1410888, latitude: 29.6014573 };
const homeZoom = 12;
const centroidServiceUrl = "https://services.arcgis.com/lqRTrQp2HrfnJt8U/arcgis/rest/services/res_centriods_HC_CC/FeatureServer/0";

function getFloodColor(depth) {
    if (depth === null || depth === undefined) return "#cccccc";
    if (depth <= 0) return "#ffffff";
    if (depth <= 2) return "#ccffff";
    if (depth <= 4) return "#66d9ff";
    if (depth <= 6) return "#0099ff";
    if (depth <= 8) return "#0047b2";
    return "#F523F5";
}

function createBasemap(id) {
    if (id === "osm") {
        return new Basemap({
            baseLayers: [new WebTileLayer({ urlTemplate: "https://{subDomain}.tile.openstreetmap.org/{level}/{col}/{row}.png", subDomains: ["a", "b", "c"] })],
            title: "OpenStreetMap",
            id: "osm"
        });
    }

    if (id === "cartodb-positron") {
        return new Basemap({
            baseLayers: [new WebTileLayer({ urlTemplate: "https://{subDomain}.basemaps.cartocdn.com/light_all/{level}/{col}/{row}.png", subDomains: ["a", "b", "c", "d"] })],
            title: "CartoDB Positron",
            id: "cartodb-positron"
        });
    }

    if (id === "cartodb-voyager") {
        return new Basemap({
            baseLayers: [new WebTileLayer({ urlTemplate: "https://{subDomain}.basemaps.cartocdn.com/rastertiles/voyager/{level}/{col}/{row}.png", subDomains: ["a", "b", "c", "d"] })],
            title: "CartoDB Voyager",
            id: "cartodb-voyager"
        });
    }

    if (id === "esri-aerial") {
        return "satellite";
    }

    if (id === "usgs-topo") {
        return new Basemap({
            baseLayers: [new TileLayer({ url: "https://services.arcgisonline.com/arcgis/rest/services/USA_Topo_Maps/MapServer" })],
            title: "USGS Topographic",
            id: "usgs-topo"
        });
    }

    return "streets-vector";
}

let currentCentroidField = "TD_histori";
let currentFloodLayer = "historic";

function createCentroidRenderer(fieldName) {
    return {
        type: "class-breaks",
        field: fieldName,
        classBreakInfos: [
            { minValue: Number.NEGATIVE_INFINITY, maxValue: 0, symbol: { type: "simple-marker", size: 4, color: "#ffffff", outline: { color: "#dfdcdcbe", width: 0.5 } }, label: "No Flood" },
            { minValue: 0.00001, maxValue: 2, symbol: { type: "simple-marker", size: 4, color: "#ccffff", outline: { color: "#dfdcdcbe", width: 0.5 } }, label: "Light (0-2 ft)" },
            { minValue: 2.00001, maxValue: 4, symbol: { type: "simple-marker", size: 4, color: "#66d9ff", outline: { color: "#dfdcdcbe", width: 0.5 } }, label: "Moderate (2-4 ft)" },
            { minValue: 4.00001, maxValue: 6, symbol: { type: "simple-marker", size: 4, color: "#0099ff", outline: { color: "#dfdcdcbe", width: 0.5 } }, label: "Heavy (4-6 ft)" },
            { minValue: 6.00001, maxValue: 8, symbol: { type: "simple-marker", size: 4, color: "#0047b2", outline: { color: "#dfdcdcbe", width: 0.5 } }, label: "Severe (6-8 ft)" },
            { minValue: 8.00001, maxValue: Number.POSITIVE_INFINITY, symbol: { type: "simple-marker", size: 4, color: "#F523F5", outline: { color: "#dfdcdcbe", width: 0.5 } }, label: "Extreme (8-10+ ft)" }
        ],
        defaultSymbol: { type: "simple-marker", size: 4, color: "#cccccc", outline: { color: "#dfdcdcbe", width: 0.5 } }
    };
}

const overlayLayers = {
    historic: new TileLayer({
        url: "https://tiles.arcgis.com/tiles/lqRTrQp2HrfnJt8U/arcgis/rest/services/TD_historic_HC_CC_Clip2/MapServer",
        opacity: 0.7,
        visible: true
    }),
    transposed: new TileLayer({
        url: "https://tiles.arcgis.com/tiles/lqRTrQp2HrfnJt8U/arcgis/rest/services/TD_transposed_HC_CC_Clip/MapServer",
        opacity: 0.7,
        visible: false
    }),
    centroids: new FeatureLayer({
        url: centroidServiceUrl,
        renderer: createCentroidRenderer(currentCentroidField),
        visible: false,
        popupTemplate: {
            title: "Flood Depth",
            content: [
                {
                    type: "text",
                    text: "<b>Historic Flood Depth:</b> {TD_histori} ft<br><b>Transposed Flood Depth:</b> {TD_transpo} ft"
                }
            ]
        }
    })
};

const searchLayer = new GraphicsLayer();

const map = new ArcGISMap({
    basemap: createBasemap("cartodb-positron"),
    layers: [overlayLayers.historic, overlayLayers.transposed, overlayLayers.centroids, searchLayer]
});

const view = new MapView({
    container: "viewDiv",
    map,
    center: [homePosition.longitude, homePosition.latitude],
    zoom: homeZoom
});

await view.when();

view.ui.empty("top-left");
view.ui.empty("bottom-right");
view.ui.add(new Home({ view }), "bottom-right");
view.ui.add(new Zoom({ view }), "bottom-right");

async function fetchFeatureStats(field) {
    const query = overlayLayers.centroids.createQuery();
    query.where = "1=1";
    query.outFields = [field];
    query.returnGeometry = false;

    const result = await overlayLayers.centroids.queryFeatures(query);
    return result.features;
}

function updateStatisticsDisplay(features, field) {
    const stats = {
        "No Flood": 0,
        "Light (0-2 ft)": 0,
        "Moderate (2-4 ft)": 0,
        "Heavy (4-6 ft)": 0,
        "Severe (6-8 ft)": 0,
        "Extreme (8-10+ ft)": 0
    };

    const colors = {
        "No Flood": "#ffffff",
        "Light (0-2 ft)": "#ccffff",
        "Moderate (2-4 ft)": "#66d9ff",
        "Heavy (4-6 ft)": "#0099ff",
        "Severe (6-8 ft)": "#0047b2",
        "Extreme (8-10+ ft)": "#F523F5"
    };

    features.forEach((feature) => {
        const depth = feature.attributes?.[field];
        if (depth === null || depth === undefined) {
            return;
        }

        if (depth <= 0) stats["No Flood"] += 1;
        else if (depth <= 2) stats["Light (0-2 ft)"] += 1;
        else if (depth <= 4) stats["Moderate (2-4 ft)"] += 1;
        else if (depth <= 6) stats["Heavy (4-6 ft)"] += 1;
        else if (depth <= 8) stats["Severe (6-8 ft)"] += 1;
        else stats["Extreme (8-10+ ft)"] += 1;
    });

    const statsContent = document.getElementById("stats-content");
    let html = "";
    Object.entries(stats).forEach(([label, count]) => {
        html += `<div class="stat-line">
            <div>
                <span class="stat-color" style="background-color: ${colors[label]};"></span>
                <span class="stat-label">${label}</span>
            </div>
            <span class="stat-count">${count}</span>
        </div>`;
    });
    statsContent.innerHTML = html;
}

async function refreshStatistics() {
    try {
        const features = await fetchFeatureStats(currentCentroidField);
        updateStatisticsDisplay(features, currentCentroidField);
    } catch (error) {
        console.error("Error fetching features:", error);
    }
}

await refreshStatistics();

const basemapDropdown = document.getElementById("basemap-dropdown");
const rasterSelector = document.getElementById("raster-selector");
const centroidsToggle = document.getElementById("centroids-toggle");
const centroidFieldDropdown = document.getElementById("centroid-field-dropdown");
const opacitySlider = document.getElementById("opacity-slider");
const opacityValue = document.getElementById("opacity-value");
const sidebarToggle = document.getElementById("sidebar-toggle");
const sidebar = document.getElementById("sidebar");
const controlsToggle = document.getElementById("controls-toggle");
const controlsContent = document.getElementById("controls-content");
const addressSearch = document.getElementById("address-search");
const searchBtn = document.getElementById("search-btn");

basemapDropdown.addEventListener("change", (event) => {
    map.basemap = createBasemap(event.target.value);
});

rasterSelector.addEventListener("change", async (event) => {
    const selectedRaster = event.target.value;

    overlayLayers.historic.visible = selectedRaster === "historic";
    overlayLayers.transposed.visible = selectedRaster === "transposed";

    if (selectedRaster === "historic") {
        currentCentroidField = "TD_histori";
    } else if (selectedRaster === "transposed") {
        currentCentroidField = "TD_transpo";
    }

    if (selectedRaster !== "none") {
        currentFloodLayer = selectedRaster;
        if (centroidsToggle.checked) {
            overlayLayers.centroids.renderer = createCentroidRenderer(currentCentroidField);
        }
        await refreshStatistics();
    } else {
        currentFloodLayer = "none";
    }
});

centroidsToggle.addEventListener("change", (event) => {
    overlayLayers.centroids.visible = event.target.checked;
    if (event.target.checked) {
        overlayLayers.centroids.renderer = createCentroidRenderer(currentCentroidField);
    }
});

centroidFieldDropdown.addEventListener("change", async (event) => {
    currentCentroidField = event.target.value;
    overlayLayers.centroids.renderer = createCentroidRenderer(currentCentroidField);
    await refreshStatistics();
});

opacitySlider.addEventListener("input", (event) => {
    const transparency = Number.parseInt(event.target.value, 10);
    const opacity = (100 - transparency) / 100;
    overlayLayers.historic.opacity = opacity;
    overlayLayers.transposed.opacity = opacity;
    opacityValue.textContent = `${100 - transparency}%`;
});

sidebarToggle.addEventListener("click", () => {
    sidebar.classList.toggle("collapsed");
    sidebarToggle.textContent = sidebar.classList.contains("collapsed") ? "›" : "‹";
    view.resize();
});

controlsToggle.addEventListener("click", () => {
    controlsContent.classList.toggle("collapsed");
    const arrow = controlsToggle.textContent.includes("▲") ? "▼" : "▲";
    controlsToggle.textContent = `⚙ Settings ${arrow}`;
});

async function searchAddress(address) {
    const query = `${address}, Houston, Texas`;
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (!data.length) {
            alert("Address not found");
            return;
        }

        const result = data[0];
        const latitude = Number.parseFloat(result.lat);
        const longitude = Number.parseFloat(result.lon);

        await view.goTo({ center: [longitude, latitude], zoom: 15 });

        searchLayer.removeAll();
        const marker = new Graphic({
            geometry: new Point({ longitude, latitude }),
            symbol: {
                type: "simple-marker",
                size: 10,
                color: "#FF0000",
                outline: { color: "#000000", width: 1 }
            },
            popupTemplate: {
                title: "Search Result",
                content: result.display_name
            }
        });
        searchLayer.add(marker);
        view.popup.open({
            location: marker.geometry,
            title: "Search Result",
            content: result.display_name
        });
    } catch (error) {
        console.error("Search error:", error);
        alert("Error searching address");
    }
}

searchBtn.addEventListener("click", () => {
    const address = addressSearch.value.trim();
    if (address) {
        searchAddress(address);
    }
});

addressSearch.addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
        const address = addressSearch.value.trim();
        if (address) {
            searchAddress(address);
        }
    }
});

window.arcgisMap = map;
window.arcgisView = view;
window.overlayLayers = overlayLayers;
window.currentFloodLayer = currentFloodLayer;
window.getFloodColor = getFloodColor;

console.log("ArcGIS JavaScript API v5 map initialized for Houston, Texas");
