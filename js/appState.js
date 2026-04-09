/** Mutable UI / scenario state (avoid circular imports via direct reassignment of module exports). */
export const appState = {
    currentFloodLayer: "historic",
    currentCentroidField: "TD_histori",
    currentWatershedId: "clear-creek",
    currentFloodRasterRampId: "classic-cyan",
    /** Matches `BASEMAP_SELECTOR_OPTIONS` id; initial load uses CartoDB Positron. */
    currentBasemapId: "cartodb-positron"
};
