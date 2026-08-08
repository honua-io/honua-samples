(function () {
  var candidates = [
    "src/main.ts",
    "src/index.ts",
    "src/app.ts",
    "src/main.js",
    "src/index.js",
    "main.ts",
    "index.ts",
    "index.html",
    "README.md"
  ];

  async function load(panel) {
    var root = panel.getAttribute("data-source-root");
    var sourcePath = panel.getAttribute("data-source-path");
    var name = panel.querySelector("[data-source-name]");
    var code = panel.querySelector("[data-source-code]");
    var note = panel.querySelector("[data-source-note]");

    for (var i = 0; i < candidates.length; i++) {
      var path = candidates[i];
      try {
        var response = await fetch(root + "/" + path);
        if (!response.ok) continue;
        var text = await response.text();
        if (!text.trim()) continue;
        name.textContent = path;
        code.textContent = text;
        if (path === "README.md") note.textContent = "No conventional primary source file was found; showing the producer README instead.";
        return;
      } catch {
        break;
      }
    }

    if (sourcePath) {
      for (var j = 0; j < 2; j++) {
        var directory = j === 0 ? sourcePath + "/src" : sourcePath;
        try {
          var listingResponse = await fetch(
            "https://api.github.com/repos/honua-io/honua-sdk-js/contents/" + directory + "?ref=trunk",
            { headers: { Accept: "application/vnd.github+json" } }
          );
          if (!listingResponse.ok) continue;
          var listing = await listingResponse.json();
          var file = listing.find(function (entry) {
            return entry.type === "file" && /\.(tsx?|jsx?|html|css)$/.test(entry.name);
          });
          if (!file || !file.download_url) continue;
          var fileResponse = await fetch(file.download_url);
          if (!fileResponse.ok) continue;
          name.textContent = (j === 0 ? "src/" : "") + file.name;
          code.textContent = await fileResponse.text();
          note.textContent = "Primary source selected from the producer directory. This preview follows trunk.";
          return;
        } catch {
          break;
        }
      }
    }

    name.textContent = "Source preview unavailable";
    code.textContent = "The producer did not expose a conventional primary file at this path. Use Full tree to inspect the repository.";
    note.textContent = "The runnable build and repository source remain separate provenance surfaces.";
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".remote-code[data-source-root]").forEach(load);
  });
})();
