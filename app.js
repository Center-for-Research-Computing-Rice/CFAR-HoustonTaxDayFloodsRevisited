/**
 * Core API via CDN `$arcgis.import()` (supported testing path; production builds often use npm — https://developers.arcgis.com/javascript/latest/get-started-npm/).
 * Map UI uses `<arcgis-*>` components from the same CDN entry (`<script type="module" src="https://js.arcgis.com/5.0/">` in index.html).
 */
const [
    ArcGISMap,
    MapView,
    BaseTileLayer,
    WebTileLayer,
    FeatureLayer,
    Basemap,
    Viewpoint,
    reactiveUtils,
    FeatureFilter,
    Extent
] = await $arcgis.import([
    "@arcgis/core/Map.js",
    "@arcgis/core/views/MapView.js",
    "@arcgis/core/layers/BaseTileLayer.js",
    "@arcgis/core/layers/WebTileLayer.js",
    "@arcgis/core/layers/FeatureLayer.js",
    "@arcgis/core/Basemap.js",
    "@arcgis/core/Viewpoint.js",
    "@arcgis/core/core/reactiveUtils.js",
    "@arcgis/core/layers/support/FeatureFilter.js",
    "@arcgis/core/geometry/Extent.js"
]);

/**
 * When `.../MapServer/legend?f=json` has no parseable stretch label, assume this data range (ft).
 * Stretched BW tiles: white → min, black → max (same convention as ArcGIS raster export).
 */
const FLOOD_RASTER_DATA_RANGE_FALLBACK_FT = { minFt: 0, maxFt: 10 };

/** Raster color ramp compresses to this depth; ≥ this depth uses the deepest ramp color. */
const FLOOD_COLOR_DISPLAY_MAX_DEPTH_FT = 2;

/**
 * @param {unknown} legendJson Response from `.../MapServer/legend?f=json`
 * @param {number} [layerId=0]
 * @returns {{ minFt: number, maxFt: number } | null}
 */
function parseFloodRasterDepthRangeFromLegend(legendJson, layerId = 0) {
    const layers = legendJson?.layers;
    if (!Array.isArray(layers)) {
        return null;
    }
    const layer = layers.find((l) => l.id === layerId) ?? layers[0];
    const leg = layer?.legend;
    if (!Array.isArray(leg) || leg.length === 0) {
        return null;
    }
    const label = leg[0]?.label;
    if (typeof label !== "string") {
        return null;
    }
    const parts = label.split(/\s*-\s*/).map((s) => Number.parseFloat(String(s).trim()));
    if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) {
        return null;
    }
    const a = parts[0];
    const b = parts[1];
    const minFt = Math.min(a, b);
    const maxFt = Math.max(a, b);
    if (!(maxFt > minFt)) {
        return null;
    }
    return { minFt, maxFt };
}

function resolveFloodRasterDataRangeFt(legendJson, layerId = 0) {
    const parsed = parseFloodRasterDepthRangeFromLegend(legendJson, layerId);
    if (parsed) {
        return parsed;
    }
    return { ...FLOOD_RASTER_DATA_RANGE_FALLBACK_FT };
}

/** Static config per watershed (URLs, attribute fields, optional fixed home view). */
const WATERSHED_DEFS = {
    "clear-creek": {
        id: "clear-creek",
        label: "Clear Creek",
        aboutLede:
            "In April 2016, the Tax Day Storm brought historic flooding to parts of the Houston region, mostly on the outer fringe. This map compares the actual flood impacts in the Clear Creek watershed with the impacts the 2016 Tax Day Storm would have had, if it centered over the Clear Creek area, instead of outer Houston. Below: three map scenarios—Historic, Transported, and Difference.",
        aboutHistoricHtml:
            '<span class="narrative-term">Historic</span> — Flood depths for this area during the actual Tax Day Storm of April 17–18, 2016.',
        aboutTransportedHtml:
            '<span class="narrative-term">Transported</span> — Modeled flood depths if the 2016 Tax Day Storm were centered on the Clear Creek landscape.',
        historicTileUrl:
            "https://tiles.arcgis.com/tiles/lqRTrQp2HrfnJt8U/arcgis/rest/services/TD_historic_HC_CC_BW/MapServer",
        transportedTileUrl:
            "https://tiles.arcgis.com/tiles/lqRTrQp2HrfnJt8U/arcgis/rest/services/TD_transposed_HC_CC_BW/MapServer",
        centroidUrl:
            "https://services.arcgis.com/lqRTrQp2HrfnJt8U/arcgis/rest/services/res_centriods_HC_CC/FeatureServer/0",
        historicField: "TD_histori",
        transportedField: "TD_transpo",
        homeCenter: { longitude: -95.1410888, latitude: 29.6014573 },
        homeZoom: 12.5
    },
    "hunting-bayou": {
        id: "hunting-bayou",
        label: "Hunting Bayou",
        aboutLede:
            "In April 2016, the Tax Day Storm brought historic flooding to parts of the Houston region, mostly on the outer fringe. This map compares the actual flood impacts in the Hunting Bayou watershed with the impacts the 2016 Tax Day Storm would have had, if it centered over the Hunting Bayou area, instead of outer Houston. Below: three map scenarios—Historic, Transported, and Difference.",
        aboutHistoricHtml:
            '<span class="narrative-term">Historic</span> — Flood depths for this area during the actual Tax Day Storm of April 17–18, 2016.',
        aboutTransportedHtml:
            '<span class="narrative-term">Transported</span> — Modeled flood depths if the 2016 Tax Day Storm were centered on the Hunting Bayou landscape.',
        historicTileUrl:
            "https://tiles.arcgis.com/tiles/lqRTrQp2HrfnJt8U/arcgis/rest/services/Resampled_Huntings_Historical_Depths/MapServer",
        transportedTileUrl:
            "https://tiles.arcgis.com/tiles/lqRTrQp2HrfnJt8U/arcgis/rest/services/Resample_Huntings_Transported_Depths/MapServer",
        centroidUrl:
            "https://services.arcgis.com/lqRTrQp2HrfnJt8U/arcgis/rest/services/HC_Res_Centriods_BG_HB/FeatureServer/0",
        historicField: "HTD_dep_HB",
        transportedField: "TDT_dep_HB",
        homeCenter: null,
        homeZoom: 13.3
    }
};

/** Same for every watershed; shown in About → narrative list. */
const ABOUT_COMPARISON_DIFFERENCE_HTML =
    '<span class="narrative-term">Difference</span> — The flood layer shows <strong>transported minus historic</strong> depth (feet) wherever that gain is positive—where placing the Tax Day 2016 storm on this watershed would add water beyond what the actual 2016 event produced. <strong>Affected homes</strong> are filtered to show only those that are not flooded in Historic but flooded in Transported.';

