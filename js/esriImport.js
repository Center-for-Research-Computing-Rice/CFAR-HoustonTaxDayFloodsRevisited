/**
 * Single top-level ArcGIS import for the app (CDN `$arcgis.import()`).
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

export {
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
};
