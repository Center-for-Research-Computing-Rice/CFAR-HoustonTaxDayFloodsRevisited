import { appState } from "../appState.js";
import { WATERSHED_DEFS } from "../config/watersheds.js";
import { refs } from "../refs.js";

/** Flooded-home count and point filter use at least this depth (ft); raster can go lower when depth filter is 0. */
export const MIN_HOME_FLOOD_DEPTH_FT = 0.05;

/** Depth filter UI / raster / query use 0.1 ft steps (avoids range float noise). */
export function quantizeDepthFilterFt(x) {
    const n = Math.max(0, Number(x) || 0);
    return Math.round(n * 10) / 10;
}

/** Same value on all flood layers after `applyFloodMinDepthFt`; prefer the active scenario layer for clarity. */
export function getFloodMinDepthFt() {
    const o = refs.overlayLayers;
    if (!o) {
        return quantizeDepthFilterFt(0);
    }
    const lid = appState.currentFloodLayer;
    const layer = lid === "historic" ? o.historic : lid === "transported" ? o.transported : o.difference;
    return quantizeDepthFilterFt(layer?.minDepthFt);
}

/**
 * WHERE clause for centroid count / map filter. Keys off `floodLayer` and uses the same `minDepthFt` as the raster.
 * - Historic / Transported: depth in the active scenario field ≥ max(0.05 ft, filter).
 * - Difference: same **gain** (transported − historic) rule as `compositeBwDifferenceTile` — not transported depth alone.
 */
export function buildCentroidDepthWhereSql({ floodLayer, wdef, minDepthFt }) {
    const hf = wdef.historicField;
    const tf = wdef.transportedField;
    const minQ = quantizeDepthFilterFt(minDepthFt);

    if (floodLayer === "difference") {
        /**
         * Client-side FeatureLayerView2D SQL can throw `sql-runtime-error` on parenthesized
         * `(tf - hf)` expressions. Use equivalent comparisons instead:
         *   gain > 0  ⇔  tf > hf
         *   gain ≥ m  ⇔  tf ≥ hf + m
         */
        const dryHistoric = `(${hf} <= 0 OR ${hf} = -9999)`;
        const tfValid = `${tf} <> -9999`;
        if (minQ <= 0) {
            return `${dryHistoric} AND ${tfValid} AND (${tf} > ${hf})`;
        }
        return `${dryHistoric} AND ${tfValid} AND (${tf} >= (${hf} + ${minQ}))`;
    }

    const field = floodLayer === "historic" ? hf : tf;
    const effFt = Math.max(MIN_HOME_FLOOD_DEPTH_FT, minQ);
    return `${field} >= ${effFt} AND ${field} <> -9999`;
}

export function formatDepthFilterReadout(minFt) {
    const v = quantizeDepthFilterFt(minFt);
    if (v <= 0) {
        return "Any depth";
    }
    return `≥ ${v.toFixed(1)} ft`;
}

export function syncDepthFilterReadout(minFt, depthFilterValueEl) {
    if (depthFilterValueEl) {
        depthFilterValueEl.textContent = formatDepthFilterReadout(minFt);
    }
}

export function syncHomesFloodedStatTitle(minFt, homesFloodedStatEl) {
    if (!homesFloodedStatEl) {
        return;
    }
    const v = quantizeDepthFilterFt(minFt);
    const countFloor = Math.max(MIN_HOME_FLOOD_DEPTH_FT, v);
    const wdef = WATERSHED_DEFS[appState.currentWatershedId];
    if (appState.currentFloodLayer === "difference") {
        homesFloodedStatEl.title =
            v <= 0
                ? `Homes dry in Historic (≤ 0 ft or −9999) with positive depth gain (transported − historic); matches difference raster (any gain > 0).`
                : `Same homes with depth gain ≥ ${countFloor.toFixed(1)} ft (matches difference raster filter on gain).`;
        return;
    }
    const fieldLabel = appState.currentCentroidField === wdef.transportedField ? "Transported" : "Historic";
    homesFloodedStatEl.title =
        v <= 0
            ? `Server count for ${fieldLabel}: depth ≥ ${countFloor.toFixed(1)} ft, excluding −9999.`
            : `Server count for ${fieldLabel}: depth ≥ ${countFloor.toFixed(1)} ft (same floor as the depth-filtered raster), excluding −9999.`;
}

/** Same SQL as the homes layer filter and depth-filtered point display. */
export function buildCentroidDepthWhereClause() {
    const wdef = WATERSHED_DEFS[appState.currentWatershedId];
    if (!wdef) {
        return null;
    }
    const minFt = getFloodMinDepthFt();
    return buildCentroidDepthWhereSql({
        floodLayer: appState.currentFloodLayer,
        wdef,
        minDepthFt: minFt
    });
}
