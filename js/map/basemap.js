import { Basemap, WebTileLayer } from "../esriImport.js";

/** Esri portal basemap ids accepted by `map.basemap` (vector / imagery presets). */
const ESRI_BASEMAP_BY_SELECTOR = {
    "esri-streets": "streets-vector",
    "esri-satellite": "satellite",
    "esri-hybrid": "hybrid",
    "esri-topo": "topo-vector",
    "esri-light-gray": "gray-vector",
    "esri-dark-gray": "dark-gray-vector",
    "esri-terrain": "terrain",
    "esri-oceans": "oceans"
};

export function createBasemap(id) {
    if (id === "cartodb-positron") {
        return new Basemap({
            baseLayers: [
                new WebTileLayer({
                    urlTemplate: "https://{subDomain}.basemaps.cartocdn.com/light_all/{level}/{col}/{row}.png",
                    subDomains: ["a", "b", "c", "d"]
                })
            ],
            title: "CartoDB Positron",
            id: "cartodb-positron"
        });
    }
    const esriId = ESRI_BASEMAP_BY_SELECTOR[id];
    if (esriId != null) {
        return esriId;
    }
    return createBasemap("cartodb-positron");
}
