export function positionTipBubble(wrap) {
    const btn = wrap.querySelector(".tip-trigger");
    const bubble = wrap.querySelector(".tip-bubble");
    if (!btn || !bubble) {
        return;
    }
    const br = btn.getBoundingClientRect();
    const margin = 8;
    const gap = 6;
    const mapWrap = document.querySelector(".map-view-wrap");
    const boundToMap = wrap.classList.contains("tip-wrap--map-bounded");

    let maxW = wrap.classList.contains("tip-wrap--wide") ? 380 : 252;
    if (boundToMap && mapWrap) {
        const mr = mapWrap.getBoundingClientRect();
        maxW = Math.min(maxW, Math.max(160, mr.width - 2 * margin));
    }
    const w = Math.min(maxW, window.innerWidth - 2 * margin);

    let minLeft = margin;
    let maxLeft = window.innerWidth - margin - w;
    let minTop = margin;
    let maxBottom = window.innerHeight - margin;

    if (boundToMap && mapWrap) {
        const mr = mapWrap.getBoundingClientRect();
        minLeft = mr.left + margin;
        maxLeft = mr.right - margin - w;
        minTop = mr.top + margin;
        maxBottom = mr.bottom - margin;
    }

    if (maxLeft < minLeft) {
        maxLeft = minLeft;
    }

    let left = br.right - w;
    left = Math.max(minLeft, Math.min(left, maxLeft));

    bubble.style.width = `${w}px`;
    if (boundToMap) {
        const vertAvail = Math.max(120, maxBottom - minTop - gap);
        bubble.style.maxHeight = `${Math.min(560, vertAvail)}px`;
    } else {
        bubble.style.maxHeight = "";
    }

    let top = br.bottom + gap;
    bubble.style.left = `${left}px`;
    bubble.style.top = `${top}px`;
    const h = bubble.offsetHeight;

    if (top + h > maxBottom) {
        top = br.top - h - gap;
    }
    top = Math.max(minTop, Math.min(top, maxBottom - h));
    if (top < minTop) {
        top = minTop;
    }
    bubble.style.top = `${top}px`;
}

function repositionVisibleTips() {
    document.querySelectorAll(".tip-wrap").forEach((wrap) => {
        if (wrap.matches(":hover") || wrap.classList.contains("has-open-tip")) {
            positionTipBubble(wrap);
        }
    });
}

export function initHelpTooltips() {
    document.querySelectorAll(".tip-wrap").forEach((wrap) => {
        const btn = wrap.querySelector(".tip-trigger");
        if (!btn) {
            return;
        }

        wrap.addEventListener("mouseenter", () => {
            positionTipBubble(wrap);
        });
        wrap.addEventListener("focusin", () => {
            positionTipBubble(wrap);
        });

        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const wasOpen = wrap.classList.contains("has-open-tip");
            document.querySelectorAll(".tip-wrap.has-open-tip").forEach((w) => {
                w.classList.remove("has-open-tip");
                w.querySelector(".tip-trigger")?.setAttribute("aria-expanded", "false");
            });
            if (!wasOpen) {
                positionTipBubble(wrap);
                wrap.classList.add("has-open-tip");
                btn.setAttribute("aria-expanded", "true");
            }
        });
    });

    document.addEventListener("click", (e) => {
        if (!e.target.closest(".tip-wrap")) {
            document.querySelectorAll(".tip-wrap.has-open-tip").forEach((w) => {
                w.classList.remove("has-open-tip");
                w.querySelector(".tip-trigger")?.setAttribute("aria-expanded", "false");
            });
        }
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            document.querySelectorAll(".tip-wrap.has-open-tip").forEach((w) => {
                w.classList.remove("has-open-tip");
                w.querySelector(".tip-trigger")?.setAttribute("aria-expanded", "false");
            });
        }
    });

    window.addEventListener("resize", repositionVisibleTips);
    document.addEventListener("scroll", repositionVisibleTips, true);
}
