/**
 * EduAdmin — Web Ads Controller (Adsterra)
 * Isolated web-only ad script so Play Store / native builds stay separate.
 */

(() => {
  "use strict";

  const isNativeWrapper =
    Boolean(window.cordova) ||
    Boolean(window.Capacitor?.isNativePlatform?.());

  if (isNativeWrapper) {
    return;
  }

  const AD_CONFIG = {
    banner320: {
      key: "c55f46f747823f8534f6dd9c28d121e4",
      format: "iframe",
      height: 50,
      width: 320,
      src: "https://bauval.org/22/c55f46f747823f8534f6dd9c28d121e4"
    },
    banner728: {
      key: "231050eeed07ce5e7ac15b388eaa68a6",
      format: "iframe",
      height: 90,
      width: 728,
      src: "https://bauval.org/22/231050eeed07ce5e7ac15b388eaa68a6"
    },
    banner300: {
      key: "164236ae4d2f91e9413afdb418c93fa7",
      format: "iframe",
      height: 250,
      width: 300,
      src: "https://bauval.org/22/164236ae4d2f91e9413afdb418c93fa7"
    },
    native: {
      containerId: "container-00cb086ca2507b64109b8345b75750f3",
      src: "https://bauval.org/21/00cb086ca2507b64109b8345b75750f3"
    }
  };

  function appendStandardBanner(target, cfg) {
    // Isolate each banner inside an iframe so multiple banners on one page don't overwrite window.atOptions
    const frame = document.createElement("iframe");
    frame.width = String(cfg.width);
    frame.height = String(cfg.height);
    frame.style.width = `${cfg.width}px`;
    frame.style.height = `${cfg.height}px`;
    frame.style.border = "0";
    frame.style.overflow = "hidden";
    frame.setAttribute("scrolling", "no");
    frame.setAttribute("frameborder", "0");
    frame.setAttribute("loading", "lazy");
    frame.title = "Advertisement";

    target.replaceChildren(frame);

    const doc = frame.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head><style>html,body{margin:0;padding:0;overflow:hidden;background:transparent;}</style></head>
        <body>
          <script>
            atOptions = {
              'key': '${cfg.key}',
              'format': '${cfg.format}',
              'height': ${cfg.height},
              'width': ${cfg.width},
              'params': {}
            };
          <\/script>
          <script data-cfasync="false" src="${cfg.src}"><\/script>
        </body>
      </html>
    `);
    doc.close();
  }

  function appendNativeBanner(target, instanceSuffix = "") {
    const containerDiv = document.createElement("div");
    containerDiv.id = instanceSuffix
      ? `${AD_CONFIG.native.containerId}-${instanceSuffix}`
      : AD_CONFIG.native.containerId;

    const script = document.createElement("script");
    script.async = true;
    script.setAttribute("fetchpriority", "high");
    script.setAttribute("data-cfasync", "false");
    script.src = AD_CONFIG.native.src;

    target.replaceChildren(script, containerDiv);
  }

  function renderSlot(slotEl) {
    if (!slotEl || slotEl.dataset.adRendered === "true") return;
    slotEl.dataset.adRendered = "true";

    const type = slotEl.dataset.adType;
    const inner = document.createElement("div");
    inner.className = "edu-ad-inner";

    if (type === "top-responsive") {
      const desktopBox = document.createElement("div");
      desktopBox.className = "edu-ad-desktop-728";
      appendStandardBanner(desktopBox, AD_CONFIG.banner728);

      const mobileBox = document.createElement("div");
      mobileBox.className = "edu-ad-mobile-320";
      appendStandardBanner(mobileBox, AD_CONFIG.banner320);

      inner.append(desktopBox, mobileBox);
      slotEl.replaceChildren(inner);
    } else if (type === "banner-300") {
      appendStandardBanner(inner, AD_CONFIG.banner300);
      slotEl.replaceChildren(inner);
    } else if (type === "native") {
      const suffix = slotEl.dataset.adSuffix || "";
      appendNativeBanner(inner, suffix);
      slotEl.replaceChildren(inner);
    }
  }

  function initPageAds() {
    document.querySelectorAll(".edu-ad-slot[data-ad-type]").forEach(renderSlot);
  }

  // Optional helper for loading screens / while fetching data
  window.EduAdminWebAds = {
    showLoadingAd(containerEl) {
      if (!containerEl || isNativeWrapper) return;
      containerEl.hidden = false;
      containerEl.classList.add("edu-ad-slot", "edu-ad-loading-box");
      if (containerEl.dataset.adRendered !== "true") {
        containerEl.dataset.adType = "banner-300";
        renderSlot(containerEl);
      }
    },
    hideLoadingAd(containerEl) {
      if (!containerEl) return;
      containerEl.hidden = true;
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPageAds, { once: true });
  } else {
    initPageAds();
  }
})();