/**
 * Injects app credits (with links) into the MapView attribution bar.
 * Layer `copyright` is plain text only; the Esri attribution widget DOM accepts HTML nodes.
 */

const INLINE_CLASS = "map-app-attribution-inline";

function createExternalLink(text, href) {
    const a = document.createElement("a");
    a.textContent = text;
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    /* Inline so links stay styled inside attribution shadow DOM (page CSS does not pierce). */
    a.style.color = "#0079c1";
    a.style.textDecoration = "underline";
    a.addEventListener("mouseenter", () => {
        a.style.color = "#005a8c";
    });
    a.addEventListener("mouseleave", () => {
        a.style.color = "#0079c1";
    });
    return a;
}

function buildInlineCredits() {
    const wrap = document.createElement("span");
    wrap.className = INLINE_CLASS;
    wrap.append("Appplication created by ", createExternalLink("Bruno Sousa", "https://www.linkedin.com/in/brunocastrosousa"), " and ");
    wrap.append(createExternalLink("Uilvim Franco", "https://www.linkedin.com/in/uilvimettore/"), ", ");
    wrap.append(createExternalLink("CRC", "https://researchcomputing.rice.edu/"), ", Rice University.");
    return wrap;
}

function findAttributionBar(root) {
    if (!root) return null;
    const stack = [root];
    while (stack.length) {
        const node = stack.pop();
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.classList.contains("esri-attribution")) return node;
        const tag = node.tagName.toLowerCase();
        if (tag === "arcgis-attribution" || tag === "calcite-attribution") return node;
        const sr = node.shadowRoot;
        if (sr) stack.push(sr);
        for (const child of node.children) stack.push(child);
    }
    return null;
}

function querySourcesHost(bar) {
    const direct = bar.querySelector(".esri-attribution__sources");
    if (direct) return direct;
    const sr = bar.shadowRoot;
    if (!sr) return null;
    return (
        sr.querySelector(".esri-attribution__sources") ||
        sr.querySelector("[class*='attribution__sources']") ||
        sr.querySelector("[part='sources']") ||
        null
    );
}

function hasInlineCredits(bar) {
    return Boolean(bar.querySelector(`.${INLINE_CLASS}`) || bar.shadowRoot?.querySelector(`.${INLINE_CLASS}`));
}

function insertIntoBar(bar) {
    if (hasInlineCredits(bar)) {
        return;
    }

    const patch = buildInlineCredits();
    const sep = document.createTextNode(" | ");

    const sources = querySourcesHost(bar);
    if (sources) {
        sources.insertBefore(patch, sources.firstChild);
        sources.insertBefore(sep, patch.nextSibling);
        return;
    }

    const sr = bar.shadowRoot;
    if (sr) {
        const row = sr.querySelector(".esri-widget__content, .container, footer") || sr.firstElementChild;
        if (row) {
            row.insertBefore(patch, row.firstChild);
            row.insertBefore(sep, patch.nextSibling);
            return;
        }
    }

    bar.insertBefore(patch, bar.firstChild);
    bar.insertBefore(sep, patch.nextSibling);
}

function getViewContainer(view) {
    const c = view?.container;
    if (typeof c === "string") return document.getElementById(c);
    return c;
}

let legendClearanceResizeObserver = null;
let legendClearanceObservedBar = null;

/**
 * Keeps the desktop flood-legend stack above the Esri attribution strip (height changes with text wrap).
 * @param {HTMLElement} viewRoot
 * @param {HTMLElement | null} mapWrap
 */
function updateLegendAttributionClearance(viewRoot, mapWrap) {
    if (!mapWrap) return;

    /** Space between attribution top and legend bottom (keep small; full bar height is measured separately). */
    const gapPx = 8;
    /** When the bar is not in the DOM yet — user asked for ~25px total reserve, not a large floor on measured height. */
    const fallbackClearancePx = 25;

    const setClearance = (px) => {
        mapWrap.style.setProperty("--map-attribution-clearance", `${Math.max(0, Math.round(px))}px`);
    };

    const bar = findAttributionBar(viewRoot);
    if (!bar) {
        setClearance(fallbackClearancePx);
        if (legendClearanceResizeObserver) {
            legendClearanceResizeObserver.disconnect();
            legendClearanceResizeObserver = null;
            legendClearanceObservedBar = null;
        }
        return;
    }

    const measure = () => {
        const raw = bar.getBoundingClientRect().height || bar.offsetHeight;
        const h = raw > 0 ? raw : fallbackClearancePx;
        setClearance(h + gapPx);
    };

    measure();

    if (typeof ResizeObserver === "undefined") return;

    if (bar !== legendClearanceObservedBar) {
        if (legendClearanceResizeObserver) {
            legendClearanceResizeObserver.disconnect();
        }
        legendClearanceObservedBar = bar;
        legendClearanceResizeObserver = new ResizeObserver(measure);
        legendClearanceResizeObserver.observe(bar);
    }
}

/** @param {{ container: string | HTMLElement }} view */
export function mountAppAttributionInMapBar(view) {
    const container = getViewContainer(view);
    if (!container) return;

    const mapWrap = container.closest(".map-view-wrap");

    const ensure = () => {
        const bar = findAttributionBar(container);
        if (bar) insertIntoBar(bar);
        updateLegendAttributionClearance(container, mapWrap);
    };

    ensure();

    let rafId = null;
    const scheduleEnsure = () => {
        if (rafId != null) return;
        rafId = requestAnimationFrame(() => {
            rafId = null;
            ensure();
        });
    };

    const obs = new MutationObserver(scheduleEnsure);
    obs.observe(container, { childList: true, subtree: true });
}
