/**
 * EduAdmin — Centralized Web Ads Controller
 * Adsterra: 7 unique ad units
 * No automatic ad refresh or rotation.
 */

(() => {
  "use strict";

  const isNativeWrapper =
    Boolean(window.cordova) ||
    Boolean(window.Capacitor?.isNativePlatform?.());

  if (isNativeWrapper) return;

  // ==========================================
  // AD UNIT CONFIGURATION
  // ==========================================

  const AD_CONFIG = {

    native: {
      type: "native",
      containerId: "container-00cb086ca2507b64109b8345b75750f3",
      src: "https://bauval.org/21/00cb086ca2507b64109b8345b75750f3"
    },

    banner320: {
      type: "banner",
      key: "c55f46f747823f8534f6dd9c28d121e4",
      format: "iframe",
      height: 50,
      width: 320,
      src: "https://bauval.org/22/c55f46f747823f8534f6dd9c28d121e4"
    },

    banner728: {
      type: "banner",
      key: "231050eeed07ce5e7ac15b388eaa68a6",
      format: "iframe",
      height: 90,
      width: 728,
      src: "https://bauval.org/22/231050eeed07ce5e7ac15b388eaa68a6"
    },

    banner300: {
      type: "banner",
      key: "164236ae4d2f91e9413afdb418c93fa7",
      format: "iframe",
      height: 250,
      width: 300,
      src: "https://bauval.org/22/164236ae4d2f91e9413afdb418c93fa7"
    },

    banner468: {
      type: "banner",
      key: "20deddc2c273c54f7f261a1977f9fdf2",
      format: "iframe",
      height: 60,
      width: 468,
      src: "https://bauval.org/22/20deddc2c273c54f7f261a1977f9fdf2"
    },

    banner160300: {
      type: "banner",
      key: "503957ebbc8faa38f65f80cf7e2df89d",
      format: "iframe",
      height: 300,
      width: 160,
      src: "https://bauval.org/22/503957ebbc8faa38f65f80cf7e2df89d"
    },

    banner160600: {
      type: "banner",
      key: "2b899df40c97066231841f71f54edb74",
      format: "iframe",
      height: 600,
      width: 160,
      src: "https://bauval.org/22/2b899df40c97066231841f71f54edb74"
    }

    // Add future ad units here.
  };

  // ==========================================
  // HTML AD TYPE MAPPING
  // ==========================================

  const AD_TYPES = {
    "native": "native",

    "header-banner-320": "banner320",
    "bottom-right-320": "banner320",
    "banner-320": "banner320",

    "top-banner-728": "banner728",
    "banner-728": "banner728",

    "bottom-left-300": "banner300",
    "banner-300": "banner300",

    "banner-468": "banner468",
    "banner-160-300": "banner160300",
    "banner-160-600": "banner160600"

    // Add future HTML identifiers here.
  };

  // ==========================================
  // DUPLICATE PREVENTION
  // ==========================================

  const loadedAdUnits = new Set();

  // ==========================================
  // SEQUENTIAL BANNER LOADING
  // ==========================================

  const bannerQueue = [];
  let isProcessingQueue = false;

  function processNextBanner() {

    if (isProcessingQueue || bannerQueue.length === 0) {
      return;
    }

    isProcessingQueue = true;

    const { target, cfg, slot } = bannerQueue.shift();

    target.replaceChildren();

    target.style.width = `${cfg.width}px`;
    target.style.height = `${cfg.height}px`;
    target.style.maxWidth = "100%";

    window.atOptions = {
      key: cfg.key,
      format: cfg.format,
      height: cfg.height,
      width: cfg.width,
      params: {}
    };

    const invokeScript = document.createElement("script");

    invokeScript.async = true;
    invokeScript.setAttribute("data-cfasync", "false");
    invokeScript.src = cfg.src;

    const finishItem = () => {
      setTimeout(() => {
        isProcessingQueue = false;
        processNextBanner();
      }, 150);
    };

    invokeScript.addEventListener("load", finishItem, {
      once: true
    });

    invokeScript.addEventListener("error", () => {

      slot.hidden = true;
      slot.dataset.adStatus = "error";

      finishItem();

    }, {
      once: true
    });

    target.appendChild(invokeScript);
  }

  function queueStandardBanner(target, cfg, slot) {

    bannerQueue.push({
      target,
      cfg,
      slot
    });

    processNextBanner();
  }

  // ==========================================
  // NATIVE AD LOADER
  // ==========================================

  function appendNativeBanner(target, cfg) {

    const containerDiv = document.createElement("div");

    containerDiv.id = cfg.containerId;
    containerDiv.style.width = "100%";

    const script = document.createElement("script");

    script.async = true;
    script.setAttribute("fetchpriority", "high");
    script.setAttribute("data-cfasync", "false");
    script.src = cfg.src;

    script.addEventListener("error", () => {

      target.hidden = true;
      target.dataset.adStatus = "error";

    }, {
      once: true
    });

    target.replaceChildren(containerDiv, script);
  }

  // ==========================================
  // AD FORMAT HANDLERS
  // ==========================================

  const AD_HANDLERS = {

    native(slot, cfg) {
      appendNativeBanner(slot, cfg);
    },

    banner(slot, cfg) {

      const bannerBox = document.createElement("div");

      bannerBox.className = "edu-ad-banner-content";

      slot.replaceChildren(bannerBox);

      queueStandardBanner(bannerBox, cfg, slot);
    }

    // Future formats can be added here.
    // Example: Smart Links or other supported formats.
  };

  // ==========================================
  // RENDER AD SLOT
  // ==========================================

  function renderSlot(slotEl) {

    if (
      !slotEl ||
      slotEl.hidden ||
      slotEl.dataset.adRendered === "true"
    ) {
      return;
    }

    const adType = slotEl.dataset.adType;
    const configName = AD_TYPES[adType];
    const cfg = AD_CONFIG[configName];

    if (!cfg) {
      console.warn("EduAdmin Ads: Unknown ad type:", adType);
      return;
    }

    const handler = AD_HANDLERS[cfg.type];

    if (!handler) {
      console.warn("EduAdmin Ads: Unsupported format:", cfg.type);
      return;
    }

    // Do not request advertisements hidden by CSS.

    if (slotEl.getClientRects().length === 0 &&
        getComputedStyle(slotEl).display !== "none") {
      return;
    }

    // Avoid loading banners that cannot fit the screen.

    if (cfg.type === "banner") {

      const parent = slotEl.parentElement;

      if (parent) {

        const style = getComputedStyle(parent);

        const availableWidth =
          parent.clientWidth -
          parseFloat(style.paddingLeft || 0) -
          parseFloat(style.paddingRight || 0);

        if (availableWidth < cfg.width) {
          slotEl.hidden = true;
          return;
        }
      }
    }

    const uniqueId = cfg.key || cfg.containerId;

    // Prevent the same Adsterra unit appearing twice.

    if (loadedAdUnits.has(uniqueId)) {

      slotEl.hidden = true;
      slotEl.dataset.adStatus = "duplicate";

      console.warn(
        "EduAdmin Ads: Duplicate ad unit skipped:",
        adType
      );

      return;
    }

    loadedAdUnits.add(uniqueId);

    slotEl.dataset.adRendered = "true";
    slotEl.dataset.adStatus = "requested";

    slotEl.setAttribute("aria-label", "Advertisement");

    handler(slotEl, cfg);
  }

  // ==========================================
  // INITIALIZE PAGE ADS
  // ==========================================

  function initPageAds() {

    document
      .querySelectorAll(".edu-ad-slot[data-ad-type]")
      .forEach(renderSlot);
  }

  // ==========================================
  // PUBLIC ADS CONTROLLER
  // ==========================================

  window.EduAdminWebAds = {

    init: initPageAds,

    renderSlot,

    showLoadingAd(containerEl) {

      if (!containerEl || isNativeWrapper) return;

      if (containerEl.dataset.adStatus === "duplicate" ||
          containerEl.dataset.adStatus === "error") {
        return;
      }

      containerEl.hidden = false;

      containerEl.classList.add(
        "edu-ad-slot",
        "edu-ad-loading-box"
      );

      if (containerEl.dataset.adRendered !== "true") {

        containerEl.dataset.adType = "bottom-left-300";

        renderSlot(containerEl);
      }
    },

    hideLoadingAd(containerEl) {

      if (!containerEl) return;

      containerEl.hidden = true;
    }
  };

  // ==========================================
  // START ADS ON PAGE LOAD
  // ==========================================

  if (document.readyState === "loading") {

    document.addEventListener(
      "DOMContentLoaded",
      initPageAds,
      { once: true }
    );

  } else {

    initPageAds();
  }

})();