/**
 * Water-themed display ramps (t = 0 shallow … 1 deep on the compressed color scale).
 * `classic-cyan` matches the original app palette.
 */
const FLOOD_RASTER_RAMPS = {
    "classic-cyan": {
        label: "Classic cyan–blue",
        stops: [
            { t: 0, r: 204, g: 255, b: 255 },
            { t: 0.2, r: 102, g: 217, b: 255 },
            { t: 0.4, r: 0, g: 153, b: 255 },
            { t: 0.6, r: 0, g: 71, b: 178 },
            { t: 0.8, r: 0, g: 45, b: 118 },
            { t: 1, r: 0, g: 14, b: 46 }
        ]
    },
    "lagoon-teal": {
        label: "Lagoon teal",
        stops: [
            { t: 0, r: 220, g: 255, b: 252 },
            { t: 0.2, r: 120, g: 230, b: 215 },
            { t: 0.4, r: 0, g: 185, b: 175 },
            { t: 0.6, r: 0, g: 128, b: 135 },
            { t: 0.8, r: 0, g: 88, b: 100 },
            { t: 1, r: 0, g: 48, b: 62 }
        ]
    },
    "deep-navy": {
        label: "Deep navy",
        stops: [
            { t: 0, r: 232, g: 240, b: 255 },
            { t: 0.2, r: 170, g: 195, b: 230 },
            { t: 0.4, r: 95, g: 135, b: 195 },
            { t: 0.6, r: 45, g: 85, b: 150 },
            { t: 0.8, r: 22, g: 50, b: 105 },
            { t: 1, r: 10, g: 24, b: 58 }
        ]
    },
    "tropical-azure": {
        label: "Tropical azure",
        stops: [
            { t: 0, r: 200, g: 248, b: 255 },
            { t: 0.2, r: 0, g: 220, b: 255 },
            { t: 0.4, r: 0, g: 175, b: 235 },
            { t: 0.6, r: 0, g: 120, b: 200 },
            { t: 0.8, r: 0, g: 75, b: 150 },
            { t: 1, r: 0, g: 38, b: 88 }
        ]
    },
    "slate-tide": {
        label: "Slate tide",
        stops: [
            { t: 0, r: 235, g: 242, b: 248 },
            { t: 0.2, r: 185, g: 205, b: 225 },
            { t: 0.4, r: 110, g: 145, b: 180 },
            { t: 0.6, r: 60, g: 100, b: 140 },
            { t: 0.8, r: 35, g: 68, b: 98 },
            { t: 1, r: 18, g: 38, b: 58 }
        ]
    },
    "seafoam-mist": {
        label: "Seafoam mist",
        stops: [
            { t: 0, r: 230, g: 255, b: 248 },
            { t: 0.2, r: 160, g: 240, b: 225 },
            { t: 0.4, r: 70, g: 200, b: 195 },
            { t: 0.6, r: 30, g: 150, b: 165 },
            { t: 0.8, r: 15, g: 105, b: 130 },
            { t: 1, r: 8, g: 62, b: 82 }
        ]
    },
    "cyan-magenta": {
        label: "Cyan to magenta (pink extreme)",
        stops: [
            { t: 0, r: 204, g: 255, b: 255 },
            { t: 0.2, r: 102, g: 217, b: 255 },
            { t: 0.4, r: 0, g: 153, b: 255 },
            { t: 0.6, r: 0, g: 71, b: 178 },
            { t: 0.8, r: 90, g: 40, b: 195 },
            { t: 1, r: 245, g: 35, b: 245 }
        ]
    }
};

let currentFloodRasterRampId = "classic-cyan";

function getFloodRasterDisplayStops() {
    const ramp = FLOOD_RASTER_RAMPS[currentFloodRasterRampId];
    return ramp?.stops ?? FLOOD_RASTER_RAMPS["classic-cyan"].stops;
}

function floodDepthDisplayRgbFromNorm(t, stops = getFloodRasterDisplayStops()) {
    const u = Math.max(0, Math.min(1, t));
    if (u <= stops[0].t) {
        const s = stops[0];
        return { r: s.r, g: s.g, b: s.b };
    }
    const lastStop = stops[stops.length - 1];
    if (u >= lastStop.t) {
        return { r: lastStop.r, g: lastStop.g, b: lastStop.b };
    }
    for (let i = 0; i < stops.length - 1; i += 1) {
        const a = stops[i];
        const b = stops[i + 1];
        if (u <= b.t) {
            const span = b.t - a.t || 1e-6;
            const k = (u - a.t) / span;
            return {
                r: Math.round(a.r + k * (b.r - a.r)),
                g: Math.round(a.g + k * (b.g - a.g)),
                b: Math.round(a.b + k * (b.b - a.b))
            };
        }
    }
    return { r: lastStop.r, g: lastStop.g, b: lastStop.b };
}

function rgbToHex(r, g, b) {
    const h = (n) =>
        Math.max(0, Math.min(255, Math.round(Number(n) || 0)))
            .toString(16)
            .padStart(2, "0");
    return `#${h(r)}${h(g)}${h(b)}`;
}

/** Mid-depth (ft) per legend band on the 0–2 ft compressed color scale (matches raster t = depth / cap). */
const FLOOD_LEGEND_SWATCH_DEPTH_MID_FT = {
    nuisance: 0.25,
    danger: 0.75,
    major: 1.55,
    extreme: 2
};

/** Updates #flood-legend swatches to match `currentFloodRasterRampId`. */
function syncFloodLegendSwatches() {
    const root = document.getElementById("flood-legend");
    if (!root) {
        return;
    }
    const stops = getFloodRasterDisplayStops();
    const cap = FLOOD_COLOR_DISPLAY_MAX_DEPTH_FT;
    const noneEl = root.querySelector('.legend-item[data-depth-class="none"] .legend-color');
    if (noneEl) {
        noneEl.style.backgroundColor = "#ffffff";
    }
    for (const [cls, midFt] of Object.entries(FLOOD_LEGEND_SWATCH_DEPTH_MID_FT)) {
        const el = root.querySelector(`.legend-item[data-depth-class="${cls}"] .legend-color`);
        if (!el) {
            continue;
        }
        const t = Math.min(1, midFt / cap);
        const { r, g, b } = floodDepthDisplayRgbFromNorm(t, stops);
        el.style.backgroundColor = rgbToHex(r, g, b);
    }
}

