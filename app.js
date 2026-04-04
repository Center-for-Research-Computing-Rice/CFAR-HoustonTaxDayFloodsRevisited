/**
 * Core API via CDN `$arcgis.import()` (supported testing path; production builds often use npm — https://developers.arcgis.com/javascript/latest/get-started-npm/).
 * Map UI uses `<arcgis-*>` components from the same CDN entry (`<script type="module" src="https://js.arcgis.com/5.0/">` in index.html).
 */
const [
    ArcGISMap,
    MapView,
    TileLayer,
    BaseTileLayer,
    WebTileLayer,
    FeatureLayer,
    Basemap,
    Viewpoint,
    reactiveUtils
] = await $arcgis.import([
    "@arcgis/core/Map.js",
    "@arcgis/core/views/MapView.js",
    "@arcgis/core/layers/TileLayer.js",
    "@arcgis/core/layers/BaseTileLayer.js",
    "@arcgis/core/layers/WebTileLayer.js",
    "@arcgis/core/layers/FeatureLayer.js",
    "@arcgis/core/Basemap.js",
    "@arcgis/core/Viewpoint.js",
    "@arcgis/core/core/reactiveUtils.js"
]);

const homePosition = { longitude: -95.1410888, latitude: 29.6014573 };
const homeZoom = 12;
const centroidServiceUrl = "https://services.arcgis.com/lqRTrQp2HrfnJt8U/arcgis/rest/services/res_centriods_HC_CC/FeatureServer/0";
const historicFloodServiceUrl =
    "https://tiles.arcgis.com/tiles/lqRTrQp2HrfnJt8U/arcgis/rest/services/TD_historic_HC_CC_Clip2/MapServer";
const transportedFloodServiceUrl =
    "https://tiles.arcgis.com/tiles/lqRTrQp2HrfnJt8U/arcgis/rest/services/TD_transposed_HC_CC_Clip/MapServer";

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

/** Raster legend is a continuous stretch (label “10 - 0”), not the app’s classed sidebar colors. */
const FLOOD_RASTER_MAX_DEPTH_FT = 10;

/** Reject tile RGB this far from the legend ramp (JPEG / nodata / basemap bleed). */
const FLOOD_LEGEND_MATCH_MAX_DIST2 = 22000;

/**
 * Samples the MapServer legend PNG (vertical ramp: top = max ft, bottom = 0 ft).
 * Cached tiles use the same stretch symbology as that image.
 */
async function loadFloodMapServerLegendDepthSamples(mapServerRootUrl) {
    const base = mapServerRootUrl.replace(/\/$/, "");
    const url = `${base}/legend?f=json`;
    try {
        const json = await fetch(url).then((r) => r.json());
        const b64 = json?.layers?.[0]?.legend?.[0]?.imageData;
        if (!b64 || typeof b64 !== "string") {
            return [];
        }
        const binary = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
        const blob = new Blob([binary], { type: "image/png" });
        const bmp = await createImageBitmap(blob);
        const w = bmp.width;
        const h = bmp.height;
        if (w < 1 || h < 1) {
            bmp.close();
            return [];
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
            bmp.close();
            return [];
        }
        ctx.drawImage(bmp, 0, 0);
        bmp.close();
        const cx = Math.floor(w / 2);
        const column = ctx.getImageData(cx, 0, 1, h).data;
        const samples = [];
        const denom = Math.max(1, h - 1);
        for (let row = 0; row < h; row += 1) {
            const o = row * 4;
            const ft = FLOOD_RASTER_MAX_DEPTH_FT * (1 - row / denom);
            samples.push({ r: column[o], g: column[o + 1], b: column[o + 2], ft });
        }
        return samples;
    } catch {
        return [];
    }
}

/**
 * Depth (ft) from RGB vs legend ramp — O(samples) per pixel (two best matches + small IDW), no sort.
 * Previous version sorted 60 entries per pixel × 65k pixels/tile → major jank.
 */
