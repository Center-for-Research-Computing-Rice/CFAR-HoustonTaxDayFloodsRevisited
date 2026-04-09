import { BASEMAP_SELECTOR_OPTIONS } from "../map/basemap.js";

/** Esri Calcite icon font (see ArcGIS `main.css` — matches Home / Zoom widget glyphs). */
function createEsriBasemapIcon() {
    const span = document.createElement("span");
    span.className = "esri-icon esri-icon-basemap";
    span.setAttribute("aria-hidden", "true");
    return span;
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

    function openMenu() {
        menu.hidden = false;
        trigger.setAttribute("aria-expanded", "true");
    }

    function closeMenu() {
        menu.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
    }

    trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        if (menu.hidden) {
            openMenu();
        } else {
            closeMenu();
        }
    });

    const onDocPointerDown = (e) => {
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

    document.addEventListener("pointerdown", onDocPointerDown, true);
    document.addEventListener("keydown", onKey);

    wrap.appendChild(trigger);
    wrap.appendChild(menu);
    containerEl.appendChild(wrap);

    setOptionSelected(safeId);

    return {
        destroy() {
            document.removeEventListener("pointerdown", onDocPointerDown, true);
            document.removeEventListener("keydown", onKey);
            wrap.remove();
        }
    };
}
