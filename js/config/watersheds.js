/** Static config per watershed (URLs, attribute fields, optional fixed home view). */
export const WATERSHED_DEFS = {
    "clear-creek": {
        id: "clear-creek",
        label: "Clear Creek",
        aboutLede:
            "In April 2016, the Tax Day Storm brought historic flooding to parts of the Houston region, mostly on the outer fringe. This map compares the actual flood impacts in the Clear Creek watershed with the impacts the 2016 Tax Day Storm would have had, if it centered over the Clear Creek area, instead of outer Houston. Below: three map scenarios—Historic, Transported, and Difference.",
        aboutHistoricHtml:
            '<span class="narrative-term">Historic</span> — Flood depths for this area during the actual Tax Day Storm of April 17–18, 2016.',
        aboutTransportedHtml:
            '<span class="narrative-term">Transported</span> — Modeled flood depths if the 2016 Tax Day Storm were centered on the Clear Creek landscape.',
        historicTileUrl:
            "https://tiles.arcgis.com/tiles/lqRTrQp2HrfnJt8U/arcgis/rest/services/TD_historic_HC_CC_BW/MapServer",
        transportedTileUrl:
            "https://tiles.arcgis.com/tiles/lqRTrQp2HrfnJt8U/arcgis/rest/services/TD_transposed_HC_CC_BW/MapServer",
        centroidUrl:
            "https://services.arcgis.com/lqRTrQp2HrfnJt8U/arcgis/rest/services/res_centriods_HC_CC/FeatureServer/0",
        historicField: "TD_histori",
        transportedField: "TD_transpo",
        homeCenter: { longitude: -95.1410888, latitude: 29.6014573 },
        homeZoom: 12.5
    },
    "hunting-bayou": {
        id: "hunting-bayou",
        label: "Hunting Bayou",
        aboutLede:
            "In April 2016, the Tax Day Storm brought historic flooding to parts of the Houston region, mostly on the outer fringe. This map compares the actual flood impacts in the Hunting Bayou watershed with the impacts the 2016 Tax Day Storm would have had, if it centered over the Hunting Bayou area, instead of outer Houston. Below: three map scenarios—Historic, Transported, and Difference.",
        aboutHistoricHtml:
            '<span class="narrative-term">Historic</span> — Flood depths for this area during the actual Tax Day Storm of April 17–18, 2016.',
        aboutTransportedHtml:
            '<span class="narrative-term">Transported</span> — Modeled flood depths if the 2016 Tax Day Storm were centered on the Hunting Bayou landscape.',
        historicTileUrl:
            "https://tiles.arcgis.com/tiles/lqRTrQp2HrfnJt8U/arcgis/rest/services/Resampled_Huntings_Historical_Depths/MapServer",
        transportedTileUrl:
            "https://tiles.arcgis.com/tiles/lqRTrQp2HrfnJt8U/arcgis/rest/services/Resample_Huntings_Transported_Depths/MapServer",
        centroidUrl:
            "https://services.arcgis.com/lqRTrQp2HrfnJt8U/arcgis/rest/services/HC_Res_Centriods_BG_HB/FeatureServer/0",
        historicField: "HTD_dep_HB",
        transportedField: "TDT_dep_HB",
        homeCenter: null,
        homeZoom: 13.3
    }
};

/** Same for every watershed; shown in About → narrative list. */
export const ABOUT_COMPARISON_DIFFERENCE_HTML =
    '<span class="narrative-term">Difference</span> — The flood layer shows <strong>transported minus historic</strong> depth (feet) wherever that gain is positive—where placing the Tax Day 2016 storm on this watershed would add water beyond what the actual 2016 event produced. <strong>Affected homes</strong> is the net count: homes at or above the depth threshold in <strong>Transported</strong> minus homes at or above the same threshold in <strong>Historic</strong>.';