const FLOOD_LEGEND_SCENARIO_COPY = {
    absolute: {
        heading: "Flood depth",
        tipAria: "Help: flood depth legend classes",
        rows: {
            none: { label: "None", depth: "0.0 ft" },
            nuisance: { label: "Nuisance", depth: "0.1–0.4 ft" },
            danger: { label: "Danger", depth: "0.5–1.0 ft" },
            major: { label: "Major", depth: "1.1–2.0 ft" },
            extreme: { label: "Extreme", depth: "2+ ft" }
        }
    },
    difference: {
        heading: "Depth gain",
        tipAria: "Help: depth gain legend (Difference mode)",
        rows: {
            none: { label: "Not shown", depth: "≤ 0 ft gain" },
            nuisance: { label: "Low gain", depth: "0.1–0.4 ft" },
            danger: { label: "Moderate gain", depth: "0.5–1.0 ft" },
            major: { label: "Large gain", depth: "1.1–2.0 ft" },
            extreme: { label: "Very large gain", depth: "2+ ft" }
        }
    }
};

/** Legend categories describe absolute depths for Historic/Transported; Difference uses the same color scale for positive transported − historic gain. */
function syncFloodLegendForScenario(floodScenarioId) {
    const mode = floodScenarioId === "difference" ? "difference" : "absolute";
    const copy = FLOOD_LEGEND_SCENARIO_COPY[mode];
    const heading = document.getElementById("flood-legend-heading");
    if (heading) {
        heading.textContent = copy.heading;
    }
    const tipBtn = document.getElementById("tip-btn-flood-legend");
    if (tipBtn) {
        tipBtn.setAttribute("aria-label", copy.tipAria);
    }
    const tipAbs = document.getElementById("tip-flood-legend-body-absolute");
    const tipDiff = document.getElementById("tip-flood-legend-body-difference");
    if (tipAbs && tipDiff) {
        tipAbs.hidden = mode === "difference";
        tipDiff.hidden = mode !== "difference";
    }
    const root = document.getElementById("flood-legend");
    if (!root) {
        return;
    }
    for (const [cls, { label, depth }] of Object.entries(copy.rows)) {
        const item = root.querySelector(`.legend-item[data-depth-class="${cls}"]`);
        if (!item) {
            continue;
        }
        const labelEl = item.querySelector(".legend-label");
        const depthEl = item.querySelector(".legend-depth");
        if (labelEl) {
            labelEl.textContent = label;
        }
        if (depthEl) {
            depthEl.textContent = depth;
        }
    }
}

function getFloodColor(depth) {
    if (depth === null || depth === undefined) return "#cccccc";
    const d = Number(depth);
    if (!Number.isFinite(d) || d <= 0) return "#ffffff";
    if (d <= 2) return "#ccffff";
    if (d <= 4) return "#66d9ff";
    if (d <= 6) return "#0099ff";
    if (d <= 8) return "#0047b2";
    return "#000e2e";
}

/** Esri portal basemap ids accepted by `map.basemap` (vector / imagery presets). */
const ESRI_BASEMAP_BY_SELECTOR = {
    "esri-streets": "streets-vector",
    "esri-satellite": "satellite",
    "esri-hybrid": "hybrid",
    "esri-topo": "topo-vector",
    "esri-light-gray": "gray-vector",
    "esri-dark-gray": "dark-gray-vector",
    "esri-terrain": "terrain",
    "esri-oceans": "oceans"
};

function createBasemap(id) {
    if (id === "cartodb-positron") {
        return new Basemap({
            baseLayers: [
                new WebTileLayer({
                    urlTemplate: "https://{subDomain}.basemaps.cartocdn.com/light_all/{level}/{col}/{row}.png",
                    subDomains: ["a", "b", "c", "d"]
                })
            ],
            title: "CartoDB Positron",
            id: "cartodb-positron"
        });
    }
    const esriId = ESRI_BASEMAP_BY_SELECTOR[id];
    if (esriId != null) {
        return esriId;
    }
    return createBasemap("cartodb-positron");
}

let currentCentroidField = "TD_histori";
let currentFloodLayer = "historic";

/** Difference mode: filter leaves only transported-only floods; one symbol is enough. */
function createDifferenceCentroidSimpleRenderer() {
    return {
        type: "simple",
        symbol: {
            type: "simple-marker",
            size: 4,
            color: "#ff8c00",
            outline: { color: "#dfdcdcbe", width: 0.5 }
        }
    };
}

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

/** Reject tile RGB this far from the legend ramp (JPEG / nodata / basemap bleed). */
const FLOOD_LEGEND_MATCH_MAX_DIST2 = 22000;

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

/**
 * Same 0.1 ft grid as the depth slider / centroid SQL so raster cutoff matches ≥ semantics
 * (raw float compare vs 8‑bit luminance often feels like strict >).
 */
function depthPassesMinFilterFt(depthDataFt, minDepthFt) {
    const minD = Math.max(0, Number(minDepthFt) || 0);
    if (minD <= 0) {
        return true;
    }
    const d = Math.max(0, Number(depthDataFt) || 0);
    const dQ = Math.round(d * 10) / 10;
    const minQ = Math.round(minD * 10) / 10;
    return dQ >= minQ;
}

/**
 * BW tiles: white = data min depth, black = data max (ArcGIS stretch).
 * `dataMinFt` / `dataMaxFt` come from the layer’s MapServer legend when available.
 */
