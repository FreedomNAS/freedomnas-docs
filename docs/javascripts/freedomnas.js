(function () {
  var context;
  try {
    context = JSON.parse(localStorage.getItem("fnas_docs_context") || "null");
  } catch (e) {
    context = null;
  }
  if (!context) return;

  var meta = document.querySelector('meta[name="freedomnas-docs-version"]');
  var docsVersion = meta ? meta.content : "";

  function release(version) {
    return String(version).split("+")[0];
  }

  function matches(label, wanted) {
    var text = label.textContent.trim().toLowerCase();
    return wanted.some(function (w) {
      return text === w || text.split("/")[0] === w;
    });
  }

  function selectTabs() {
    var wanted = [context.init_system, context.firmware, context.edition]
      .filter(Boolean)
      .map(function (w) { return String(w).toLowerCase(); });
    document.querySelectorAll(".tabbed-set").forEach(function (set) {
      set.querySelectorAll(".tabbed-labels > label").forEach(function (label) {
        if (!matches(label, wanted)) return;
        var input = document.getElementById(label.htmlFor);
        if (input) input.checked = true;
      });
    });
  }

  function showBanner() {
    var article = document.querySelector("article.md-content__inner");
    if (!article || document.getElementById("fnas-context")) return;
    var differs = context.version && docsVersion && release(context.version) !== release(docsVersion);

    var box = document.createElement("div");
    box.id = "fnas-context";
    box.className = "admonition " + (differs ? "warning" : "info");
    var title = document.createElement("p");
    title.className = "admonition-title";
    var system = [context.edition, context.init_system, context.firmware].filter(Boolean).join(" · ");
    title.textContent = "This system: FreedomNAS " + (context.version || "(version unknown)") +
      (system ? " — " + system : "");
    var body = document.createElement("p");
    body.textContent = differs
      ? "This documentation is for FreedomNAS " + docsVersion + ", another release than the one running here."
      : "This documentation is for FreedomNAS " + (docsVersion || "(version unknown)") + ".";
    box.appendChild(title);
    box.appendChild(body);
    article.insertBefore(box, article.firstChild);
  }

  function apply() {
    showBanner();
    selectTabs();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply);
  } else {
    apply();
  }
})();
