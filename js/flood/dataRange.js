/**
 * When `.../MapServer/legend?f=json` has no parseable stretch label, assume this data range (ft).
 * Stretched BW tiles: white → min, black → max (same convention as ArcGIS raster export).
 */
export const FLOOD_RASTER_DATA_RANGE_FALLBACK_FT = { minFt: 0, maxFt: 10 };

/**
 * @param {unknown} legendJson Response from `.../MapServer/legend?f=json`
 * @param {number} [layerId=0]
 * @returns {{ minFt: number, maxFt: number } | null}
 */
export function parseFloodRasterDepthRangeFromLegend(legendJson, layerId = 0) {
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

export function resolveFloodRasterDataRangeFt(legendJson, layerId = 0) {
    const parsed = parseFloodRasterDepthRangeFromLegend(legendJson, layerId);
    if (parsed) {
        return parsed;
    }
    return { ...FLOOD_RASTER_DATA_RANGE_FALLBACK_FT };
}
