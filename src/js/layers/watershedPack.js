import { WATERSHED_DEFS } from "../config/watersheds.js";
import { resolveFloodRasterDataRangeFt } from "../flood/dataRange.js";
import { clipTileInfoLods, effectiveMapServerLODRange } from "../flood/tileGeometry.js";
import { Extent, FeatureLayer } from "../esriImport.js";
import { createCentroidRenderer } from "../renderers/centroids.js";
import { DepthFilterFloodTileLayer, DifferenceFloodTileLayer } from "./floodTileLayers.js";

export async function loadWatershedLayerPack(def) {
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
    /** UI slider max (ft); same for all watersheds — "Any depth" … 3 ft. */
    const depthFilterMaxFt = 3;
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
        opacity: 1,
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
        opacity: 1,
        visible: false
    });
    /** Difference mode only: faint greyscale transported, same depth filter (opacity set in main). */
    const transportedDiffGrey = new DepthFilterFloodTileLayer({
        tileServiceRoot: tUrl,
        floodScenarioId: "transported",
        activateForScenario: "difference",
        minDepthFt: 0,
        legendDepthSamples: [],
        tileRgbMode: "bwGrey",
        spatialReference: metaT.spatialReference,
        fullExtent: metaT.fullExtent,
        tileInfo: transportedTileInfo,
        floodDataMinFt: rangeT.minFt,
        floodDataMaxFt: rangeT.maxFt,
        opacity: 0.5,
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
        opacity: 1,
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
        transportedDiffGrey,
        difference,
        centroids,
        depthFilterMaxFt,
        homeGoTo
    };
}