function processBwFloodTileToBlue(imageData, minDepthFt, dataMinFt, dataMaxFt) {
    const data = imageData.data;
    const len = data.length;
    const minD = Math.max(0, Number(minDepthFt) || 0);
    const dMin = Number(dataMinFt);
    const dMax = Number(dataMaxFt);
    const rangeMin = Number.isFinite(dMin) ? dMin : FLOOD_RASTER_DATA_RANGE_FALLBACK_FT.minFt;
    const rangeMax = Number.isFinite(dMax) ? dMax : FLOOD_RASTER_DATA_RANGE_FALLBACK_FT.maxFt;
    const dataSpan = Math.max(1e-6, rangeMax - rangeMin);
    const colorCap = Math.max(1e-6, FLOOD_COLOR_DISPLAY_MAX_DEPTH_FT);
    const stops = getFloodRasterDisplayStops();

    for (let i = 0; i < len; i += 4) {
        if (data[i + 3] < 8) {
            continue;
        }
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const lum = (r + g + b) / 3;
        const depthNorm = (255 - lum) / 255;
        const depthDataFt = rangeMin + depthNorm * dataSpan;

        if (!depthPassesMinFilterFt(depthDataFt, minD)) {
            data[i + 3] = 0;
            continue;
        }

        const tColor = Math.min(1, depthDataFt / colorCap);
        const { r: nr, g: ng, b: nb } = floodDepthDisplayRgbFromNorm(tColor, stops);
        data[i] = nr;
        data[i + 1] = ng;
        data[i + 2] = nb;
    }
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

/**
 * MapServer `tileInfo.lods` often lists levels beyond what is cached (`minLOD` / `maxLOD`).
 * Without clipping, the view can request tiles that 404 (e.g. Clear Creek transported max 19 vs historic 20).
 */
function effectiveMapServerLODRange(meta) {
    const lods = meta?.tileInfo?.lods;
    if (!lods?.length) {
        return { min: 0, max: 0 };
    }
    const levels = lods.map((l) => l.level);
    const minFromLods = Math.min(...levels);
    const maxFromLods = Math.max(...levels);
    const min = Number.isFinite(meta.minLOD) ? meta.minLOD : minFromLods;
    const max = Number.isFinite(meta.maxLOD) ? meta.maxLOD : maxFromLods;
    return { min, max };
}

function clipTileInfoLods(tileInfo, minLOD, maxLOD) {
    if (!tileInfo?.lods?.length) {
        return tileInfo;
    }
    const minL = Number.isFinite(minLOD) ? minLOD : 0;
    const maxL = Number.isFinite(maxLOD) ? maxLOD : Math.max(...tileInfo.lods.map((lod) => lod.level));
    const lods = tileInfo.lods.filter((lod) => lod.level >= minL && lod.level <= maxL);
    if (lods.length === tileInfo.lods.length) {
        return tileInfo;
    }
    return { ...tileInfo, lods };
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
        tileRgbMode = "legendDepth",
        spatialReference,
        fullExtent,
        tileInfo,
        /** From MapServer legend stretch (ft); drives luminance → depth. */
        floodDataMinFt,
        floodDataMaxFt,
        ...layerOptions
    }) {
        super({
            spatialReference,
            fullExtent,
            tileInfo,
            ...layerOptions,
            maxScale: 0
        });
        this.tileServiceRoot = tileServiceRoot.replace(/\/$/, "");
        this.minDepthFt = minDepthFt ?? 0;
        this.floodScenarioId = floodScenarioId;
        this._legendDepthSamples = legendDepthSamples ?? [];
        this._tileRgbMode = tileRgbMode;
        this._coverageEnvelope = envelopeFromLayerExtent(fullExtent);
        this.floodDataMinFt = floodDataMinFt ?? FLOOD_RASTER_DATA_RANGE_FALLBACK_FT.minFt;
        this.floodDataMaxFt = floodDataMaxFt ?? FLOOD_RASTER_DATA_RANGE_FALLBACK_FT.maxFt;
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
                if (this._tileRgbMode === "bwBlue") {
                    const imageData = ctx.getImageData(0, 0, w, h);
                    processBwFloodTileToBlue(imageData, minDepth, this.floodDataMinFt, this.floodDataMaxFt);
                    ctx.putImageData(imageData, 0, 0);
                } else if (minDepth > 0 && legend.length > 0) {
                    const imageData = ctx.getImageData(0, 0, w, h);
                    const data = imageData.data;
                    const len = data.length;
                    for (let i = 0; i < len; i += 4) {
                        if (data[i + 3] < 8) {
                            continue;
                        }
                        const est = estimatedDepthFromLegendSamples(data[i], data[i + 1], data[i + 2], legend);
                        if (!depthPassesMinFilterFt(est, minDepth)) {
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

function depthFromBwSample(data, i, rangeMin, rangeMax) {
    const span = Math.max(1e-6, rangeMax - rangeMin);
    if (data[i + 3] < 8) {
        return rangeMin;
    }
    const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
    const depthNorm = (255 - lum) / 255;
    return rangeMin + depthNorm * span;
}

/**
 * Per-pixel transported − historic (ft); transparent where gain ≤ 0.
 * Uses the same color compression as single-scenario rasters (depth gain vs `FLOOD_COLOR_DISPLAY_MAX_DEPTH_FT`).
 */
function compositeBwDifferenceTile(minDepthFt, hMin, hMax, tMin, tMax, imageBitmapH, imageBitmapT) {
    const w = Math.min(imageBitmapH.width, imageBitmapT.width);
    const h = Math.min(imageBitmapH.height, imageBitmapT.height);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
        return canvas;
    }
    ctx.drawImage(imageBitmapH, 0, 0, w, h, 0, 0, w, h);
    const idH = ctx.getImageData(0, 0, w, h);
    ctx.drawImage(imageBitmapT, 0, 0, w, h, 0, 0, w, h);
    const idT = ctx.getImageData(0, 0, w, h);
    const out = ctx.createImageData(w, h);
    const dh = idH.data;
    const dt = idT.data;
    const o = out.data;
    const minD = Math.max(0, Number(minDepthFt) || 0);
    const colorCap = Math.max(1e-6, FLOOD_COLOR_DISPLAY_MAX_DEPTH_FT);
    const stops = getFloodRasterDisplayStops();
    for (let i = 0; i < o.length; i += 4) {
        const depthH = depthFromBwSample(dh, i, hMin, hMax);
        const depthT = depthFromBwSample(dt, i, tMin, tMax);
        const diffFt = depthT - depthH;
        if (diffFt <= 0) {
            o[i + 3] = 0;
            continue;
        }
        if (!depthPassesMinFilterFt(diffFt, minD)) {
            o[i + 3] = 0;
            continue;
        }
        const tColor = Math.min(1, diffFt / colorCap);
        const { r: nr, g: ng, b: nb } = floodDepthDisplayRgbFromNorm(tColor, stops);
        o[i] = nr;
        o[i + 1] = ng;
        o[i + 2] = nb;
        o[i + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
    return canvas;
}

class DifferenceFloodTileLayer extends BaseTileLayer {
    constructor({
        historicTileRoot,
        transportedTileRoot,
        floodScenarioId,
        minDepthFt,
        spatialReference,
        fullExtent,
        tileInfo,
        floodHistoricMinFt,
        floodHistoricMaxFt,
        floodTransportedMinFt,
        floodTransportedMaxFt,
        ...layerOptions
    }) {
        super({
            spatialReference,
            fullExtent,
            tileInfo,
            ...layerOptions,
            maxScale: 0
        });
        this._hRoot = historicTileRoot.replace(/\/$/, "");
        this._tRoot = transportedTileRoot.replace(/\/$/, "");
        this.minDepthFt = minDepthFt ?? 0;
        this.floodScenarioId = floodScenarioId;
        this._coverageEnvelope = envelopeFromLayerExtent(fullExtent);
        this._hMin = Number.isFinite(floodHistoricMinFt) ? floodHistoricMinFt : FLOOD_RASTER_DATA_RANGE_FALLBACK_FT.minFt;
        this._hMax = Number.isFinite(floodHistoricMaxFt) ? floodHistoricMaxFt : FLOOD_RASTER_DATA_RANGE_FALLBACK_FT.maxFt;
        this._tMin = Number.isFinite(floodTransportedMinFt) ? floodTransportedMinFt : FLOOD_RASTER_DATA_RANGE_FALLBACK_FT.minFt;
        this._tMax = Number.isFinite(floodTransportedMaxFt) ? floodTransportedMaxFt : FLOOD_RASTER_DATA_RANGE_FALLBACK_FT.maxFt;
    }

    getEmptyTileCanvas() {
        const size = this.tileInfo?.rows || 256;
        const c = document.createElement("canvas");
        c.width = size;
        c.height = size;
        return c;
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
        const hUrl = `${this._hRoot}/tile/${level}/${row}/${col}`;
        const tUrl = `${this._tRoot}/tile/${level}/${row}/${col}`;
        const signal = options?.signal;
        return Promise.all([
            fetch(hUrl, { signal }).then((r) => (r.ok ? r.blob() : null)),
            fetch(tUrl, { signal }).then((r) => (r.ok ? r.blob() : null))
        ])
            .then((blobs) => {
                if (!blobs[0] || !blobs[1]) {
                    return null;
                }
                return Promise.all([createImageBitmap(blobs[0]), createImageBitmap(blobs[1])]);
            })
            .then((bitmaps) => {
                if (!bitmaps) {
                    return this.getEmptyTileCanvas();
                }
                const [bmH, bmT] = bitmaps;
                try {
                    return compositeBwDifferenceTile(
                        this.minDepthFt ?? 0,
                        this._hMin,
                        this._hMax,
                        this._tMin,
                        this._tMax,
                        bmH,
                        bmT
                    );
                } finally {
                    bmH.close?.();
                    bmT.close?.();
                }
            })
            .catch(() => this.getEmptyTileCanvas());
    }
}

async function loadWatershedLayerPack(def) {
    const hUrl = def.historicTileUrl.replace(/\/$/, "");
    const tUrl = def.transportedTileUrl.replace(/\/$/, "");
    const [metaH, metaT, legH, legT] = await Promise.all([
        fetch(`${hUrl}?f=json`).then((r) => r.json()),
        fetch(`${tUrl}?f=json`).then((r) => r.json()),
        fetch(`${hUrl}/legend?f=json`).then((r) => r.json()),
        fetch(`${tUrl}/legend?f=json`).then((r) => r.json())
    ]);
    const rangeH = resolveFloodRasterDataRangeFt(legH, 0);
    const rangeT = resolveFloodRasterDataRangeFt(legT, 0);
    const depthFilterMaxFt = Math.max(
        1,
        Math.ceil(Math.max(rangeH.maxFt, rangeT.maxFt, 1) * 10) / 10
    );
    const hLod = effectiveMapServerLODRange(metaH);
    const tLod = effectiveMapServerLODRange(metaT);
    const historicTileInfo = clipTileInfoLods(metaH.tileInfo, hLod.min, hLod.max);
    const transportedTileInfo = clipTileInfoLods(metaT.tileInfo, tLod.min, tLod.max);
    const diffMin = Math.max(hLod.min, tLod.min);
    const diffMax = Math.min(hLod.max, tLod.max);
    const differenceTileInfo = clipTileInfoLods(metaH.tileInfo, diffMin, diffMax);
    const historic = new DepthFilterFloodTileLayer({
        tileServiceRoot: hUrl,
        floodScenarioId: "historic",
        minDepthFt: 0,
        legendDepthSamples: [],
        tileRgbMode: "bwBlue",
        spatialReference: metaH.spatialReference,
        fullExtent: metaH.fullExtent,
        tileInfo: historicTileInfo,
        floodDataMinFt: rangeH.minFt,
        floodDataMaxFt: rangeH.maxFt,
        opacity: 0.7,
        visible: false
    });
    const transported = new DepthFilterFloodTileLayer({
        tileServiceRoot: tUrl,
        floodScenarioId: "transported",
        minDepthFt: 0,
        legendDepthSamples: [],
        tileRgbMode: "bwBlue",
        spatialReference: metaT.spatialReference,
        fullExtent: metaT.fullExtent,
        tileInfo: transportedTileInfo,
        floodDataMinFt: rangeT.minFt,
        floodDataMaxFt: rangeT.maxFt,
        opacity: 0.7,
        visible: false
    });
    const difference = new DifferenceFloodTileLayer({
        historicTileRoot: hUrl,
        transportedTileRoot: tUrl,
        floodScenarioId: "difference",
        minDepthFt: 0,
        spatialReference: metaH.spatialReference,
        fullExtent: metaH.fullExtent,
        tileInfo: differenceTileInfo,
        floodHistoricMinFt: rangeH.minFt,
        floodHistoricMaxFt: rangeH.maxFt,
        floodTransportedMinFt: rangeT.minFt,
        floodTransportedMaxFt: rangeT.maxFt,
        opacity: 0.7,
        visible: false
    });
    const centroids = new FeatureLayer({
        url: def.centroidUrl,
        renderer: createCentroidRenderer(def.historicField),
        visible: false,
        popupEnabled: false,
        outFields: ["FID", def.historicField, def.transportedField]
    });
    const fe = metaH.fullExtent;
    const fullExtentGeom =
        fe != null
            ? new Extent({
                  xmin: fe.xmin,
                  ymin: fe.ymin,
                  xmax: fe.xmax,
                  ymax: fe.ymax,
                  spatialReference: fe.spatialReference || metaH.spatialReference
              })
            : null;

    let homeGoTo;
    if (def.homeCenter != null && def.homeZoom != null) {
        homeGoTo = {
            center: [def.homeCenter.longitude, def.homeCenter.latitude],
            zoom: def.homeZoom
        };
    } else if (fullExtentGeom != null && def.homeZoom != null) {
        // No explicit homeCenter: center on raster extent but honor homeZoom (e.g. Hunting Bayou).
        homeGoTo = {
            target: fullExtentGeom.center,
            zoom: def.homeZoom
        };
    } else if (fullExtentGeom != null) {
        homeGoTo = { target: fullExtentGeom };
    } else {
        const fallback = WATERSHED_DEFS["clear-creek"].homeCenter;
        homeGoTo = {
            center: [fallback.longitude, fallback.latitude],
            zoom: WATERSHED_DEFS["clear-creek"].homeZoom
        };
    }
    return {
        def,
        historic,
        transported,
        difference,
        centroids,
        depthFilterMaxFt,
        homeGoTo
    };
}

const [clearCreekPack, huntingBayouPack] = await Promise.all([
    loadWatershedLayerPack(WATERSHED_DEFS["clear-creek"]),
    loadWatershedLayerPack(WATERSHED_DEFS["hunting-bayou"])
]);

const watershedLayerSets = {
    "clear-creek": clearCreekPack,
    "hunting-bayou": huntingBayouPack
};

let currentWatershedId = "clear-creek";

/** Active historic / transported / centroids (reassigned on watershed change). */
let overlayLayers = {
    historic: clearCreekPack.historic,
    transported: clearCreekPack.transported,
    difference: clearCreekPack.difference,
    centroids: clearCreekPack.centroids
};

const ccHome = WATERSHED_DEFS["clear-creek"].homeCenter;
const map = new ArcGISMap({
    basemap: createBasemap("cartodb-positron"),
    layers: [
        clearCreekPack.historic,
        clearCreekPack.transported,
        clearCreekPack.difference,
        clearCreekPack.centroids,
        huntingBayouPack.historic,
        huntingBayouPack.transported,
        huntingBayouPack.difference,
        huntingBayouPack.centroids
    ]
});

const view = new MapView({
    container: "viewDiv",
    map,
    center: [ccHome.longitude, ccHome.latitude],
    zoom: WATERSHED_DEFS["clear-creek"].homeZoom,
    // Default snapToZoom rounds zoom to integer LODs; false allows 13.5, 14.5, etc. for goTo / homeZoom.
    constraints: {
        snapToZoom: false
    }
});

await view.when();

/** Client-side attribute filter (avoids server round-trips on each depth change). */
let centroidsLayerView = null;

function rebindCentroidsLayerView() {
    centroidsLayerView = null;
    void view.whenLayerView(overlayLayers.centroids).then((lv) => {
        centroidsLayerView = lv;
        syncCentroidsLayerViewFilter();
    });
}

rebindCentroidsLayerView();

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

function formatDepthGainFt(historicVal, transportedVal) {
    const h = Number(historicVal);
    const t = Number(transportedVal);
    if (!Number.isFinite(h) || !Number.isFinite(t)) {
        return "—";
    }
    if (historicVal === -9999 || transportedVal === -9999) {
        return "—";
    }
    return `${(t - h).toFixed(1)} ft`;
}

function buildHomesHoverContent(historic, transportedDepth, scenario) {
    const gainRow =
        scenario === "difference"
            ? `
        <div class="homes-hover-popup__row">
            <span class="homes-hover-popup__label">Depth gain (T − H)</span>
            <span class="homes-hover-popup__value">${formatDepthGainFt(historic, transportedDepth)}</span>
        </div>`
            : "";
    return `
        <div class="homes-hover-popup__title">Flood depth</div>
        <div class="homes-hover-popup__row">
            <span class="homes-hover-popup__label">Historic Flood</span>
            <span class="homes-hover-popup__value">${formatDepthFt(historic)}</span>
        </div>
        <div class="homes-hover-popup__row">
            <span class="homes-hover-popup__label">Transported Flood</span>
            <span class="homes-hover-popup__value">${formatDepthFt(transportedDepth)}</span>
        </div>${gainRow}`;
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
    const wdef = WATERSHED_DEFS[currentWatershedId];
    const historic = attrs?.[wdef.historicField];
    const transportedDepth = attrs?.[wdef.transportedField];
    homesHoverPopup.innerHTML = buildHomesHoverContent(historic, transportedDepth, currentFloodLayer);
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
const floodRampDropdown = document.getElementById("flood-ramp-dropdown");
const scenarioButtons = document.querySelectorAll(".scenario-btn");
const scenarioHint = document.getElementById("scenario-hint");
const centroidsToggle = document.getElementById("centroids-toggle");
const homesPointLegend = document.getElementById("homes-point-legend");
const homesFloodedStat = document.getElementById("homes-flooded-stat");
const homesFloodedCountEl = document.getElementById("homes-flooded-count");
const opacitySlider = document.getElementById("opacity-slider");
const opacityValue = document.getElementById("opacity-value");
const depthFilterSlider = document.getElementById("depth-filter-slider");
const depthFilterValue = document.getElementById("depth-filter-value");
const controlsToggle = document.getElementById("controls-toggle");
const controlsContent = document.getElementById("controls-content");

/** Depth filter UI / raster / query use 0.1 ft steps (avoids range float noise). */
function quantizeDepthFilterFt(x) {
    const n = Math.max(0, Number(x) || 0);
    return Math.round(n * 10) / 10;
}

function getFloodMinDepthFt() {
    return quantizeDepthFilterFt(overlayLayers?.historic?.minDepthFt);
}

function formatDepthFilterReadout(minFt) {
    const v = quantizeDepthFilterFt(minFt);
    if (v <= 0) {
        return "Any depth";
    }
    return `≥ ${v.toFixed(1)} ft`;
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
    const v = quantizeDepthFilterFt(minFt);
    const wdef = WATERSHED_DEFS[currentWatershedId];
    if (currentFloodLayer === "difference") {
        homesFloodedStat.title =
            v <= 0
                ? "Homes not flooded in Historic (≤ 0 ft or −9999) but flooded in Transported (> 0 ft); transported depth ≥ 0 ft."
                : `Same pattern with transported depth ≥ ${v.toFixed(1)} ft (matches depth filter).`;
        return;
    }
    const fieldLabel = currentCentroidField === wdef.transportedField ? "Transported" : "Historic";
    homesFloodedStat.title =
        v <= 0
            ? `Server count for ${fieldLabel}: depth ≥ 0 ft, excluding −9999.`
            : `Server count for ${fieldLabel}: depth ≥ ${v.toFixed(1)} ft (same floor as the depth-filtered raster), excluding −9999.`;
}

/** Same SQL as the homes layer filter and depth-filtered point display. */
function buildCentroidDepthWhereClause() {
    const wdef = WATERSHED_DEFS[currentWatershedId];
    const minFt = getFloodMinDepthFt();
    if (currentFloodLayer === "difference") {
        const hf = wdef.historicField;
        const tf = wdef.transportedField;
        const dryHistoric = `(${hf} <= 0 OR ${hf} = -9999)`;
        const wetTransported = `${tf} > 0 AND ${tf} <> -9999`;
        const tMin = minFt <= 0 ? "" : ` AND ${tf} >= ${minFt}`;
        return `${dryHistoric} AND ${wetTransported}${tMin}`;
    }
    const field = currentCentroidField;
    if (field !== wdef.historicField && field !== wdef.transportedField) {
        return null;
    }
    const depthPredicate = minFt <= 0 ? `${field} >= 0` : `${field} >= ${minFt}`;
    return `${depthPredicate} AND ${field} <> -9999`;
}

function syncCentroidsLayerViewFilter() {
    if (!centroidsLayerView) {
        return;
    }
    const clause = buildCentroidDepthWhereClause();
    centroidsLayerView.filter = clause ? new FeatureFilter({ where: clause }) : null;
}

/** Counts homes with depth ≥ min depth filter (same floor as the raster); excludes −9999. */
async function refreshFloodedHomesCount() {
    if (!homesFloodedCountEl || !overlayLayers?.centroids) {
        return;
    }
    const where = buildCentroidDepthWhereClause();
    if (!where) {
        return;
    }

    const minFt = getFloodMinDepthFt();
    syncHomesFloodedStatTitle(minFt);

    homesFloodedCountEl.classList.add("homes-flooded-stat__value--pending");
    if (homesFloodedStat) {
        homesFloodedStat.setAttribute("aria-busy", "true");
    }

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
        } else if (selectedRaster === "transported") {
            scenarioHint.textContent = "Showing: Transported Tax Day 2016.";
            scenarioHint.title =
                "Depths as if the April 2016 Tax Day flood were placed on this landscape. Contrast with Historic to see the difference from typical risk.";
        } else {
            scenarioHint.textContent = "Showing: Difference (transported − historic).";
            scenarioHint.title =
                "Raster shows depth gained (transported minus historic) where that gain is positive. Homes: dry in Historic but flooded in Transported. Depth filter applies to transported depth and to positive gain on the raster.";
        }
    }
}

function syncAllWatershedLayerVisibility() {
    const homesOn = centroidsToggle?.getAttribute("aria-checked") === "true";
    for (const id of Object.keys(watershedLayerSets)) {
        const pack = watershedLayerSets[id];
        const active = id === currentWatershedId;
        if (!active) {
            pack.historic.visible = false;
            pack.transported.visible = false;
            if (pack.difference) {
                pack.difference.visible = false;
            }
            pack.centroids.visible = false;
        } else {
            pack.historic.visible = currentFloodLayer === "historic";
            pack.transported.visible = currentFloodLayer === "transported";
            if (pack.difference) {
                pack.difference.visible = currentFloodLayer === "difference";
            }
            pack.centroids.visible = !!homesOn;
        }
    }
}

function applyCentroidsRendererForCurrentScenario() {
    const wdef = WATERSHED_DEFS[currentWatershedId];
    if (currentFloodLayer === "difference") {
        overlayLayers.centroids.renderer = createDifferenceCentroidSimpleRenderer();
    } else {
        overlayLayers.centroids.renderer = createCentroidRenderer(currentCentroidField);
    }
}

function applyRasterScenario(selectedRaster) {
    currentFloodLayer = selectedRaster;

    const wdef = WATERSHED_DEFS[currentWatershedId];
    if (selectedRaster === "historic") {
        currentCentroidField = wdef.historicField;
    } else if (selectedRaster === "transported") {
        currentCentroidField = wdef.transportedField;
    } else {
        currentCentroidField = wdef.transportedField;
    }

    syncAllWatershedLayerVisibility();

    updateScenarioUI(selectedRaster);
    syncFloodLegendForScenario(selectedRaster);

    const homesOn = centroidsToggle.getAttribute("aria-checked") === "true";
    if (homesOn) {
        applyCentroidsRendererForCurrentScenario();
    }
    syncCentroidsLayerViewFilter();
    void refreshFloodedHomesCount();
    refreshFloodRasterTiles();
}

function refreshFloodRasterTiles() {
    for (const id of Object.keys(watershedLayerSets)) {
        const pack = watershedLayerSets[id];
        pack.historic.refresh?.();
        pack.transported.refresh?.();
        pack.difference?.refresh?.();
    }
}

function applyFloodRasterRamp(rampId) {
    if (!FLOOD_RASTER_RAMPS[rampId]) {
        return;
    }
    currentFloodRasterRampId = rampId;
    if (floodRampDropdown) {
        floodRampDropdown.value = rampId;
    }
    refreshFloodRasterTiles();
    syncFloodLegendSwatches();
}

basemapDropdown.addEventListener("change", (event) => {
    map.basemap = createBasemap(event.target.value);
});

if (floodRampDropdown) {
    floodRampDropdown.addEventListener("change", (event) => {
        applyFloodRasterRamp(event.target.value);
    });
    floodRampDropdown.value = currentFloodRasterRampId;
}
syncFloodLegendSwatches();

scenarioButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
        applyRasterScenario(btn.dataset.scenario);
    });
});