function estimatedDepthFromLegendSamples(r, g, b, samples) {
    const n = samples.length;
    if (n === 0) {
        return 0;
    }
    let bestD2 = Infinity;
    let bestFt = 0;
    let secondD2 = Infinity;
    let secondFt = 0;
    for (let i = 0; i < n; i += 1) {
        const s = samples[i];
        const dr = r - s.r;
        const dg = g - s.g;
        const db = b - s.b;
        const d2 = dr * dr + dg * dg + db * db;
        if (d2 < bestD2) {
            secondD2 = bestD2;
            secondFt = bestFt;
            bestD2 = d2;
            bestFt = s.ft;
        } else if (d2 < secondD2) {
            secondD2 = d2;
            secondFt = s.ft;
        }
    }
    if (bestD2 > FLOOD_LEGEND_MATCH_MAX_DIST2) {
        return 0;
    }
    if (secondD2 === Infinity || secondD2 > FLOOD_LEGEND_MATCH_MAX_DIST2) {
        return bestFt;
    }
    const w1 = 1 / (Math.sqrt(bestD2) + 3);
    const w2 = 1 / (Math.sqrt(secondD2) + 3);
    return (bestFt * w1 + secondFt * w2) / (w1 + w2);
}

/** Plain envelope for intersection tests (avoids fetching tiles the service cannot serve — stops most edge 404 console noise). */
function envelopeFromLayerExtent(ext) {
    if (!ext) {
        return null;
    }
    const xmin = ext.xmin;
    const ymin = ext.ymin;
    const xmax = ext.xmax;
    const ymax = ext.ymax;
    if (![xmin, ymin, xmax, ymax].every(Number.isFinite)) {
        return null;
    }
    return { xmin, ymin, xmax, ymax };
}

function envelopesIntersect(a, b) {
    return a.xmin < b.xmax && a.xmax > b.xmin && a.ymin < b.ymax && a.ymax > b.ymin;
}

function resolutionForTileLevel(tileInfo, level) {
    const lods = tileInfo?.lods;
    if (!lods?.length) {
        return null;
    }
    const lod = lods.find((l) => l.level === level);
    return lod && Number.isFinite(lod.resolution) ? lod.resolution : null;
}

/**
 * Esri map-cache envelope: origin at top-left (max y), column east, row south.
 * Matches /MapServer/tile/{level}/{row}/{col} for standard exported caches.
 */
function tileEnvelopeFromRowCol(level, row, col, tileInfo) {
    const res = resolutionForTileLevel(tileInfo, level);
    if (res == null) {
        return null;
    }
    const tw = tileInfo.cols ?? tileInfo.rows ?? 256;
    const th = tileInfo.rows ?? tileInfo.cols ?? 256;
    const ox = tileInfo.origin?.x;
    const oy = tileInfo.origin?.y;
    if (!Number.isFinite(ox) || !Number.isFinite(oy)) {
        return null;
    }
    const dw = res * tw;
    const dh = res * th;
    const xmin = ox + col * dw;
    const xmax = xmin + dw;
    const ymax = oy - row * dh;
    const ymin = ymax - dh;
    return { xmin, ymin, xmax, ymax };
}

class DepthFilterFloodTileLayer extends BaseTileLayer {
    constructor({
        tileServiceRoot,
        minDepthFt,
        floodScenarioId,
        legendDepthSamples,
        spatialReference,
        fullExtent,
        tileInfo,
        ...layerOptions
    }) {
        super({
            spatialReference,
            fullExtent,
            tileInfo,
            ...layerOptions
        });
        this.tileServiceRoot = tileServiceRoot.replace(/\/$/, "");
        this.minDepthFt = minDepthFt ?? 0;
        this.floodScenarioId = floodScenarioId;
        this._legendDepthSamples = legendDepthSamples ?? [];
        this._coverageEnvelope = envelopeFromLayerExtent(fullExtent);
    }

    getEmptyTileCanvas() {
        const size = this.tileInfo?.rows || 256;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        return canvas;
    }

    getTileUrl(level, row, col) {
        return `${this.tileServiceRoot}/tile/${level}/${row}/${col}`;
    }

