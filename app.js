const [
    ArcGISMap,
    MapView,
    TileLayer,
    WebTileLayer,
    FeatureLayer,
    Basemap,
    Home,
    Zoom,
    Search
] = await $arcgis.import([
    "@arcgis/core/Map.js",
    "@arcgis/core/views/MapView.js",
    "@arcgis/core/layers/TileLayer.js",
    "@arcgis/core/layers/WebTileLayer.js",
    "@arcgis/core/layers/FeatureLayer.js",
    "@arcgis/core/Basemap.js",
    "@arcgis/core/widgets/Home.js",
    "@arcgis/core/widgets/Zoom.js",
    "@arcgis/core/widgets/Search.js"
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
            {
                minValue: Number.NEGATIVE_INFINITY,
                maxValue: 0,
                symbol: {
                    type: "simple-marker",
                    size: 4,
                    color: "#ffffff",
                    outline: { color: "#dfdcdcbe", width: 0.5 }
                },
                label: "No flood"
            },
            {
                minValue: Number.MIN_VALUE,
                maxValue: Number.POSITIVE_INFINITY,
                symbol: {
                    type: "simple-marker",
                    size: 4,
                    color: "#ff8c00",
                    outline: { color: "#dfdcdcbe", width: 0.5 }
                },
                label: "Flooded"
            }
        ],
        defaultSymbol: {
            type: "simple-marker",
            size: 4,
            color: "#ffffff",
            outline: { color: "#dfdcdcbe", width: 0.5 }
        }
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
        visible: true,
        popupEnabled: false,
        outFields: ["OBJECTID", "TD_histori", "TD_transpo"]
    })
};

const map = new ArcGISMap({
    basemap: createBasemap("cartodb-positron"),
    layers: [overlayLayers.historic, overlayLayers.transposed, overlayLayers.centroids]
});

const view = new MapView({
    container: "viewDiv",
    map,
    center: [homePosition.longitude, homePosition.latitude],
    zoom: homeZoom
});

await view.when();

const homesHoverPopup = document.getElementById("homes-hover-popup");

function formatDepthFt(value) {
    if (value === null || value === undefined || value === "") return "—";
    const n = Number(value);
    if (Number.isNaN(n)) return "—";
    return `${n.toFixed(1)} ft`;
}

let homesHoverActiveFeatureKey = null;

function hideHomesHoverPopup() {
    if (!homesHoverPopup) return;
    homesHoverActiveFeatureKey = null;
    homesHoverPopup.hidden = true;
    homesHoverPopup.setAttribute("aria-hidden", "true");
}

function getHomesFeatureKey(graphic) {
    if (!graphic) return null;
    const layer = overlayLayers.centroids;
    if (typeof layer.getObjectId === "function") {
        try {
            const id = layer.getObjectId(graphic);
            if (id != null) return `oid:${id}`;
        } catch {
            /* ignore */
        }
    }
    const a = graphic.attributes;
    const oid = a?.OBJECTID ?? a?.FID ?? a?.objectid;
    if (oid != null) return `oid:${oid}`;
    const g = graphic.geometry;
    if (g && g.type === "point" && Number.isFinite(g.x) && Number.isFinite(g.y)) {
        return `xy:${g.x},${g.y}`;
    }
    return null;
}

function buildHomesHoverContent(historic, transposed) {
    return `
        <div class="homes-hover-popup__title">Flood depth</div>
        <div class="homes-hover-popup__row">
            <span class="homes-hover-popup__label">Historic Flood</span>
            <span class="homes-hover-popup__value">${formatDepthFt(historic)}</span>
        </div>
        <div class="homes-hover-popup__row">
            <span class="homes-hover-popup__label">Transposed Flood</span>
            <span class="homes-hover-popup__value">${formatDepthFt(transposed)}</span>
        </div>`;
}

function positionHomesHoverPopup(screenX, screenY) {
    if (!homesHoverPopup || homesHoverPopup.hidden) return;
    const wrap = homesHoverPopup.parentElement;
    if (!wrap) return;
    const pad = 14;
    const w = homesHoverPopup.offsetWidth;
    const h = homesHoverPopup.offsetHeight;
    let left = screenX + pad;
    let top = screenY + pad;
    if (left + w > wrap.clientWidth - 8) {
        left = Math.max(8, screenX - w - pad);
    }
    if (top + h > wrap.clientHeight - 8) {
        top = Math.max(8, screenY - h - pad);
    }
    homesHoverPopup.style.left = `${left}px`;
    homesHoverPopup.style.top = `${top}px`;
}

