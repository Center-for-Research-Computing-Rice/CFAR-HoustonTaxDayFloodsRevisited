import { appState } from "../appState.js";

/** Raster color ramp compresses to this depth; ≥ this depth uses the deepest ramp color. */
export const FLOOD_COLOR_DISPLAY_MAX_DEPTH_FT = 2;

/**
 * Water-themed display ramps (t = 0 shallow … 1 deep on the compressed color scale).
 * `classic-cyan` matches the original app palette.
 */
export const FLOOD_RASTER_RAMPS = {
    "classic-cyan": {
        label: "Classic cyan–blue",
        stops: [
            { t: 0, r: 204, g: 255, b: 255 },
            { t: 0.2, r: 102, g: 217, b: 255 },
            { t: 0.4, r: 0, g: 153, b: 255 },
            { t: 0.6, r: 0, g: 71, b: 178 },
            { t: 0.8, r: 0, g: 45, b: 118 },
            { t: 1, r: 0, g: 14, b: 46 }
        ]
    },
    "lagoon-teal": {
        label: "Lagoon teal",
        stops: [
            { t: 0, r: 220, g: 255, b: 252 },
            { t: 0.2, r: 120, g: 230, b: 215 },
            { t: 0.4, r: 0, g: 185, b: 175 },
            { t: 0.6, r: 0, g: 128, b: 135 },
            { t: 0.8, r: 0, g: 88, b: 100 },
            { t: 1, r: 0, g: 48, b: 62 }
        ]
    },
    "deep-navy": {
        label: "Deep navy",
        stops: [
            { t: 0, r: 232, g: 240, b: 255 },
            { t: 0.2, r: 170, g: 195, b: 230 },
            { t: 0.4, r: 95, g: 135, b: 195 },
            { t: 0.6, r: 45, g: 85, b: 150 },
            { t: 0.8, r: 22, g: 50, b: 105 },
            { t: 1, r: 10, g: 24, b: 58 }
        ]
    },
    "tropical-azure": {
        label: "Tropical azure",
        stops: [
            { t: 0, r: 200, g: 248, b: 255 },
            { t: 0.2, r: 0, g: 220, b: 255 },
            { t: 0.4, r: 0, g: 175, b: 235 },
            { t: 0.6, r: 0, g: 120, b: 200 },
            { t: 0.8, r: 0, g: 75, b: 150 },
            { t: 1, r: 0, g: 38, b: 88 }
        ]
    },
    "slate-tide": {
        label: "Slate tide",
        stops: [
            { t: 0, r: 235, g: 242, b: 248 },
            { t: 0.2, r: 185, g: 205, b: 225 },
            { t: 0.4, r: 110, g: 145, b: 180 },
            { t: 0.6, r: 60, g: 100, b: 140 },
            { t: 0.8, r: 35, g: 68, b: 98 },
            { t: 1, r: 18, g: 38, b: 58 }
        ]
    },
    "seafoam-mist": {
        label: "Seafoam mist",
        stops: [
            { t: 0, r: 230, g: 255, b: 248 },
            { t: 0.2, r: 160, g: 240, b: 225 },
            { t: 0.4, r: 70, g: 200, b: 195 },
            { t: 0.6, r: 30, g: 150, b: 165 },
            { t: 0.8, r: 15, g: 105, b: 130 },
            { t: 1, r: 8, g: 62, b: 82 }
        ]
    },
    "cyan-magenta": {
        label: "Cyan to magenta (pink extreme)",
        stops: [
            { t: 0, r: 204, g: 255, b: 255 },
            { t: 0.2, r: 102, g: 217, b: 255 },
            { t: 0.4, r: 0, g: 153, b: 255 },
            { t: 0.6, r: 0, g: 71, b: 178 },
            { t: 0.8, r: 90, g: 40, b: 195 },
            { t: 1, r: 245, g: 35, b: 245 }
        ]
    }
};

export function getFloodRasterDisplayStops() {
    const ramp = FLOOD_RASTER_RAMPS[appState.currentFloodRasterRampId];
    return ramp?.stops ?? FLOOD_RASTER_RAMPS["classic-cyan"].stops;
}

export function floodDepthDisplayRgbFromNorm(t, stops = getFloodRasterDisplayStops()) {
    const u = Math.max(0, Math.min(1, t));
    if (u <= stops[0].t) {
        const s = stops[0];
        return { r: s.r, g: s.g, b: s.b };
    }
    const lastStop = stops[stops.length - 1];
    if (u >= lastStop.t) {
        return { r: lastStop.r, g: lastStop.g, b: lastStop.b };
    }
    for (let i = 0; i < stops.length - 1; i += 1) {
        const a = stops[i];
        const b = stops[i + 1];
        if (u <= b.t) {
            const span = b.t - a.t || 1e-6;
            const k = (u - a.t) / span;
            return {
                r: Math.round(a.r + k * (b.r - a.r)),
                g: Math.round(a.g + k * (b.g - a.g)),
                b: Math.round(a.b + k * (b.b - a.b))
            };
        }
    }
    return { r: lastStop.r, g: lastStop.g, b: lastStop.b };
}

export function rgbToHex(r, g, b) {
    const h = (n) =>
        Math.max(0, Math.min(255, Math.round(Number(n) || 0)))
            .toString(16)
            .padStart(2, "0");
    return `#${h(r)}${h(g)}${h(b)}`;
}

export function getFloodColor(depth) {
    if (depth === null || depth === undefined) return "#cccccc";
    const d = Number(depth);
    if (!Number.isFinite(d) || d <= 0) return "#ffffff";
    if (d <= 2) return "#ccffff";
    if (d <= 4) return "#66d9ff";
    if (d <= 6) return "#0099ff";
    if (d <= 8) return "#0047b2";
    return "#000e2e";
}
