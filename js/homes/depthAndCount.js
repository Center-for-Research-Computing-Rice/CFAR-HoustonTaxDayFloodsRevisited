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
    return quantizeDepthFilterFt(refs.overlayLayers?.historic?.minDepthFt);
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
                ? `Homes not flooded in Historic (≤ 0 ft or −9999) but flooded in Transported at ≥ ${MIN_HOME_FLOOD_DEPTH_FT} ft; count uses transported depth ≥ ${countFloor.toFixed(1)} ft.`
                : `Same pattern with transported depth ≥ ${countFloor.toFixed(1)} ft (matches depth filter).`;
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
    const minFt = getFloodMinDepthFt();
    const effFt = Math.max(MIN_HOME_FLOOD_DEPTH_FT, minFt);
    if (appState.currentFloodLayer === "difference") {
        const hf = wdef.historicField;
        const tf = wdef.transportedField;
        const dryHistoric = `(${hf} <= 0 OR ${hf} = -9999)`;
        const wetTransported = `${tf} >= ${effFt} AND ${tf} <> -9999`;
        return `${dryHistoric} AND ${wetTransported}`;
    }
    const field = appState.currentCentroidField;
    if (field !== wdef.historicField && field !== wdef.transportedField) {
        return null;
    }
    const depthPredicate = `${field} >= ${effFt}`;
    return `${depthPredicate} AND ${field} <> -9999`;
}
