/** Plain envelope for intersection tests (avoids fetching tiles the service cannot serve — stops most edge 404 console noise). */
export function envelopeFromLayerExtent(ext) {
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

export function envelopesIntersect(a, b) {
    return a.xmin < b.xmax && a.xmax > b.xmin && a.ymin < b.ymax && a.ymax > b.ymin;
}

/**
 * Shrinks layer coverage inward by a fraction of one tile at `level` (map units).
 * `fullExtent` is often slightly larger than the fused cache; edge tiles then 404.
 */
export function coverageEnvelopeInsetForLOD(cov, level, tileInfo) {
    if (!cov) {
        return null;
    }
    const res = resolutionForTileLevel(tileInfo, level);
    if (res == null) {
        return cov;
    }
    const tw = tileInfo.cols ?? tileInfo.rows ?? 256;
    const margin = 0.25 * res * tw;
    const xmin = cov.xmin + margin;
    const xmax = cov.xmax - margin;
    const ymin = cov.ymin + margin;
    const ymax = cov.ymax - margin;
    if (xmax <= xmin || ymax <= ymin) {
        return cov;
    }
    return { xmin, ymin, xmax, ymax };
}

/**
 * MapServer `tileInfo.lods` often lists levels beyond what is cached (`minLOD` / `maxLOD`).
 * Without clipping, the view can request tiles that 404 (e.g. Clear Creek transported max 19 vs historic 20).
 */
export function effectiveMapServerLODRange(meta) {
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

export function clipTileInfoLods(tileInfo, minLOD, maxLOD) {
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

export function resolutionForTileLevel(tileInfo, level) {
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
export function tileEnvelopeFromRowCol(level, row, col, tileInfo) {
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
