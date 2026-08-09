(() => {
  const setStatus = (control, message) => {
    const status = control.closest(".request-response-inspector")?.querySelector(".inspector-status");
    if (status) status.textContent = message;
  };

  document.querySelectorAll("[data-copy-target]").forEach((button) => {
    button.addEventListener("click", async () => {
      const target = document.getElementById(button.dataset.copyTarget ?? "");
      if (!target) return setStatus(button, "Copy failed: source not found.");
      try {
        await navigator.clipboard.writeText(target.textContent ?? "");
        setStatus(button, "Copied JSON.");
      } catch {
        setStatus(button, "Copy unavailable. Select the JSON text manually.");
      }
    });
  });

  document.querySelectorAll("[data-download-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = document.getElementById(button.dataset.downloadTarget ?? "");
      if (!target) return setStatus(button, "Download failed: source not found.");
      const filename = (button.dataset.filename ?? "honua-contract.json").replace(/[^a-z0-9._-]/giu, "-");
      const url = URL.createObjectURL(new Blob([`${target.textContent ?? ""}\n`], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setStatus(button, `Downloaded ${filename}.`);
    });
  });

  document.querySelectorAll(".job-language-section").forEach((section) => {
    const tabs = [...section.querySelectorAll('[role="tab"]')];
    const panels = [...section.querySelectorAll('[role="tabpanel"]')];
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((candidate) => {
          const selected = candidate === tab;
          candidate.setAttribute("aria-selected", String(selected));
          candidate.tabIndex = selected ? 0 : -1;
        });
        panels.forEach((panel) => {
          panel.hidden = panel.id !== tab.getAttribute("aria-controls");
        });
      });
    });
  });
})();
