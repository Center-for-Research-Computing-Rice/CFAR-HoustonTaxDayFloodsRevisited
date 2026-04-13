import { appState } from "../appState.js";
import { BaseTileLayer } from "../esriImport.js";
import { FLOOD_RASTER_DATA_RANGE_FALLBACK_FT } from "../flood/dataRange.js";
import {
    coverageEnvelopeInsetForLOD,
    envelopeFromLayerExtent,
    envelopesIntersect,
    tileEnvelopeFromRowCol
} from "../flood/tileGeometry.js";
import {
    compositeBwDifferenceTile,
    depthPassesMinFilterFt,
    estimatedDepthFromLegendSamples,
    processBwFloodTileToBlue,
    processBwFloodTileToGreyscale
} from "../flood/tilePixels.js";

export class DepthFilterFloodTileLayer extends BaseTileLayer {
    constructor({
        tileServiceRoot,
        minDepthFt,
        floodScenarioId,
        legendDepthSamples,
        tileRgbMode = "legendDepth",
        /** When set (e.g. `"difference"`), tiles render only in that scenario instead of matching `floodScenarioId`. */
        activateForScenario = null,
        spatialReference,
        fullExtent,
        tileInfo,
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
        this.activateForScenario = activateForScenario;
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

    _isActiveForCurrentScenario() {
        if (this.activateForScenario != null) {
            return appState.currentFloodLayer === this.activateForScenario;
        }
        return this.floodScenarioId === appState.currentFloodLayer;
    }

    fetchTile(level, row, col, options) {
        if (!this._isActiveForCurrentScenario() || this.visible === false) {
            return Promise.resolve(this.getEmptyTileCanvas());
        }

        const rawCov = this._coverageEnvelope ?? envelopeFromLayerExtent(this.fullExtent);
        const cov = coverageEnvelopeInsetForLOD(rawCov, level, this.tileInfo) ?? rawCov;
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
                } else if (this._tileRgbMode === "bwGrey") {
                    const imageData = ctx.getImageData(0, 0, w, h);
                    processBwFloodTileToGreyscale(imageData, minDepth, this.floodDataMinFt, this.floodDataMaxFt);
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

export class DifferenceFloodTileLayer extends BaseTileLayer {
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
        if (this.floodScenarioId !== appState.currentFloodLayer || this.visible === false) {
            return Promise.resolve(this.getEmptyTileCanvas());
        }
        const rawCov = this._coverageEnvelope ?? envelopeFromLayerExtent(this.fullExtent);
        const cov = coverageEnvelopeInsetForLOD(rawCov, level, this.tileInfo) ?? rawCov;
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