    fetchTile(level, row, col, options) {
        if (this.floodScenarioId !== currentFloodLayer || this.visible === false) {
            return Promise.resolve(this.getEmptyTileCanvas());
        }

        const cov = this._coverageEnvelope ?? envelopeFromLayerExtent(this.fullExtent);
        const tileEnv = tileEnvelopeFromRowCol(level, row, col, this.tileInfo);
        if (cov && tileEnv && !envelopesIntersect(cov, tileEnv)) {
            return Promise.resolve(this.getEmptyTileCanvas());
        }

        const url = this.getTileUrl(level, row, col);
        return fetch(url, { signal: options?.signal })
            .then((response) => {
                if (!response.ok) {
                    return null;
                }
                return response.blob();
            })
            .then((blob) => {
                if (!blob) {
                    return this.getEmptyTileCanvas();
                }
                return createImageBitmap(blob);
            })
            .then((imageBitmap) => {
                const isBitmap = imageBitmap && typeof imageBitmap.close === "function" && Number.isFinite(imageBitmap.width);
                if (!isBitmap) {
                    return imageBitmap;
                }
                const w = imageBitmap.width;
                const h = imageBitmap.height;
                const canvas = document.createElement("canvas");
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext("2d", { willReadFrequently: true });
                if (!ctx) {
                    imageBitmap.close();
                    throw new Error("Canvas 2D unavailable");
                }
                ctx.drawImage(imageBitmap, 0, 0);
                imageBitmap.close();
                const minDepth = this.minDepthFt ?? 0;
                const legend = this._legendDepthSamples;
                if (minDepth > 0 && legend.length > 0) {
                    const imageData = ctx.getImageData(0, 0, w, h);
                    const data = imageData.data;
                    const len = data.length;
                    for (let i = 0; i < len; i += 4) {
                        if (data[i + 3] < 8) {
                            continue;
                        }
                        const est = estimatedDepthFromLegendSamples(data[i], data[i + 1], data[i + 2], legend);
                        if (est + 1e-6 < minDepth) {
                            data[i + 3] = 0;
                        }
                    }
                    ctx.putImageData(imageData, 0, 0);
                }
                return canvas;
            })
            .catch(() => this.getEmptyTileCanvas());
    }
}

const [historicFloodMeta, transportedFloodMeta, floodRasterLegendSamples] = await Promise.all([
    fetch(`${historicFloodServiceUrl}?f=json`).then((r) => r.json()),
    fetch(`${transportedFloodServiceUrl}?f=json`).then((r) => r.json()),
    loadFloodMapServerLegendDepthSamples(historicFloodServiceUrl)
]);

if (!floodRasterLegendSamples.length) {
    console.warn(
        "Could not load flood MapServer legend; depth filter on the raster is disabled until legend loads."
    );
}

const overlayLayers = {
    historic: new DepthFilterFloodTileLayer({
        tileServiceRoot: historicFloodServiceUrl,
        floodScenarioId: "historic",
        minDepthFt: 0,
        legendDepthSamples: floodRasterLegendSamples,
        spatialReference: historicFloodMeta.spatialReference,
        fullExtent: historicFloodMeta.fullExtent,
        tileInfo: historicFloodMeta.tileInfo,
        opacity: 0.7,
        visible: true
    }),
    transported: new DepthFilterFloodTileLayer({
        tileServiceRoot: transportedFloodServiceUrl,
        floodScenarioId: "transported",
        minDepthFt: 0,
        legendDepthSamples: floodRasterLegendSamples,
        spatialReference: transportedFloodMeta.spatialReference,
        fullExtent: transportedFloodMeta.fullExtent,
        tileInfo: transportedFloodMeta.tileInfo,
        opacity: 0.7,
        visible: false
    }),
    centroids: new FeatureLayer({
        url: centroidServiceUrl,
        renderer: createCentroidRenderer(currentCentroidField),
        visible: true,
        popupEnabled: false,
        outFields: ["FID", "TD_histori", "TD_transpo"]
    })
};

