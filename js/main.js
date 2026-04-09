import { appState } from "./appState.js";
import { ABOUT_COMPARISON_DIFFERENCE_HTML, WATERSHED_DEFS } from "./config/watersheds.js";
import { FLOOD_RASTER_RAMPS, getFloodColor } from "./flood/colorRamp.js";
import { syncFloodLegendForScenario, syncFloodLegendSwatches } from "./flood/legendUi.js";
import {
    buildCentroidDepthWhereClause,
    formatDepthFilterReadout,
    getFloodMinDepthFt,
    quantizeDepthFilterFt,
    syncDepthFilterReadout,
    syncHomesFloodedStatTitle
} from "./homes/depthAndCount.js";
import { ArcGISMap, FeatureFilter, MapView, reactiveUtils, Viewpoint } from "./esriImport.js";
import { loadWatershedLayerPack } from "./layers/watershedPack.js";
import { createBasemap } from "./map/basemap.js";
import { refs } from "./refs.js";
import {
    createCentroidRenderer,
    createDifferenceCentroidSimpleRenderer
} from "./renderers/centroids.js";
import { initHelpTooltips } from "./ui/helpTooltips.js";
import { mountFloodRampPicker } from "./ui/floodRampPicker.js";

export async function runApp() {
    if (!FLOOD_RASTER_RAMPS[appState.currentFloodRasterRampId]) {
        appState.currentFloodRasterRampId = "classic-cyan";
    }
    const [clearCreekPack, huntingBayouPack] = await Promise.all([
        loadWatershedLayerPack(WATERSHED_DEFS["clear-creek"]),
        loadWatershedLayerPack(WATERSHED_DEFS["hunting-bayou"])
    ]);

    refs.watershedLayerSets = {
        "clear-creek": clearCreekPack,
        "hunting-bayou": huntingBayouPack
    };

    refs.overlayLayers = {
        historic: clearCreekPack.historic,
        transported: clearCreekPack.transported,
        difference: clearCreekPack.difference,
        centroids: clearCreekPack.centroids
    };

    const ccHome = WATERSHED_DEFS["clear-creek"].homeCenter;
    const map = new ArcGISMap({
        basemap: createBasemap("cartodb-positron"),
        layers: [
            clearCreekPack.historic,
            clearCreekPack.transported,
            clearCreekPack.difference,
            clearCreekPack.centroids,
            huntingBayouPack.historic,
            huntingBayouPack.transported,
            huntingBayouPack.difference,
            huntingBayouPack.centroids
        ]
    });

    const view = new MapView({
        container: "viewDiv",
        map,
        center: [ccHome.longitude, ccHome.latitude],
        zoom: WATERSHED_DEFS["clear-creek"].homeZoom,
        constraints: {
            snapToZoom: false
        }
    });

    refs.map = map;
    refs.view = view;

    await view.when();

    function rebindCentroidsLayerView() {
        refs.centroidsLayerView = null;
        void view.whenLayerView(refs.overlayLayers.centroids).then((lv) => {
            refs.centroidsLayerView = lv;
            syncCentroidsLayerViewFilter();
        });
    }

    rebindCentroidsLayerView();

    const homesHoverPopup = document.getElementById("homes-hover-popup");

    function formatDepthFt(value) {
        if (value === null || value === undefined || value === "") return "—";
        const n = Number(value);
        if (Number.isNaN(n)) return "—";
        if (n === -9999) return "0 ft";
        return `${n.toFixed(1)} ft`;
    }

    let homesHoverActiveFeatureKey = null;

    function hideHomesHoverPopup() {
        if (!homesHoverPopup) return;
        homesHoverActiveFeatureKey = null;
        homesHoverPopup.hidden = true;
        homesHoverPopup.setAttribute("aria-hidden", "true");
    }

    function getHomesFeatureKey(graphic) {
        if (!graphic) return null;
        const layer = refs.overlayLayers.centroids;
        if (typeof layer.getObjectId === "function") {
            try {
                const id = layer.getObjectId(graphic);
                if (id != null) return `oid:${id}`;
            } catch {
                /* ignore */
            }
        }
        const a = graphic.attributes;
        const oid = a?.FID ?? a?.OBJECTID ?? a?.objectid;
        if (oid != null) return `oid:${oid}`;
        const g = graphic.geometry;
        if (g && g.type === "point" && Number.isFinite(g.x) && Number.isFinite(g.y)) {
            return `xy:${g.x},${g.y}`;
        }
        return null;
    }

    function formatDepthGainFt(historicVal, transportedVal) {
        const h = Number(historicVal);
        const t = Number(transportedVal);
        if (!Number.isFinite(h) || !Number.isFinite(t)) {
            return "—";
        }
        if (historicVal === -9999 || transportedVal === -9999) {
            return "—";
        }
        return `${(t - h).toFixed(1)} ft`;
    }

    function buildHomesHoverContent(historic, transportedDepth, scenario) {
        const gainRow =
            scenario === "difference"
                ? `
        <div class="homes-hover-popup__row">
            <span class="homes-hover-popup__label">Depth gain (T − H)</span>
            <span class="homes-hover-popup__value">${formatDepthGainFt(historic, transportedDepth)}</span>
        </div>`
                : "";
        return `
        <div class="homes-hover-popup__title">Flood depth</div>
        <div class="homes-hover-popup__row">
            <span class="homes-hover-popup__label">Historic Flood</span>
            <span class="homes-hover-popup__value">${formatDepthFt(historic)}</span>
        </div>
        <div class="homes-hover-popup__row">
            <span class="homes-hover-popup__label">Transported Flood</span>
            <span class="homes-hover-popup__value">${formatDepthFt(transportedDepth)}</span>
        </div>${gainRow}`;
    }

    function positionHomesHoverPopup(screenX, screenY) {
        if (!homesHoverPopup || homesHoverPopup.hidden) return;
        const wrap = homesHoverPopup.parentElement;
        if (!wrap) return;
        const pad = 14;
        const w = homesHoverPopup.offsetWidth;
        const h = homesHoverPopup.offsetHeight;
        let left = screenX + pad;
        let top = screenY + pad;
        if (left + w > wrap.clientWidth - 8) {
            left = Math.max(8, screenX - w - pad);
        }
        if (top + h > wrap.clientHeight - 8) {
            top = Math.max(8, screenY - h - pad);
        }
        homesHoverPopup.style.left = `${left}px`;
        homesHoverPopup.style.top = `${top}px`;
    }

    function showHomesHoverPopup(screenX, screenY, attrs) {
        if (!homesHoverPopup) return;
        const wdef = WATERSHED_DEFS[appState.currentWatershedId];
        const historic = attrs?.[wdef.historicField];
        const transportedDepth = attrs?.[wdef.transportedField];
        homesHoverPopup.innerHTML = buildHomesHoverContent(historic, transportedDepth, appState.currentFloodLayer);
        homesHoverPopup.hidden = false;
        homesHoverPopup.setAttribute("aria-hidden", "false");
        requestAnimationFrame(() => positionHomesHoverPopup(screenX, screenY));
    }

    let homesHoverHitGeneration = 0;
    let homesHoverRafId = null;
    let homesHoverCoalesceEvent = null;

    function cancelHomesHoverPoll() {
        if (homesHoverRafId != null) {
            cancelAnimationFrame(homesHoverRafId);
            homesHoverRafId = null;
        }
        homesHoverCoalesceEvent = null;
        homesHoverHitGeneration += 1;
    }

    function scheduleHomesHoverHitTest() {
        if (homesHoverRafId != null) return;
        homesHoverRafId = requestAnimationFrame(() => {
            homesHoverRafId = null;
            const evt = homesHoverCoalesceEvent;
            if (!evt || !homesHoverPopup || !refs.overlayLayers.centroids.visible) return;
            void runHomesHoverHitTest(evt);
        });
    }

    async function runHomesHoverHitTest(event) {
        const gen = ++homesHoverHitGeneration;
        const ex = event.x;
        const ey = event.y;
        try {
            const response = await view.hitTest(event, { include: refs.overlayLayers.centroids });
            if (gen !== homesHoverHitGeneration) return;
            if (!refs.overlayLayers.centroids.visible) {
                view.container.style.cursor = "";
                hideHomesHoverPopup();
                return;
            }
            const hit = response.results.find((r) => r.graphic?.layer === refs.overlayLayers.centroids);
            if (hit?.graphic) {
                view.container.style.cursor = "pointer";
                const featureKey = getHomesFeatureKey(hit.graphic);
                if (featureKey === homesHoverActiveFeatureKey && !homesHoverPopup.hidden) {
                    /* same point */
                } else {
                    homesHoverActiveFeatureKey = featureKey;
                    showHomesHoverPopup(event.x, event.y, hit.graphic.attributes);
                }
            } else {
                view.container.style.cursor = "";
                hideHomesHoverPopup();
            }
        } catch {
            if (gen !== homesHoverHitGeneration) return;
            view.container.style.cursor = "";
            hideHomesHoverPopup();
        }

        const latest = homesHoverCoalesceEvent;
        if (
            latest &&
            homesHoverPopup &&
            refs.overlayLayers.centroids.visible &&
            (latest.x !== ex || latest.y !== ey)
        ) {
            scheduleHomesHoverHitTest();
        }
    }

    view.on("pointer-move", (event) => {
        if (!homesHoverPopup || !refs.overlayLayers.centroids.visible) {
            cancelHomesHoverPoll();
            hideHomesHoverPopup();
            view.container.style.cursor = "";
            return;
        }
        homesHoverCoalesceEvent = event;
        scheduleHomesHoverHitTest();
    });

    view.on("pointer-leave", () => {
        cancelHomesHoverPoll();
        view.container.style.cursor = "";
        hideHomesHoverPopup();
    });

    view.ui.empty("top-left");
    view.ui.empty("bottom-right");

    const goToSearchResult = (mapView, goToParams) =>
        mapView.goTo(goToParams.target, {
            ...(goToParams.options || {}),
            zoom: 15
        });

    async function setupMapComponents() {
        const homeEl = document.getElementById("arcgis-home-widget");
        const zoomEl = document.getElementById("arcgis-zoom-widget");
        const searchEl = document.getElementById("arcgis-search-widget");

        await Promise.all(
            [homeEl, zoomEl, searchEl].map((el) =>
                el && typeof el.componentOnReady === "function" ? el.componentOnReady() : Promise.resolve()
            )
        );

        if (zoomEl) {
            zoomEl.view = view;
        }

        if (homeEl) {
            homeEl.view = view;
            homeEl.viewpoint = view.viewpoint?.clone?.() ?? new Viewpoint({ targetGeometry: view.center, scale: view.scale });
        }

        if (searchEl) {
            searchEl.view = view;
            searchEl.allPlaceholder = "Search address or place…";
            searchEl.popupDisabled = false;
            searchEl.resultGraphicDisabled = false;
            searchEl.goToOverride = goToSearchResult;

            const syncSearchLocation = () => {
                const vm = searchEl.viewModel;
                if (vm) {
                    vm.location = view.center;
                }
            };
            syncSearchLocation();
            if (typeof reactiveUtils.watch === "function") {
                reactiveUtils.watch(() => view.center, syncSearchLocation);
            }
        }
    }

    try {
        await setupMapComponents();
    } catch (err) {
        console.error("Map components (Home / Zoom / Search) failed to initialize:", err);
    }

    const basemapDropdown = document.getElementById("basemap-dropdown");
    const floodRampPickerRoot = document.getElementById("flood-ramp-picker-root");
    const floodRampPicker = mountFloodRampPicker(floodRampPickerRoot, {
        initialId: appState.currentFloodRasterRampId,
        onChange: (id) => applyFloodRasterRamp(id)
    });
    const scenarioButtons = document.querySelectorAll(".scenario-btn");
    const scenarioHint = document.getElementById("scenario-hint");
    const centroidsToggle = document.getElementById("centroids-toggle");
    const homesPointLegend = document.getElementById("homes-point-legend");
    const homesFloodedStat = document.getElementById("homes-flooded-stat");
    const homesFloodedCountEl = document.getElementById("homes-flooded-count");
    const opacitySlider = document.getElementById("opacity-slider");
    const opacityValue = document.getElementById("opacity-value");
    const depthFilterSlider = document.getElementById("depth-filter-slider");
    const depthFilterValue = document.getElementById("depth-filter-value");
    const controlsToggle = document.getElementById("controls-toggle");
    const controlsContent = document.getElementById("controls-content");

    function syncCentroidsLayerViewFilter() {
        if (!refs.centroidsLayerView) {
            return;
        }
        const clause = buildCentroidDepthWhereClause();
        refs.centroidsLayerView.filter = clause ? new FeatureFilter({ where: clause }) : null;
    }

    async function refreshFloodedHomesCount() {
        if (!homesFloodedCountEl || !refs.overlayLayers?.centroids) {
            return;
        }
        const where = buildCentroidDepthWhereClause();
        if (!where) {
            return;
        }

        const minFt = getFloodMinDepthFt();
        syncHomesFloodedStatTitle(minFt, homesFloodedStat);

        homesFloodedCountEl.classList.add("homes-flooded-stat__value--pending");
        if (homesFloodedStat) {
            homesFloodedStat.setAttribute("aria-busy", "true");
        }

        try {
            await refs.overlayLayers.centroids.load();
            const count = await refs.overlayLayers.centroids.queryFeatureCount({ where });
            homesFloodedCountEl.textContent = count.toLocaleString();
        } catch {
            homesFloodedCountEl.textContent = "—";
        } finally {
            homesFloodedCountEl.classList.remove("homes-flooded-stat__value--pending");
            if (homesFloodedStat) {
                homesFloodedStat.removeAttribute("aria-busy");
            }
        }
    }

    function updateScenarioUI(selectedRaster) {
        scenarioButtons.forEach((btn) => {
            const isActive = btn.dataset.scenario === selectedRaster;
            btn.classList.toggle("is-active", isActive);
            btn.setAttribute("aria-pressed", String(isActive));
        });
        if (scenarioHint) {
            if (selectedRaster === "historic") {
                scenarioHint.textContent = "Showing: Historic baseline.";
                scenarioHint.title =
                    "Modeled flood depths for typical conditions in this area—the historic baseline. Compare with Transported to see Tax Day 2016 applied here.";
            } else if (selectedRaster === "transported") {
                scenarioHint.textContent = "Showing: Transported Tax Day 2016.";
                scenarioHint.title =
                    "Depths as if the April 2016 Tax Day flood were placed on this landscape. Contrast with Historic to see the difference from typical risk.";
            } else {
                scenarioHint.textContent = "Showing: Difference (transported − historic).";
                scenarioHint.title =
                    "Raster shows depth gained (transported minus historic) where that gain is positive. Homes: dry in Historic but flooded in Transported. Depth filter applies to transported depth and to positive gain on the raster.";
            }
        }
    }

    function syncAllWatershedLayerVisibility() {
        const homesOn = centroidsToggle?.getAttribute("aria-checked") === "true";
        for (const id of Object.keys(refs.watershedLayerSets)) {
            const pack = refs.watershedLayerSets[id];
            const active = id === appState.currentWatershedId;
            if (!active) {
                pack.historic.visible = false;
                pack.transported.visible = false;
                if (pack.difference) {
                    pack.difference.visible = false;
                }
                pack.centroids.visible = false;
            } else {
                pack.historic.visible = appState.currentFloodLayer === "historic";
                pack.transported.visible = appState.currentFloodLayer === "transported";
                if (pack.difference) {
                    pack.difference.visible = appState.currentFloodLayer === "difference";
                }
                pack.centroids.visible = !!homesOn;
            }
        }
    }

    function applyCentroidsRendererForCurrentScenario() {
        const wdef = WATERSHED_DEFS[appState.currentWatershedId];
        if (appState.currentFloodLayer === "difference") {
            refs.overlayLayers.centroids.renderer = createDifferenceCentroidSimpleRenderer();
        } else {
            refs.overlayLayers.centroids.renderer = createCentroidRenderer(appState.currentCentroidField);
        }
    }

    function applyRasterScenario(selectedRaster) {
        appState.currentFloodLayer = selectedRaster;

        const wdef = WATERSHED_DEFS[appState.currentWatershedId];
        if (selectedRaster === "historic") {
            appState.currentCentroidField = wdef.historicField;
        } else if (selectedRaster === "transported") {
            appState.currentCentroidField = wdef.transportedField;
        } else {
            appState.currentCentroidField = wdef.transportedField;
        }

        syncAllWatershedLayerVisibility();

        updateScenarioUI(selectedRaster);
        syncFloodLegendForScenario(selectedRaster);

        const homesOn = centroidsToggle.getAttribute("aria-checked") === "true";
        if (homesOn) {
            applyCentroidsRendererForCurrentScenario();
        }
        syncCentroidsLayerViewFilter();
        void refreshFloodedHomesCount();
        refreshFloodRasterTiles();
    }

    function refreshFloodRasterTiles() {
        for (const id of Object.keys(refs.watershedLayerSets)) {
            const pack = refs.watershedLayerSets[id];
            pack.historic.refresh?.();
            pack.transported.refresh?.();
            pack.difference?.refresh?.();
        }
    }

    function applyFloodRasterRamp(rampId) {
        if (!FLOOD_RASTER_RAMPS[rampId]) {
            return;
        }
        appState.currentFloodRasterRampId = rampId;
        refreshFloodRasterTiles();
        syncFloodLegendSwatches();
    }

    basemapDropdown.addEventListener("change", (event) => {
        map.basemap = createBasemap(event.target.value);
    });

    syncFloodLegendSwatches();

    scenarioButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            applyRasterScenario(btn.dataset.scenario);
        });
    });

    applyRasterScenario("historic");

    function setHomesEnabled(on) {
        centroidsToggle.setAttribute("aria-checked", String(on));
        centroidsToggle.classList.toggle("is-active", on);
        if (homesPointLegend) {
            homesPointLegend.hidden = !on;
        }
        if (!on) {
            cancelHomesHoverPoll();
            hideHomesHoverPopup();
            if (view?.container) {
                view.container.style.cursor = "";
            }
        }
        syncAllWatershedLayerVisibility();
        if (on) {
            applyCentroidsRendererForCurrentScenario();
            syncCentroidsLayerViewFilter();
        }
    }

    centroidsToggle.addEventListener("click", () => {
        const next = centroidsToggle.getAttribute("aria-checked") !== "true";
        setHomesEnabled(next);
        if (next) {
            void refreshFloodedHomesCount();
        }
    });

    setHomesEnabled(true);

    function syncAboutComparisonNarrative(wsId) {
        const def = WATERSHED_DEFS[wsId];
        if (!def) {
            return;
        }
        const lede = document.getElementById("about-comparison-lede");
        const liH = document.getElementById("about-comparison-historic");
        const liT = document.getElementById("about-comparison-transported");
        if (lede && def.aboutLede != null) {
            lede.textContent = def.aboutLede;
        }
        if (liH && def.aboutHistoricHtml != null) {
            liH.innerHTML = def.aboutHistoricHtml;
        }
        if (liT && def.aboutTransportedHtml != null) {
            liT.innerHTML = def.aboutTransportedHtml;
        }
        const liD = document.getElementById("about-comparison-difference");
        if (liD) {
            liD.innerHTML = ABOUT_COMPARISON_DIFFERENCE_HTML;
        }
    }

    function flashAboutComparisonSummaryOutline() {
        const summary = document.getElementById("about-comparison-summary");
        if (!summary) {
            return;
        }
        if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            return;
        }
        const done = () => {
            summary.classList.remove("panel-details-summary--attention");
            summary.removeEventListener("animationend", done);
        };
        summary.addEventListener("animationend", done);
        requestAnimationFrame(() => {
            summary.classList.add("panel-details-summary--attention");
        });
    }

    syncAboutComparisonNarrative(appState.currentWatershedId);
    queueMicrotask(() => flashAboutComparisonSummaryOutline());

    function applyFloodOpacityFromSlider() {
        if (!opacitySlider || !refs.overlayLayers?.historic || !refs.overlayLayers?.transported || !refs.overlayLayers?.difference) {
            return;
        }
        const transparency = Number.parseInt(opacitySlider.value, 10);
        if (!Number.isFinite(transparency)) {
            return;
        }
        const opacity = (100 - transparency) / 100;
        refs.overlayLayers.historic.opacity = opacity;
        refs.overlayLayers.transported.opacity = opacity;
        refs.overlayLayers.difference.opacity = opacity;
        if (opacityValue) {
            opacityValue.textContent = `${100 - transparency}%`;
        }
    }

    if (opacitySlider) {
        opacitySlider.addEventListener("input", () => applyFloodOpacityFromSlider());
        applyFloodOpacityFromSlider();
        queueMicrotask(() => applyFloodOpacityFromSlider());
    }

    function getActiveDepthFilterMaxFt() {
        return refs.watershedLayerSets[appState.currentWatershedId]?.depthFilterMaxFt ?? 10;
    }

    function applyFloodMinDepthFt(minFt) {
        const maxFt = getActiveDepthFilterMaxFt();
        const v = Math.min(quantizeDepthFilterFt(minFt), maxFt);
        refs.overlayLayers.historic.minDepthFt = v;
        refs.overlayLayers.transported.minDepthFt = v;
        refs.overlayLayers.difference.minDepthFt = v;
        if (depthFilterSlider) {
            depthFilterSlider.value = String(v);
        }
        syncDepthFilterReadout(v, depthFilterValue);
        syncCentroidsLayerViewFilter();
        void refreshFloodedHomesCount();
        if (appState.currentFloodLayer === "historic") {
            refs.overlayLayers.historic.refresh();
        } else if (appState.currentFloodLayer === "transported") {
            refs.overlayLayers.transported.refresh();
        } else {
            refs.overlayLayers.difference?.refresh?.();
        }
    }

    if (depthFilterSlider && depthFilterValue) {
        depthFilterSlider.addEventListener("input", (event) => {
            const maxFt = getActiveDepthFilterMaxFt();
            const raw = quantizeDepthFilterFt(event.target.value);
            const v = Math.min(raw, maxFt);
            applyFloodMinDepthFt(v);
        });
        syncDepthFilterReadout(quantizeDepthFilterFt(depthFilterSlider.value), depthFilterValue);
    }

    function defaultWatershedUiState() {
        return {
            scenario: "historic",
            opacityTransparency: 30,
            depthFilterFt: 0,
            homesVisible: true
        };
    }

    const watershedUiState = {
        "clear-creek": defaultWatershedUiState(),
        "hunting-bayou": defaultWatershedUiState()
    };

    function captureWatershedUiState(wsId) {
        watershedUiState[wsId] = {
            scenario: appState.currentFloodLayer,
            opacityTransparency: Number.parseInt(opacitySlider?.value ?? "30", 10),
            depthFilterFt: quantizeDepthFilterFt(depthFilterSlider?.value ?? 0),
            homesVisible: centroidsToggle?.getAttribute("aria-checked") === "true"
        };
    }

    function applyWatershedUiState(wsId) {
        const s = watershedUiState[wsId];
        const pack = refs.watershedLayerSets[wsId];
        if (depthFilterSlider) {
            depthFilterSlider.max = String(pack.depthFilterMaxFt);
        }
        floodRampPicker.setValue(appState.currentFloodRasterRampId);
        if (opacitySlider) {
            opacitySlider.value = String(Number.isFinite(s.opacityTransparency) ? s.opacityTransparency : 30);
        }
        const maxD = pack.depthFilterMaxFt;
        const d = Math.min(quantizeDepthFilterFt(s.depthFilterFt), maxD);
        if (depthFilterSlider) {
            depthFilterSlider.value = String(d);
        }
        syncDepthFilterReadout(d, depthFilterValue);

        centroidsToggle?.setAttribute("aria-checked", String(s.homesVisible));
        centroidsToggle?.classList.toggle("is-active", s.homesVisible);
        if (homesPointLegend) {
            homesPointLegend.hidden = !s.homesVisible;
        }

        applyRasterScenario(s.scenario);
        applyFloodOpacityFromSlider();
        applyFloodMinDepthFt(d);
        syncFloodLegendSwatches();
    }

    function updateWatershedPickerUi() {
        document.querySelectorAll("[data-watershed]").forEach((btn) => {
            const active = btn.dataset.watershed === appState.currentWatershedId;
            btn.classList.toggle("is-active", active);
            btn.setAttribute("aria-pressed", String(active));
        });
    }

    async function switchWatershed(newId) {
        if (newId === appState.currentWatershedId || !refs.watershedLayerSets[newId]) {
            return;
        }
        captureWatershedUiState(appState.currentWatershedId);
        appState.currentWatershedId = newId;
        refs.overlayLayers = {
            historic: refs.watershedLayerSets[newId].historic,
            transported: refs.watershedLayerSets[newId].transported,
            difference: refs.watershedLayerSets[newId].difference,
            centroids: refs.watershedLayerSets[newId].centroids
        };
        applyWatershedUiState(newId);
        refreshFloodRasterTiles();
        rebindCentroidsLayerView();
        updateWatershedPickerUi();
        syncAboutComparisonNarrative(newId);
        window.overlayLayers = refs.overlayLayers;
        window.currentWatershedId = appState.currentWatershedId;

        const pack = refs.watershedLayerSets[newId];
        try {
            await view.goTo(pack.homeGoTo, { duration: 1100 });
        } catch {
            /* ignore goTo abort */
        }
        const homeEl = document.getElementById("arcgis-home-widget");
        if (homeEl && typeof view.viewpoint?.clone === "function") {
            homeEl.viewpoint = view.viewpoint.clone();
        }
    }

    document.querySelectorAll("[data-watershed]").forEach((btn) => {
        btn.addEventListener("click", () => {
            void switchWatershed(btn.dataset.watershed);
        });
    });

    controlsToggle.addEventListener("click", () => {
        controlsContent.classList.toggle("collapsed");
        const arrow = controlsToggle.textContent.includes("▲") ? "▼" : "▲";
        controlsToggle.textContent = `Map options ${arrow}`;
    });

    initHelpTooltips();

    window.arcgisMap = map;
    window.arcgisView = view;
    window.overlayLayers = refs.overlayLayers;
    window.appState = appState;
    window.getFloodColor = getFloodColor;
    Object.defineProperty(window, "currentFloodLayer", {
        get: () => appState.currentFloodLayer,
        configurable: true
    });
    Object.defineProperty(window, "currentWatershedId", {
        get: () => appState.currentWatershedId,
        configurable: true
    });

    console.log("ArcGIS JavaScript API v5 map initialized for Houston, Texas");
}
