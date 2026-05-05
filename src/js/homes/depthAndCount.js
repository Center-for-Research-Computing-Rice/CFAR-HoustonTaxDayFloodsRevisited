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

export function getFloodMinDepthFt() {
    const o = refs.overlayLayers;
    const layer =
        appState.currentFloodLayer === "difference"
            ? o?.difference
            : appState.currentFloodLayer === "transported"
              ? o?.transported
              : o?.historic;
    return quantizeDepthFilterFt(layer?.minDepthFt ?? o?.historic?.minDepthFt);
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
            `Net affected homes: count with transported depth ≥ ${countFloor.toFixed(1)} ft minus count with historic depth ≥ ${countFloor.toFixed(1)} ft (same threshold; −9999 excluded).`;
        return;
    }
    const fieldLabel = appState.currentCentroidField === wdef.transportedField ? "Transported" : "Historic";
    homesFloodedStatEl.title =
        v <= 0
            ? `Server count for ${fieldLabel}: depth ≥ ${countFloor.toFixed(1)} ft, excluding −9999.`
            : `Server count for ${fieldLabel}: depth ≥ ${countFloor.toFixed(1)} ft (same floor as the depth-filtered raster), excluding −9999.`;
}

/** One scenario column at the active depth threshold (for difference net = transported count − historic count). */
export function buildSingleScenarioDepthWhereClause(fieldName) {
    const minFt = getFloodMinDepthFt();
    const effFt = Math.max(MIN_HOME_FLOOD_DEPTH_FT, minFt);
    return `${fieldName} >= ${effFt} AND ${fieldName} <> -9999`;
}

/** Same SQL as the homes layer filter and depth-filtered point display. */
export function buildCentroidDepthWhereClause() {
    const wdef = WATERSHED_DEFS[appState.currentWatershedId];
    if (appState.currentFloodLayer === "difference") {
        return buildSingleScenarioDepthWhereClause(wdef.transportedField);
    }
    const minFt = getFloodMinDepthFt();
    const effFt = Math.max(MIN_HOME_FLOOD_DEPTH_FT, minFt);
    const field = appState.currentCentroidField;
    if (field !== wdef.historicField && field !== wdef.transportedField) {
        return null;
    }
    const depthPredicate = `${field} >= ${effFt}`;
    return `${depthPredicate} AND ${field} <> -9999`;
}
