const MOBILE_MQ = "(max-width: 767px)";

/**
 * Bottom sheet + collapsible legend for narrow viewports.
 * @param {{ onLayoutChange?: () => void }} [options] — e.g. call `MapView.resize()` when the map pane size changes.
 */
export function initMobileLayout(options = {}) {
    const { onLayoutChange } = options;
    const sidebar = document.getElementById("sidebar");
    const handle = document.getElementById("sidebar-sheet-handle");
    const backdrop = document.getElementById("mobile-sheet-backdrop");
    const legendStack = document.getElementById("flood-legend-stack");
    const legendToggle = document.getElementById("flood-legend-toggle");
    const mapEmbed = document.getElementById("map-embed-widgets-tl");
    const mapWrap = document.querySelector(".map-view-wrap");
    const homesHover = document.getElementById("homes-hover-popup");
    const mq = window.matchMedia(MOBILE_MQ);

    const isMobile = () => mq.matches;

    /** Mobile: legend control sits under basemap in the embed column. Desktop: bottom-left of map (sibling before homes hover). */
    function placeFloodLegendStack() {
        if (!legendStack || !mapEmbed || !mapWrap) return;
        if (isMobile()) {
            mapEmbed.appendChild(legendStack);
        } else if (homesHover && homesHover.parentNode === mapWrap) {
            mapWrap.insertBefore(legendStack, homesHover);
        } else {
            mapWrap.appendChild(legendStack);
        }
    }

    function notifyLayout() {
        requestAnimationFrame(() => {
            try {
                onLayoutChange?.();
            } catch {
                /* ignore */
            }
        });
    }

    /** No dimming overlay: it captured all pointer events and blocked the map above the sheet. */
    function hideBackdrop() {
        if (!backdrop) return;
        backdrop.hidden = true;
        backdrop.setAttribute("aria-hidden", "true");
    }

    function setSidebarExpanded(open) {
        sidebar?.classList.toggle("sidebar-sheet--expanded", open);
        handle?.setAttribute("aria-expanded", String(open));
        handle?.setAttribute("aria-label", open ? "Close map controls panel" : "Open map controls panel");
        hideBackdrop();
    }

    function closeSidebar() {
        setSidebarExpanded(false);
    }

    handle?.addEventListener("click", () => {
        if (!isMobile()) return;
        setSidebarExpanded(!sidebar?.classList.contains("sidebar-sheet--expanded"));
        notifyLayout();
        window.setTimeout(notifyLayout, 320);
    });

    legendToggle?.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!isMobile() || !legendStack) return;
        const open = legendStack.classList.toggle("flood-legend-stack--open");
        legendToggle.setAttribute("aria-expanded", String(open));
        notifyLayout();
        window.setTimeout(notifyLayout, 120);
    });

    document.addEventListener(
        "pointerdown",
        (e) => {
            if (!isMobile() || !legendStack?.classList.contains("flood-legend-stack--open")) return;
            if (legendStack.contains(e.target)) return;
            legendStack.classList.remove("flood-legend-stack--open");
            legendToggle?.setAttribute("aria-expanded", "false");
            notifyLayout();
        },
        true
    );

    document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        closeSidebar();
        if (isMobile() && legendStack?.classList.contains("flood-legend-stack--open")) {
            legendStack.classList.remove("flood-legend-stack--open");
            legendToggle?.setAttribute("aria-expanded", "false");
            notifyLayout();
        }
    });

    mq.addEventListener("change", () => {
        if (!isMobile()) {
            sidebar?.classList.remove("sidebar-sheet--expanded");
            handle?.setAttribute("aria-expanded", "false");
            handle?.setAttribute("aria-label", "Open map controls panel");
            legendStack?.classList.remove("flood-legend-stack--open");
            legendToggle?.setAttribute("aria-expanded", "false");
            hideBackdrop();
        }
        placeFloodLegendStack();
        notifyLayout();
    });

    placeFloodLegendStack();

    if (mapWrap && typeof ResizeObserver !== "undefined") {
        const ro = new ResizeObserver(() => notifyLayout());
        ro.observe(mapWrap);
    }

    hideBackdrop();
    notifyLayout();
}
