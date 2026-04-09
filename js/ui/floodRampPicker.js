import { FLOOD_RASTER_RAMPS, FLOOD_RAMP_IDS_ORDERED } from "../flood/colorRamp.js";

function stopsToLinearGradientCSS(stops) {
    const sorted = [...stops].sort((a, b) => a.t - b.t);
    const parts = sorted.map((s) => {
        const pct = Math.round(Math.max(0, Math.min(1, s.t)) * 100);
        return `rgb(${s.r},${s.g},${s.b}) ${pct}%`;
    });
    return `linear-gradient(to right, ${parts.join(", ")})`;
}

/**
 * Text-free ramp control: trigger and menu show horizontal gradient bars only.
 * @returns {{ setValue: (id: string) => void, destroy: () => void }}
 */
export function mountFloodRampPicker(containerEl, { initialId, onChange }) {
    if (!containerEl) {
        return {
            setValue: () => {},
            destroy: () => {}
        };
    }

    const rampIds = FLOOD_RAMP_IDS_ORDERED.filter((id) => FLOOD_RASTER_RAMPS[id]);

    const wrap = document.createElement("div");
    wrap.className = "flood-ramp-picker";

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "flood-ramp-picker__trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-label", "Flood raster color ramp");

    const triggerRow = document.createElement("span");
    triggerRow.className = "flood-ramp-picker__trigger-row";

    const triggerBar = document.createElement("span");
    triggerBar.className = "flood-ramp-picker__trigger-bar";

    const chevron = document.createElement("span");
    chevron.className = "flood-ramp-picker__chevron";
    chevron.setAttribute("aria-hidden", "true");

    triggerRow.appendChild(triggerBar);
    triggerRow.appendChild(chevron);
    trigger.appendChild(triggerRow);

    const menu = document.createElement("div");
    menu.className = "flood-ramp-picker__menu";
    menu.hidden = true;
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", "Color ramps");

    function updateTriggerGradient(id) {
        const ramp = FLOOD_RASTER_RAMPS[id];
        if (ramp?.stops) {
            triggerBar.style.backgroundImage = stopsToLinearGradientCSS(ramp.stops);
        }
    }

    function setOptionSelected(id) {
        menu.querySelectorAll(".flood-ramp-picker__option").forEach((btn) => {
            const sel = btn.dataset.rampId === id;
            btn.setAttribute("aria-selected", sel ? "true" : "false");
        });
    }

    rampIds.forEach((id) => {
        const ramp = FLOOD_RASTER_RAMPS[id];
        const opt = document.createElement("button");
        opt.type = "button";
        opt.className = "flood-ramp-picker__option";
        opt.dataset.rampId = id;
        opt.setAttribute("role", "option");
        opt.setAttribute("aria-label", ramp?.label ?? id);
        const bar = document.createElement("span");
        bar.className = "flood-ramp-picker__option-bar";
        if (ramp?.stops) {
            bar.style.backgroundImage = stopsToLinearGradientCSS(ramp.stops);
        }
        opt.appendChild(bar);
        opt.addEventListener("click", (e) => {
            e.stopPropagation();
            onChange(id);
            updateTriggerGradient(id);
            setOptionSelected(id);
        });
        menu.appendChild(opt);
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

    /** Capture phase so outside taps (e.g. map canvas) still close even if click doesn’t bubble. */
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

    const safeId = FLOOD_RASTER_RAMPS[initialId] ? initialId : rampIds[0];
    updateTriggerGradient(safeId);
    setOptionSelected(safeId);

    return {
        setValue(id) {
            if (!FLOOD_RASTER_RAMPS[id]) {
                return;
            }
            updateTriggerGradient(id);
            setOptionSelected(id);
            closeMenu();
        },
        destroy() {
            document.removeEventListener("pointerdown", onDocPointerDown, true);
            document.removeEventListener("keydown", onKey);
            wrap.remove();
        }
    };
}