applyRasterScenario("historic");

function setHomesEnabled(on) {
    centroidsToggle.setAttribute("aria-checked", String(on));
    centroidsToggle.classList.toggle("is-active", on);
    if (homesPointLegend) {
        homesPointLegend.hidden = !on;
    }
    if (!on) {
        cancelHomesHoverPoll();
        hideHomesHoverPopup();
        if (view?.container) {
            view.container.style.cursor = "";
        }
    }
    syncAllWatershedLayerVisibility();
    if (on) {
        applyCentroidsRendererForCurrentScenario();
        syncCentroidsLayerViewFilter();
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

syncAboutComparisonNarrative(currentWatershedId);
queueMicrotask(() => flashAboutComparisonSummaryOutline());

function applyFloodOpacityFromSlider() {
    if (!opacitySlider || !overlayLayers?.historic || !overlayLayers?.transported || !overlayLayers?.difference) {
        return;
    }
    const transparency = Number.parseInt(opacitySlider.value, 10);
    if (!Number.isFinite(transparency)) {
        return;
    }
    const opacity = (100 - transparency) / 100;
    overlayLayers.historic.opacity = opacity;
    overlayLayers.transported.opacity = opacity;
    overlayLayers.difference.opacity = opacity;
    if (opacityValue) {
        opacityValue.textContent = `${100 - transparency}%`;
    }
}

if (opacitySlider) {
    opacitySlider.addEventListener("input", () => applyFloodOpacityFromSlider());
    applyFloodOpacityFromSlider();
    queueMicrotask(() => applyFloodOpacityFromSlider());
}

function getActiveDepthFilterMaxFt() {
    return watershedLayerSets[currentWatershedId]?.depthFilterMaxFt ?? 10;
}

function applyFloodMinDepthFt(minFt) {
    const maxFt = getActiveDepthFilterMaxFt();
    const v = Math.min(quantizeDepthFilterFt(minFt), maxFt);
    overlayLayers.historic.minDepthFt = v;
    overlayLayers.transported.minDepthFt = v;
    overlayLayers.difference.minDepthFt = v;
    if (depthFilterSlider) {
        depthFilterSlider.value = String(v);
    }
    syncDepthFilterReadout(v);
    syncCentroidsLayerViewFilter();
    void refreshFloodedHomesCount();
    if (currentFloodLayer === "historic") {
        overlayLayers.historic.refresh();
    } else if (currentFloodLayer === "transported") {
        overlayLayers.transported.refresh();
    } else {
        overlayLayers.difference?.refresh?.();
    }
}

if (depthFilterSlider && depthFilterValue) {
    depthFilterSlider.addEventListener("input", (event) => {
        const maxFt = getActiveDepthFilterMaxFt();
        const raw = quantizeDepthFilterFt(event.target.value);
        const v = Math.min(raw, maxFt);
        applyFloodMinDepthFt(v);
    });
    syncDepthFilterReadout(quantizeDepthFilterFt(depthFilterSlider.value));
}

function defaultWatershedUiState() {
    return {
        scenario: "historic",
        opacityTransparency: 30,
        depthFilterFt: 0,
        homesVisible: true
    };
}

const watershedUiState = {
    "clear-creek": defaultWatershedUiState(),
    "hunting-bayou": defaultWatershedUiState()
};

function captureWatershedUiState(wsId) {
    watershedUiState[wsId] = {
        scenario: currentFloodLayer,
        opacityTransparency: Number.parseInt(opacitySlider?.value ?? "30", 10),
        depthFilterFt: quantizeDepthFilterFt(depthFilterSlider?.value ?? 0),
        homesVisible: centroidsToggle?.getAttribute("aria-checked") === "true"
    };
}

function applyWatershedUiState(wsId) {
    const s = watershedUiState[wsId];
    const pack = watershedLayerSets[wsId];
    if (depthFilterSlider) {
        depthFilterSlider.max = String(pack.depthFilterMaxFt);
    }
    if (floodRampDropdown) {
        floodRampDropdown.value = currentFloodRasterRampId;
    }
    if (opacitySlider) {
        opacitySlider.value = String(Number.isFinite(s.opacityTransparency) ? s.opacityTransparency : 30);
    }
    const maxD = pack.depthFilterMaxFt;
    const d = Math.min(quantizeDepthFilterFt(s.depthFilterFt), maxD);
    if (depthFilterSlider) {
        depthFilterSlider.value = String(d);
    }
    syncDepthFilterReadout(d);

    centroidsToggle?.setAttribute("aria-checked", String(s.homesVisible));
    centroidsToggle?.classList.toggle("is-active", s.homesVisible);
    if (homesPointLegend) {
        homesPointLegend.hidden = !s.homesVisible;
    }

    applyRasterScenario(s.scenario);
    applyFloodOpacityFromSlider();
    applyFloodMinDepthFt(d);
    syncFloodLegendSwatches();
}

function updateWatershedPickerUi() {
    document.querySelectorAll("[data-watershed]").forEach((btn) => {
        const active = btn.dataset.watershed === currentWatershedId;
        btn.classList.toggle("is-active", active);
        btn.setAttribute("aria-pressed", String(active));
    });
}

function syncAboutComparisonNarrative(wsId) {
    const def = WATERSHED_DEFS[wsId];
    if (!def) {
        return;
    }
    const lede = document.getElementById("about-comparison-lede");
    const liH = document.getElementById("about-comparison-historic");
    const liT = document.getElementById("about-comparison-transported");
    if (lede && def.aboutLede != null) {
        lede.textContent = def.aboutLede;
    }
    if (liH && def.aboutHistoricHtml != null) {
        liH.innerHTML = def.aboutHistoricHtml;
    }
    if (liT && def.aboutTransportedHtml != null) {
        liT.innerHTML = def.aboutTransportedHtml;
    }
    const liD = document.getElementById("about-comparison-difference");
    if (liD) {
        liD.innerHTML = ABOUT_COMPARISON_DIFFERENCE_HTML;
    }
}

/** Draws attention to the collapsed About panel on first load (two outline pulses). */
function flashAboutComparisonSummaryOutline() {
    const summary = document.getElementById("about-comparison-summary");
    if (!summary) {
        return;
    }
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
    }
    const done = () => {
        summary.classList.remove("panel-details-summary--attention");
        summary.removeEventListener("animationend", done);
    };
    summary.addEventListener("animationend", done);
    requestAnimationFrame(() => {
        summary.classList.add("panel-details-summary--attention");
    });
}

async function switchWatershed(newId) {
    if (newId === currentWatershedId || !watershedLayerSets[newId]) {
        return;
    }
    captureWatershedUiState(currentWatershedId);
    currentWatershedId = newId;
    overlayLayers = {
        historic: watershedLayerSets[newId].historic,
        transported: watershedLayerSets[newId].transported,
        difference: watershedLayerSets[newId].difference,
        centroids: watershedLayerSets[newId].centroids
    };
    applyWatershedUiState(newId);
    refreshFloodRasterTiles();
    rebindCentroidsLayerView();
    updateWatershedPickerUi();
    syncAboutComparisonNarrative(newId);
    window.overlayLayers = overlayLayers;
    window.currentWatershedId = newId;

    const pack = watershedLayerSets[newId];
    try {
        await view.goTo(pack.homeGoTo, { duration: 1100 });
    } catch {
        /* ignore goTo abort */
    }
    const homeEl = document.getElementById("arcgis-home-widget");
    if (homeEl && typeof view.viewpoint?.clone === "function") {
        homeEl.viewpoint = view.viewpoint.clone();
    }
}

document.querySelectorAll("[data-watershed]").forEach((btn) => {
    btn.addEventListener("click", () => {
        void switchWatershed(btn.dataset.watershed);
    });
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
    const gap = 6;
    const mapWrap = document.querySelector(".map-view-wrap");
    const boundToMap = wrap.classList.contains("tip-wrap--map-bounded");

    let maxW = wrap.classList.contains("tip-wrap--wide") ? 380 : 252;
    if (boundToMap && mapWrap) {
        const mr = mapWrap.getBoundingClientRect();
        maxW = Math.min(maxW, Math.max(160, mr.width - 2 * margin));
    }
    const w = Math.min(maxW, window.innerWidth - 2 * margin);

    let minLeft = margin;
    let maxLeft = window.innerWidth - margin - w;
    let minTop = margin;
    let maxBottom = window.innerHeight - margin;

    if (boundToMap && mapWrap) {
        const mr = mapWrap.getBoundingClientRect();
        minLeft = mr.left + margin;
        maxLeft = mr.right - margin - w;
        minTop = mr.top + margin;
        maxBottom = mr.bottom - margin;
    }

    if (maxLeft < minLeft) {
        maxLeft = minLeft;
    }

    let left = br.right - w;
    left = Math.max(minLeft, Math.min(left, maxLeft));

    bubble.style.width = `${w}px`;
    if (boundToMap) {
        const vertAvail = Math.max(120, maxBottom - minTop - gap);
        bubble.style.maxHeight = `${Math.min(560, vertAvail)}px`;
    } else {
        bubble.style.maxHeight = "";
    }

    let top = br.bottom + gap;
    bubble.style.left = `${left}px`;
    bubble.style.top = `${top}px`;
    let h = bubble.offsetHeight;

    if (top + h > maxBottom) {
        top = br.top - h - gap;
    }
    top = Math.max(minTop, Math.min(top, maxBottom - h));
    if (top < minTop) {
        top = minTop;
    }
    bubble.style.top = `${top}px`;
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
window.currentWatershedId = currentWatershedId;
window.getFloodColor = getFloodColor;

console.log("ArcGIS JavaScript API v5 map initialized for Houston, Texas");
