// Portfolio Analytics tracker: sends one updating record per visit to the Google Sheet backend.
// Stores country/city (no IP address), device, traffic source, time per section, videos played, and contact clicks.
(() => {
  const ENDPOINT = ""; // Google Apps Script web app URL; tracking stays off while this is empty

  const store = (() => { try { return window.localStorage; } catch { return null; } })();
  if (!ENDPOINT || location.protocol === "file:" || store?.getItem("pa_ignore") === "1") return;

  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  let visitorId = store?.getItem("pa_visitor");
  if (!visitorId) { visitorId = uid(); try { store?.setItem("pa_visitor", visitorId); } catch {} }

  const ua = navigator.userAgent;
  const isIPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const device = isIPad || /Tablet|PlayBook|Silk/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) ? "Tablet"
    : /Mobi|iPhone|iPod|Android/.test(ua) ? "Mobile" : "Desktop";
  const os = isIPad ? "iPadOS" : /iPhone|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows"
    : /CrOS/.test(ua) ? "ChromeOS" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Other";
  const browser = /FBAN|FBAV/.test(ua) ? "Facebook app" : /Instagram/.test(ua) ? "Instagram app" : /LinkedInApp/.test(ua) ? "LinkedIn app"
    : /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung Internet"
    : /CriOS|Chrome\//.test(ua) ? "Chrome" : /FxiOS|Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Other";

  // Source: a ?from= / utm_source tag wins, then the referring site, then in-app browsers, else Direct
  const params = new URLSearchParams(location.search);
  const tag = params.get("from") || params.get("utm_source") || params.get("ref");
  const refHost = (() => { try { return document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, "") : ""; } catch { return ""; } })();
  const KNOWN = [[/upwork/, "Upwork"], [/linkedin|lnkd\.in/, "LinkedIn"], [/facebook|fb\.com|fb\.me/, "Facebook"], [/instagram/, "Instagram"],
    [/^t\.co$|twitter|^x\.com/, "X (Twitter)"], [/google\./, "Google"], [/bing\./, "Bing"], [/youtube|youtu\.be/, "YouTube"],
    [/whatsapp|wa\.me/, "WhatsApp"], [/canva/, "Canva"], [/github/, "GitHub"], [/mail\.|outlook/, "Email"]];
  const named = (s) => (KNOWN.find(([re]) => re.test(s.toLowerCase())) || [])[1];
  const source = tag ? (named(tag) || tag.slice(0, 40))
    : refHost && refHost !== location.hostname ? (named(refHost) || refHost)
    : /FBAN|FBAV/.test(ua) ? "Facebook" : /Instagram/.test(ua) ? "Instagram" : /LinkedInApp/.test(ua) ? "LinkedIn" : "Direct";

  const visit = {
    visitId: uid(), visitorId, device, os, browser, source,
    screen: `${screen.width}x${screen.height}`,
    referrer: document.referrer.slice(0, 300),
    landing: location.href.slice(0, 300),
    country: "", city: "", duration: 0, sections: {}, videos: [], clicks: [],
  };

  // Time on each section, counted only while the tab is visible and the section fills a good part of the screen
  const SECTIONS = [[".hero", "Home"], [".brands", "Brands"], ["#services", "Services"], ["#work", "Projects"],
    ["#tools", "Tools"], ["#about", "About Me"], ["#certifications", "Certifications"], ["#contact", "Contact"]];
  const inView = new Set();
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    const name = e.target.dataset.paSection;
    const enough = e.intersectionRect.height >= Math.min(innerHeight * 0.4, e.boundingClientRect.height * 0.5);
    if (e.isIntersecting && enough) inView.add(name); else inView.delete(name);
  }), { threshold: [0, 0.1, 0.25, 0.4, 0.5, 0.75, 1] });
  SECTIONS.forEach(([sel, name]) => {
    const el = document.querySelector(sel);
    if (el) { el.dataset.paSection = name; visit.sections[name] = 0; io.observe(el); }
  });

  let dirty = true;
  setInterval(() => {
    if (document.visibilityState !== "visible") return;
    visit.duration++;
    inView.forEach((name) => { visit.sections[name]++; });
    dirty = true;
  }, 1000);

  document.querySelectorAll(".media video").forEach((v) => {
    v.addEventListener("play", () => {
      const name = v.dataset.title || v.getAttribute("src");
      if (!visit.videos.includes(name)) { visit.videos.push(name); send(); }
    });
  });
  const CLICKS = [['a[href^="https://mail.google.com"]', "Gmail"], ['a[href^="mailto:"]', "Email app"], [".wa-link", "WhatsApp"]];
  document.addEventListener("click", (e) => {
    const hit = CLICKS.find(([sel]) => e.target.closest(sel));
    if (hit && !visit.clicks.includes(hit[1])) { visit.clicks.push(hit[1]); send(); }
  });

  function send() {
    dirty = false;
    const body = JSON.stringify(visit);
    if (!(navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "text/plain" })))) {
      fetch(ENDPOINT, { method: "POST", body, mode: "no-cors", keepalive: true }).catch(() => {});
    }
  }

  // Look up the country first (short timeout) so even very short visits are recorded with it
  const geo = fetch("https://get.geojs.io/v1/ip/geo.json")
    .then((r) => r.json())
    .then((g) => { visit.country = g.country || ""; visit.city = g.city || ""; })
    .catch(() => {});
  Promise.race([geo, new Promise((r) => setTimeout(r, 2500))]).then(send);

  setInterval(() => { if (dirty) send(); }, 15000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") send(); });
  addEventListener("pagehide", send);
})();
