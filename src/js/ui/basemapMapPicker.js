import { BASEMAP_SELECTOR_OPTIONS } from "../map/basemap.js";

const MOBILE_MQ = "(max-width: 767px)";

/** Esri Calcite icon font (see ArcGIS `main.css` — matches Home / Zoom widget glyphs). */
function createEsriBasemapIcon() {
    const span = document.createElement("span");
    span.className = "esri-icon esri-icon-basemap";
    span.setAttribute("aria-hidden", "true");
    return span;
}

function isMobileViewport() {
    return window.matchMedia(MOBILE_MQ).matches;
}

/**
 * Basemap control styled to sit with arcgis-home / arcgis-zoom (compact trigger + flyout menu).
 * @returns {{ destroy: () => void }}
 */
export function mountBasemapMapPicker(containerEl, { initialId, onSelect }) {
    if (!containerEl) {
        return { destroy() {} };
    }

    const validIds = new Set(BASEMAP_SELECTOR_OPTIONS.map((o) => o.id));
    const safeId = validIds.has(initialId) ? initialId : BASEMAP_SELECTOR_OPTIONS[0]?.id ?? "cartodb-positron";

    const wrap = document.createElement("div");
    wrap.className = "map-basemap-picker";

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "map-basemap-picker__trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-label", "Basemap");
    trigger.title = "Basemap";
    trigger.appendChild(createEsriBasemapIcon());

    const menu = document.createElement("div");
    menu.className = "map-basemap-picker__menu";
    menu.hidden = true;
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", "Basemaps");

    const mq = window.matchMedia(MOBILE_MQ);

    function setOptionSelected(id) {
        menu.querySelectorAll(".map-basemap-picker__option").forEach((btn) => {
            const sel = btn.dataset.basemapId === id;
            btn.setAttribute("aria-selected", sel ? "true" : "false");
        });
    }

    BASEMAP_SELECTOR_OPTIONS.forEach((opt) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "map-basemap-picker__option";
        btn.dataset.basemapId = opt.id;
        btn.setAttribute("role", "option");
        btn.textContent = opt.label;
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            onSelect(opt.id);
            setOptionSelected(opt.id);
            closeMenu();
            trigger.focus();
        });
        menu.appendChild(btn);
    });

    function resetMenuLayoutStyles() {
        menu.style.removeProperty("position");
        menu.style.removeProperty("left");
        menu.style.removeProperty("top");
        menu.style.removeProperty("right");
        menu.style.removeProperty("bottom");
        menu.style.removeProperty("transform");
        menu.style.removeProperty("width");
        menu.style.removeProperty("max-width");
        menu.style.removeProperty("min-width");
        menu.style.removeProperty("max-height");
    }

    /** Keep the flyout fully inside the visual viewport (narrow screens + left-edge trigger). */
    function syncMenuToViewport() {
        if (menu.hidden || !isMobileViewport()) {
            return;
        }

        const vv = window.visualViewport;
        const vw = vv?.width ?? window.innerWidth;
        const vh = vv?.height ?? window.innerHeight;
        const offsetLeft = vv?.offsetLeft ?? 0;
        const offsetTop = vv?.offsetTop ?? 0;

        const margin = 12;
        const tr = trigger.getBoundingClientRect();
        const menuW = Math.min(280, Math.max(160, vw - 2 * margin));
        const gap = 8;

        let left = tr.left + tr.width / 2 - menuW / 2;
        left = Math.max(offsetLeft + margin, Math.min(left, offsetLeft + vw - menuW - margin));

        const menuMaxHDefault = Math.min(360, Math.floor(vh * 0.55));
        let top = tr.bottom + gap;
        let maxH = Math.max(120, Math.min(menuMaxHDefault, offsetTop + vh - top - margin));

        menu.style.position = "fixed";
        menu.style.left = `${Math.round(left)}px`;
        menu.style.top = `${Math.round(top)}px`;
        menu.style.right = "auto";
        menu.style.bottom = "auto";
        menu.style.transform = "none";
        menu.style.width = `${Math.round(menuW)}px`;
        menu.style.maxWidth = `${Math.round(menuW)}px`;
        menu.style.minWidth = "0";
        menu.style.maxHeight = `${Math.round(maxH)}px`;

        void menu.offsetHeight;
        let mr = menu.getBoundingClientRect();

        if (mr.bottom > offsetTop + vh - margin) {
            const above = tr.top - mr.height - gap;
            if (above >= offsetTop + margin) {
                menu.style.top = `${Math.round(above)}px`;
                maxH = Math.max(120, Math.min(menuMaxHDefault, tr.top - offsetTop - margin - gap));
                menu.style.maxHeight = `${Math.round(maxH)}px`;
            } else {
                menu.style.top = `${Math.round(offsetTop + margin)}px`;
                menu.style.maxHeight = `${Math.round(Math.max(120, vh - 2 * margin))}px`;
            }
            void menu.offsetHeight;
            mr = menu.getBoundingClientRect();
        }

        if (mr.right > offsetLeft + vw - margin) {
            const shift = mr.right - (offsetLeft + vw - margin);
            left = Math.max(offsetLeft + margin, left - shift);
            menu.style.left = `${Math.round(left)}px`;
        }
        if (mr.left < offsetLeft + margin) {
            left = offsetLeft + margin;
            menu.style.left = `${Math.round(left)}px`;
        }
    }

    function openMenu() {
        menu.hidden = false;
        trigger.setAttribute("aria-expanded", "true");
        if (isMobileViewport()) {
            requestAnimationFrame(() => {
                syncMenuToViewport();
                void menu.offsetHeight;
                syncMenuToViewport();
            });
        } else {
            resetMenuLayoutStyles();
        }
    }

    function closeMenu() {
        menu.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
        resetMenuLayoutStyles();
    }

    trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        if (menu.hidden) {
            requestAnimationFrame(() => {
                openMenu();
            });
        } else {
            closeMenu();
        }
    });

    const onDocPointerDown = (e) => {
        if (menu.hidden) {
            return;
        }
        if (!wrap.contains(e.target)) {
            closeMenu();
        }
    };

    const onKey = (e) => {
        if (e.key === "Escape" && !menu.hidden) {
            closeMenu();
            trigger.focus();
        }
    };

    const onWinResize = () => {
        if (!menu.hidden && isMobileViewport()) {
            syncMenuToViewport();
        }
    };

    const onVvResize = () => {
        if (!menu.hidden && isMobileViewport()) {
            syncMenuToViewport();
        }
    };

    const onMqChange = () => {
        if (!isMobileViewport()) {
            resetMenuLayoutStyles();
        } else if (!menu.hidden) {
            syncMenuToViewport();
        }
    };

    document.addEventListener("pointerdown", onDocPointerDown, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onWinResize);
    mq.addEventListener("change", onMqChange);
    if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", onVvResize);
        window.visualViewport.addEventListener("scroll", onVvResize);
    }

    wrap.appendChild(trigger);
    wrap.appendChild(menu);
    containerEl.appendChild(wrap);

    setOptionSelected(safeId);

    return {
        destroy() {
            document.removeEventListener("pointerdown", onDocPointerDown, true);
            document.removeEventListener("keydown", onKey);
            window.removeEventListener("resize", onWinResize);
            mq.removeEventListener("change", onMqChange);
            if (window.visualViewport) {
                window.visualViewport.removeEventListener("resize", onVvResize);
                window.visualViewport.removeEventListener("scroll", onVvResize);
            }
            wrap.remove();
        }
    };
}