function showHomesHoverPopup(screenX, screenY, attrs) {
    if (!homesHoverPopup) return;
    const historic = attrs?.TD_histori;
    const transposed = attrs?.TD_transpo;
    homesHoverPopup.innerHTML = buildHomesHoverContent(historic, transposed);
    homesHoverPopup.hidden = false;
    homesHoverPopup.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => positionHomesHoverPopup(screenX, screenY));
}

let homesHoverHitGeneration = 0;
view.on("pointer-move", async (event) => {
    if (!homesHoverPopup || !overlayLayers.centroids.visible) {
        hideHomesHoverPopup();
        view.container.style.cursor = "";
        return;
    }
    const gen = ++homesHoverHitGeneration;
    try {
        const response = await view.hitTest(event, { include: overlayLayers.centroids });
        if (gen !== homesHoverHitGeneration) return;
        const hit = response.results.find((r) => r.graphic?.layer === overlayLayers.centroids);
        if (hit?.graphic) {
            view.container.style.cursor = "pointer";
            const featureKey = getHomesFeatureKey(hit.graphic);
            if (featureKey === homesHoverActiveFeatureKey && !homesHoverPopup.hidden) {
                return;
            }
            homesHoverActiveFeatureKey = featureKey;
            showHomesHoverPopup(event.x, event.y, hit.graphic.attributes);
        } else {
            view.container.style.cursor = "";
            hideHomesHoverPopup();
        }
    } catch {
        if (gen !== homesHoverHitGeneration) return;
        view.container.style.cursor = "";
        hideHomesHoverPopup();
    }
});

view.on("pointer-leave", () => {
    homesHoverHitGeneration += 1;
    view.container.style.cursor = "";
    hideHomesHoverPopup();
});

view.ui.empty("top-left");
view.ui.empty("bottom-right");
view.ui.add(new Home({ view }), "top-left");
view.ui.add(new Zoom({ view }), "top-left");

const searchWidget = new Search({
    view,
    container: "search-widget-container",
    popupEnabled: true,
    resultGraphicEnabled: true,
    allPlaceholder: "Search address or place…",
    goToOverride: (mapView, goToParams) => {
        return mapView.goTo(goToParams.target, {
            ...(goToParams.options || {}),
            zoom: 15
        });
    }
});

searchWidget.viewModel.location = view.center;
view.watch("center", () => {
    searchWidget.viewModel.location = view.center;
});

const basemapDropdown = document.getElementById("basemap-dropdown");
const scenarioButtons = document.querySelectorAll(".scenario-btn");
const scenarioHint = document.getElementById("scenario-hint");
const centroidsToggle = document.getElementById("centroids-toggle");
const homesPointLegend = document.getElementById("homes-point-legend");
const centroidFieldDropdown = document.getElementById("centroid-field-dropdown");
const opacitySlider = document.getElementById("opacity-slider");
const opacityValue = document.getElementById("opacity-value");
const controlsToggle = document.getElementById("controls-toggle");
const controlsContent = document.getElementById("controls-content");

function syncCentroidFieldDropdown() {
    centroidFieldDropdown.value = currentCentroidField;
}

function updateScenarioUI(selectedRaster) {
    scenarioButtons.forEach((btn) => {
        const isActive = btn.dataset.scenario === selectedRaster;
        btn.classList.toggle("is-active", isActive);
        btn.setAttribute("aria-pressed", String(isActive));
    });
    if (scenarioHint) {
        if (selectedRaster === "historic") {
            scenarioHint.textContent = "Showing: Historic baseline.";
            scenarioHint.title =
                "Modeled flood depths for typical conditions in this area—the historic baseline. Compare with Transposed to see Tax Day 2016 transposed here.";
        } else {
            scenarioHint.textContent = "Showing: Transposed Tax Day 2016.";
            scenarioHint.title =
                "Depths as if the April 2016 Tax Day flood were placed on this landscape. Contrast with Historic to see the difference from typical risk.";
        }
    }
}

function applyRasterScenario(selectedRaster) {
    overlayLayers.historic.visible = selectedRaster === "historic";
    overlayLayers.transposed.visible = selectedRaster === "transposed";

    if (selectedRaster === "historic") {
        currentCentroidField = "TD_histori";
    } else {
        currentCentroidField = "TD_transpo";
    }

    syncCentroidFieldDropdown();
    updateScenarioUI(selectedRaster);

    currentFloodLayer = selectedRaster;
    const homesOn = centroidsToggle.getAttribute("aria-checked") === "true";
    if (homesOn) {
        overlayLayers.centroids.renderer = createCentroidRenderer(currentCentroidField);
    }
}

basemapDropdown.addEventListener("change", (event) => {
    map.basemap = createBasemap(event.target.value);
});

scenarioButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
        applyRasterScenario(btn.dataset.scenario);
    });
});

