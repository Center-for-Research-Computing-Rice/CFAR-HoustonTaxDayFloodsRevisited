import { Basemap, WebTileLayer } from "../esriImport.js";

/** Options shown in the map basemap picker (order = menu order). Default app basemap is first. */
export const BASEMAP_SELECTOR_OPTIONS = [
    { id: "cartodb-positron", label: "CartoDB Positron (default)" },
    { id: "esri-streets", label: "Streets (Esri)" },
    { id: "esri-satellite", label: "Satellite (Esri)" },
    { id: "esri-hybrid", label: "Hybrid (Esri)" },
    { id: "esri-topo", label: "Topographic (Esri)" },
    { id: "esri-light-gray", label: "Light gray canvas (Esri)" },
    { id: "esri-dark-gray", label: "Dark gray canvas (Esri)" },
    { id: "esri-terrain", label: "Terrain (Esri)" },
    { id: "esri-oceans", label: "Oceans (Esri)" }
];

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