const map = new ArcGISMap({
    basemap: createBasemap("cartodb-positron"),
    layers: [overlayLayers.historic, overlayLayers.transported, overlayLayers.centroids]
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
    if (n === -9999) return "0 ft";
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
    const oid = a?.FID ?? a?.OBJECTID ?? a?.objectid;
    if (oid != null) return `oid:${oid}`;
    const g = graphic.geometry;
    if (g && g.type === "point" && Number.isFinite(g.x) && Number.isFinite(g.y)) {
        return `xy:${g.x},${g.y}`;
    }
    return null;
}

function buildHomesHoverContent(historic, transportedDepth) {
    return `
        <div class="homes-hover-popup__title">Flood depth</div>
        <div class="homes-hover-popup__row">
            <span class="homes-hover-popup__label">Historic Flood</span>
            <span class="homes-hover-popup__value">${formatDepthFt(historic)}</span>
        </div>
        <div class="homes-hover-popup__row">
            <span class="homes-hover-popup__label">Transported Flood</span>
            <span class="homes-hover-popup__value">${formatDepthFt(transportedDepth)}</span>
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
    const transportedDepth = attrs?.TD_transpo;
    homesHoverPopup.innerHTML = buildHomesHoverContent(historic, transportedDepth);
    homesHoverPopup.hidden = false;
    homesHoverPopup.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => positionHomesHoverPopup(screenX, screenY));
}

let homesHoverHitGeneration = 0;
let homesHoverRafId = null;
let homesHoverCoalesceEvent = null;

function cancelHomesHoverPoll() {
    if (homesHoverRafId != null) {
        cancelAnimationFrame(homesHoverRafId);
        homesHoverRafId = null;
    }
    homesHoverCoalesceEvent = null;
    homesHoverHitGeneration += 1;
}

function scheduleHomesHoverHitTest() {
    if (homesHoverRafId != null) return;
    homesHoverRafId = requestAnimationFrame(() => {
        homesHoverRafId = null;
        const evt = homesHoverCoalesceEvent;
        if (!evt || !homesHoverPopup || !overlayLayers.centroids.visible) return;
        void runHomesHoverHitTest(evt);
    });
}

async function runHomesHoverHitTest(event) {
    const gen = ++homesHoverHitGeneration;
    const ex = event.x;
    const ey = event.y;
    try {
        const response = await view.hitTest(event, { include: overlayLayers.centroids });
        if (gen !== homesHoverHitGeneration) return;
        if (!overlayLayers.centroids.visible) {
            view.container.style.cursor = "";
            hideHomesHoverPopup();
            return;
        }
        const hit = response.results.find((r) => r.graphic?.layer === overlayLayers.centroids);
        if (hit?.graphic) {
            view.container.style.cursor = "pointer";
            const featureKey = getHomesFeatureKey(hit.graphic);
            if (featureKey === homesHoverActiveFeatureKey && !homesHoverPopup.hidden) {
                /* same point: keep fixed popup; still allow follow-up if pointer moved */
            } else {
                homesHoverActiveFeatureKey = featureKey;
                showHomesHoverPopup(event.x, event.y, hit.graphic.attributes);
            }
        } else {
            view.container.style.cursor = "";
            hideHomesHoverPopup();
        }
    } catch {
        if (gen !== homesHoverHitGeneration) return;
        view.container.style.cursor = "";
        hideHomesHoverPopup();
    }

    const latest = homesHoverCoalesceEvent;
    if (
        latest &&
        homesHoverPopup &&
        overlayLayers.centroids.visible &&
        (latest.x !== ex || latest.y !== ey)
    ) {
        scheduleHomesHoverHitTest();
    }
}

view.on("pointer-move", (event) => {
    if (!homesHoverPopup || !overlayLayers.centroids.visible) {
        cancelHomesHoverPoll();
        hideHomesHoverPopup();
        view.container.style.cursor = "";
        return;
    }
    homesHoverCoalesceEvent = event;
    scheduleHomesHoverHitTest();
});

view.on("pointer-leave", () => {
    cancelHomesHoverPoll();
    view.container.style.cursor = "";
    hideHomesHoverPopup();
});

view.ui.empty("top-left");
view.ui.empty("bottom-right");

const goToSearchResult = (mapView, goToParams) =>
    mapView.goTo(goToParams.target, {
        ...(goToParams.options || {}),
        zoom: 15
    });

async function setupMapComponents() {
    const homeEl = document.getElementById("arcgis-home-widget");
    const zoomEl = document.getElementById("arcgis-zoom-widget");
    const searchEl = document.getElementById("arcgis-search-widget");

    await Promise.all(
        [homeEl, zoomEl, searchEl].map((el) =>
            el && typeof el.componentOnReady === "function" ? el.componentOnReady() : Promise.resolve()
        )
    );

    if (zoomEl) {
        zoomEl.view = view;
    }

    if (homeEl) {
        homeEl.view = view;
        homeEl.viewpoint = view.viewpoint?.clone?.() ?? new Viewpoint({ targetGeometry: view.center, scale: view.scale });
    }

    if (searchEl) {
        searchEl.view = view;
        searchEl.allPlaceholder = "Search address or place…";
        searchEl.popupDisabled = false;
        searchEl.resultGraphicDisabled = false;
        searchEl.goToOverride = goToSearchResult;

        const syncSearchLocation = () => {
            const vm = searchEl.viewModel;
            if (vm) {
                vm.location = view.center;
            }
        };
        syncSearchLocation();
        if (typeof reactiveUtils.watch === "function") {
            reactiveUtils.watch(() => view.center, syncSearchLocation);
        }
    }
}

try {
    await setupMapComponents();
} catch (err) {
    console.error("Map components (Home / Zoom / Search) failed to initialize:", err);
}

const basemapDropdown = document.getElementById("basemap-dropdown");
const scenarioButtons = document.querySelectorAll(".scenario-btn");
const scenarioHint = document.getElementById("scenario-hint");
const centroidsToggle = document.getElementById("centroids-toggle");
const homesPointLegend = document.getElementById("homes-point-legend");
const homesFloodedStat = document.getElementById("homes-flooded-stat");
const homesFloodedCountEl = document.getElementById("homes-flooded-count");
const centroidFieldDropdown = document.getElementById("centroid-field-dropdown");
const opacitySlider = document.getElementById("opacity-slider");
const opacityValue = document.getElementById("opacity-value");
const depthFilterSlider = document.getElementById("depth-filter-slider");
const depthFilterValue = document.getElementById("depth-filter-value");
const controlsToggle = document.getElementById("controls-toggle");
const controlsContent = document.getElementById("controls-content");

function syncCentroidFieldDropdown() {
    centroidFieldDropdown.value = currentCentroidField;
}

function getFloodMinDepthFt() {
    return Math.max(0, Number(overlayLayers?.historic?.minDepthFt) || 0);
}

function formatDepthFilterReadout(minFt) {
    const v = Math.max(0, Number(minFt) || 0);
    if (v <= 0) {
        return "Any depth";
    }
    return `> ${v.toFixed(1)} ft`;
}

function syncDepthFilterReadout(minFt) {
    if (depthFilterValue) {
        depthFilterValue.textContent = formatDepthFilterReadout(minFt);
    }
}

function syncHomesFloodedStatTitle(minFt) {
    if (!homesFloodedStat) {
        return;
    }
    const v = Math.max(0, Number(minFt) || 0);
    const fieldLabel = currentCentroidField === "TD_transpo" ? "Transported" : "Historic";
    homesFloodedStat.title =
        v <= 0
            ? `Server count for ${fieldLabel}: depth > 0 ft, excluding −9999.`
            : `Server count for ${fieldLabel}: depth ≥ ${v.toFixed(1)} ft (same floor as the depth-filtered raster), excluding −9999.`;
}

/** Counts homes with depth &gt; min depth filter (same floor as the raster); excludes −9999. Field follows scenario / advanced point field. */
async function refreshFloodedHomesCount() {
    if (!homesFloodedCountEl || !overlayLayers?.centroids) {
        return;
    }
    const field = currentCentroidField;
    if (field !== "TD_histori" && field !== "TD_transpo") {
        return;
    }

    const minFt = getFloodMinDepthFt();
    syncHomesFloodedStatTitle(minFt);

    homesFloodedCountEl.classList.add("homes-flooded-stat__value--pending");
    if (homesFloodedStat) {
        homesFloodedStat.setAttribute("aria-busy", "true");
    }

    const depthPredicate =
        minFt <= 0 ? `${field} > 0` : `${field} >= ${minFt}`;
    const where = `${depthPredicate} AND ${field} <> -9999`;
    try {
        await overlayLayers.centroids.load();
        const count = await overlayLayers.centroids.queryFeatureCount({ where });
        homesFloodedCountEl.textContent = count.toLocaleString();
    } catch {
        homesFloodedCountEl.textContent = "—";
    } finally {
        homesFloodedCountEl.classList.remove("homes-flooded-stat__value--pending");
        if (homesFloodedStat) {
            homesFloodedStat.removeAttribute("aria-busy");
        }
    }
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
                "Modeled flood depths for typical conditions in this area—the historic baseline. Compare with Transported to see Tax Day 2016 applied here.";
        } else {
            scenarioHint.textContent = "Showing: Transported Tax Day 2016.";
            scenarioHint.title =
                "Depths as if the April 2016 Tax Day flood were placed on this landscape. Contrast with Historic to see the difference from typical risk.";
        }
    }
}

function applyRasterScenario(selectedRaster) {
    currentFloodLayer = selectedRaster;

    overlayLayers.historic.visible = selectedRaster === "historic";
    overlayLayers.transported.visible = selectedRaster === "transported";

    if (selectedRaster === "historic") {
        currentCentroidField = "TD_histori";
    } else {
        currentCentroidField = "TD_transpo";
    }

    syncCentroidFieldDropdown();
    updateScenarioUI(selectedRaster);

    const homesOn = centroidsToggle.getAttribute("aria-checked") === "true";
    if (homesOn) {
        overlayLayers.centroids.renderer = createCentroidRenderer(currentCentroidField);
    }
    void refreshFloodedHomesCount();
}

basemapDropdown.addEventListener("change", (event) => {
    map.basemap = createBasemap(event.target.value);
});

scenarioButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
        applyRasterScenario(btn.dataset.scenario);
    });
});

applyRasterScenario("historic");

function setHomesEnabled(on) {
    overlayLayers.centroids.visible = on;
    centroidsToggle.setAttribute("aria-checked", String(on));
    centroidsToggle.classList.toggle("is-active", on);
    if (homesPointLegend) {
        homesPointLegend.hidden = !on;
    }
    if (homesFloodedStat) {
        homesFloodedStat.hidden = !on;
    }
    if (!on) {
        cancelHomesHoverPoll();
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
    if (next) {
        void refreshFloodedHomesCount();
    }
});

setHomesEnabled(true);

centroidFieldDropdown.addEventListener("change", (event) => {
    currentCentroidField = event.target.value;
    if (centroidsToggle.getAttribute("aria-checked") === "true") {
        overlayLayers.centroids.renderer = createCentroidRenderer(currentCentroidField);
    }
    void refreshFloodedHomesCount();
});

opacitySlider.addEventListener("input", (event) => {
    const transparency = Number.parseInt(event.target.value, 10);
    const opacity = (100 - transparency) / 100;
    overlayLayers.historic.opacity = opacity;
    overlayLayers.transported.opacity = opacity;
    opacityValue.textContent = `${100 - transparency}%`;
});

function applyFloodMinDepthFt(minFt) {
    const v = Math.max(0, Number(minFt) || 0);
    overlayLayers.historic.minDepthFt = v;
    overlayLayers.transported.minDepthFt = v;
    syncDepthFilterReadout(v);
    void refreshFloodedHomesCount();
    if (currentFloodLayer === "historic") {
        overlayLayers.historic.refresh();
    } else {
        overlayLayers.transported.refresh();
    }
}

if (depthFilterSlider && depthFilterValue) {
    depthFilterSlider.addEventListener("input", (event) => {
        const v = Number.parseFloat(event.target.value);
        applyFloodMinDepthFt(v);
    });
    syncDepthFilterReadout(Number.parseFloat(depthFilterSlider.value) || 0);
}

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
