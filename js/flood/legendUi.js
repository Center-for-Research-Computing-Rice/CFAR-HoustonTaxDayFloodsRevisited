import {
    FLOOD_COLOR_DISPLAY_MAX_DEPTH_FT,
    floodDepthDisplayRgbFromNorm,
    getFloodRasterDisplayStops,
    rgbToHex
} from "./colorRamp.js";

/** Mid-depth (ft) per legend band on the 0–2 ft compressed color scale (matches raster t = depth / cap). */
const FLOOD_LEGEND_SWATCH_DEPTH_MID_FT = {
    nuisance: 0.25,
    danger: 0.75,
    major: 1.55,
    extreme: 2
};

/** Updates #flood-legend swatches to match `appState.currentFloodRasterRampId`. */
export function syncFloodLegendSwatches() {
    const root = document.getElementById("flood-legend");
    if (!root) {
        return;
    }
    const stops = getFloodRasterDisplayStops();
    const cap = FLOOD_COLOR_DISPLAY_MAX_DEPTH_FT;
    const noneEl = root.querySelector('.legend-item[data-depth-class="none"] .legend-color');
    if (noneEl) {
        noneEl.style.backgroundColor = "#ffffff";
    }
    for (const [cls, midFt] of Object.entries(FLOOD_LEGEND_SWATCH_DEPTH_MID_FT)) {
        const el = root.querySelector(`.legend-item[data-depth-class="${cls}"] .legend-color`);
        if (!el) {
            continue;
        }
        const t = Math.min(1, midFt / cap);
        const { r, g, b } = floodDepthDisplayRgbFromNorm(t, stops);
        el.style.backgroundColor = rgbToHex(r, g, b);
    }
}

const FLOOD_LEGEND_SCENARIO_COPY = {
    absolute: {
        heading: "Flood depth",
        tipAria: "Help: flood depth legend classes",
        rows: {
            none: { label: "None", depth: "0.0 ft" },
            nuisance: { label: "Nuisance", depth: "0.1–0.4 ft" },
            danger: { label: "Danger", depth: "0.5–1.0 ft" },
            major: { label: "Major", depth: "1.1–2.0 ft" },
            extreme: { label: "Extreme", depth: "2+ ft" }
        }
    },
    difference: {
        heading: "Depth gain",
        tipAria: "Help: depth gain legend (Difference mode)",
        rows: {
            none: { label: "Not shown", depth: "≤ 0 ft gain" },
            nuisance: { label: "Low gain", depth: "0.1–0.4 ft" },
            danger: { label: "Moderate gain", depth: "0.5–1.0 ft" },
            major: { label: "Large gain", depth: "1.1–2.0 ft" },
            extreme: { label: "Very large gain", depth: "2+ ft" }
        }
    }
};

/** Legend categories describe absolute depths for Historic/Transported; Difference uses the same color scale for positive transported − historic gain. */
export function syncFloodLegendForScenario(floodScenarioId) {
    const mode = floodScenarioId === "difference" ? "difference" : "absolute";
    const copy = FLOOD_LEGEND_SCENARIO_COPY[mode];
    const heading = document.getElementById("flood-legend-heading");
    if (heading) {
        heading.textContent = copy.heading;
    }
    const tipBtn = document.getElementById("tip-btn-flood-legend");
    if (tipBtn) {
        tipBtn.setAttribute("aria-label", copy.tipAria);
    }
    const tipAbs = document.getElementById("tip-flood-legend-body-absolute");
    const tipDiff = document.getElementById("tip-flood-legend-body-difference");
    if (tipAbs && tipDiff) {
        tipAbs.hidden = mode === "difference";
        tipDiff.hidden = mode !== "difference";
    }
    const root = document.getElementById("flood-legend");
    if (!root) {
        return;
    }
    for (const [cls, { label, depth }] of Object.entries(copy.rows)) {
        const item = root.querySelector(`.legend-item[data-depth-class="${cls}"]`);
        if (!item) {
            continue;
        }
        const labelEl = item.querySelector(".legend-label");
        const depthEl = item.querySelector(".legend-depth");
        if (labelEl) {
            labelEl.textContent = label;
        }
        if (depthEl) {
            depthEl.textContent = depth;
        }
    }
}