updateScenarioUI("historic");
syncCentroidFieldDropdown();

function setHomesEnabled(on) {
    overlayLayers.centroids.visible = on;
    centroidsToggle.setAttribute("aria-checked", String(on));
    centroidsToggle.classList.toggle("is-active", on);
    if (homesPointLegend) {
        homesPointLegend.hidden = !on;
    }
    if (!on) {
        hideHomesHoverPopup();
        if (view?.container) {
            view.container.style.cursor = "";
        }
    }
    if (on) {
        overlayLayers.centroids.renderer = createCentroidRenderer(currentCentroidField);
    }
}

centroidsToggle.addEventListener("click", () => {
    const next = centroidsToggle.getAttribute("aria-checked") !== "true";
    setHomesEnabled(next);
});

setHomesEnabled(true);

centroidFieldDropdown.addEventListener("change", (event) => {
    currentCentroidField = event.target.value;
    if (centroidsToggle.getAttribute("aria-checked") === "true") {
        overlayLayers.centroids.renderer = createCentroidRenderer(currentCentroidField);
    }
});

opacitySlider.addEventListener("input", (event) => {
    const transparency = Number.parseInt(event.target.value, 10);
    const opacity = (100 - transparency) / 100;
    overlayLayers.historic.opacity = opacity;
    overlayLayers.transposed.opacity = opacity;
    opacityValue.textContent = `${100 - transparency}%`;
});

controlsToggle.addEventListener("click", () => {
    controlsContent.classList.toggle("collapsed");
    const arrow = controlsToggle.textContent.includes("▲") ? "▼" : "▲";
    controlsToggle.textContent = `Map options ${arrow}`;
});

function positionTipBubble(wrap) {
    const btn = wrap.querySelector(".tip-trigger");
    const bubble = wrap.querySelector(".tip-bubble");
    if (!btn || !bubble) {
        return;
    }
    const br = btn.getBoundingClientRect();
    const margin = 8;
    const maxW = 252;
    const w = Math.min(maxW, window.innerWidth - 2 * margin);
    let left = br.right - w;
    left = Math.max(margin, Math.min(left, window.innerWidth - margin - w));
    const gap = 6;
    let top = br.bottom + gap;
    bubble.style.width = `${w}px`;
    bubble.style.left = `${left}px`;
    bubble.style.top = `${top}px`;
    const h = bubble.offsetHeight;
    if (top + h > window.innerHeight - margin) {
        top = Math.max(margin, br.top - h - gap);
        bubble.style.top = `${top}px`;
    }
}

function repositionVisibleTips() {
    document.querySelectorAll(".tip-wrap").forEach((wrap) => {
        if (wrap.matches(":hover") || wrap.classList.contains("has-open-tip")) {
            positionTipBubble(wrap);
        }
    });
}

function initHelpTooltips() {
    document.querySelectorAll(".tip-wrap").forEach((wrap) => {
        const btn = wrap.querySelector(".tip-trigger");
        if (!btn) {
            return;
        }

        wrap.addEventListener("mouseenter", () => {
            positionTipBubble(wrap);
        });
        wrap.addEventListener("focusin", () => {
            positionTipBubble(wrap);
        });

        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const wasOpen = wrap.classList.contains("has-open-tip");
            document.querySelectorAll(".tip-wrap.has-open-tip").forEach((w) => {
                w.classList.remove("has-open-tip");
                w.querySelector(".tip-trigger")?.setAttribute("aria-expanded", "false");
            });
            if (!wasOpen) {
                positionTipBubble(wrap);
                wrap.classList.add("has-open-tip");
                btn.setAttribute("aria-expanded", "true");
            }
        });
    });

    document.addEventListener("click", (e) => {
        if (!e.target.closest(".tip-wrap")) {
            document.querySelectorAll(".tip-wrap.has-open-tip").forEach((w) => {
                w.classList.remove("has-open-tip");
                w.querySelector(".tip-trigger")?.setAttribute("aria-expanded", "false");
            });
        }
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            document.querySelectorAll(".tip-wrap.has-open-tip").forEach((w) => {
                w.classList.remove("has-open-tip");
                w.querySelector(".tip-trigger")?.setAttribute("aria-expanded", "false");
            });
        }
    });

    window.addEventListener("resize", repositionVisibleTips);
    document.addEventListener("scroll", repositionVisibleTips, true);
}

initHelpTooltips();

window.arcgisMap = map;
window.arcgisView = view;
window.overlayLayers = overlayLayers;
window.currentFloodLayer = currentFloodLayer;
window.getFloodColor = getFloodColor;

console.log("ArcGIS JavaScript API v5 map initialized for Houston, Texas");
