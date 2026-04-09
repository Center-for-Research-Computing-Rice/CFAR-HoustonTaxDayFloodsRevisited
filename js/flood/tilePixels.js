import { FLOOD_RASTER_DATA_RANGE_FALLBACK_FT } from "./dataRange.js";
import {
    FLOOD_COLOR_DISPLAY_MAX_DEPTH_FT,
    floodDepthDisplayRgbFromNorm,
    getFloodRasterDisplayStops
} from "./colorRamp.js";

/** Reject tile RGB this far from the legend ramp (JPEG / nodata / basemap bleed). */
const FLOOD_LEGEND_MATCH_MAX_DIST2 = 22000;

/**
 * Depth (ft) from RGB vs legend ramp — O(samples) per pixel (two best matches + small IDW), no sort.
 */
export function estimatedDepthFromLegendSamples(r, g, b, samples) {
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
export function depthPassesMinFilterFt(depthDataFt, minDepthFt) {
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
 */
export function processBwFloodTileToBlue(imageData, minDepthFt, dataMinFt, dataMaxFt) {
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

export function depthFromBwSample(data, i, rangeMin, rangeMax) {
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
 */
export function compositeBwDifferenceTile(minDepthFt, hMin, hMax, tMin, tMax, imageBitmapH, imageBitmapT) {
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
