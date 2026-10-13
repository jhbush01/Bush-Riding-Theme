// Client-side filtering over the in-memory FeatureCollection.
// Pure-ish: setupFilters() wires the DOM controls and calls onChange()
// whenever any control moves. applyFilters() does the actual filtering.
//
// State + Region dropdowns are built live from the routes actually present, so
// the options can never drift out of sync with the data (no manual list to
// keep in step). Region narrows to the selected state.

const state = {
  maxDistance: 200, // km; 200 == "any" (slider max)
  usState: "", // AU state/territory (e.g. "QLD")
  region: "",
  difficulty: null, // "groomed" | "rocky" | "proper-mud"
  query: "", // route-name search, already lowercased
};

const SLIDER_MAX = 200;

// Legacy easy/moderate/hard rows map onto the new terrain vocabulary so old and
// new submissions filter together.
const TERRAIN_ALIAS = { easy: "groomed", moderate: "rocky", hard: "proper-mud" };
function terrainSlug(v) {
  const s = String(v || "").toLowerCase();
  return TERRAIN_ALIAS[s] || s;
}

export function applyFilters(features) {
  return features.filter((f) => {
    const p = f.properties;
    if (p.status && p.status !== "published") return false;
    if (state.maxDistance < SLIDER_MAX && p.distance_km > state.maxDistance) return false;
    if (state.usState && (p.state || "") !== state.usState) return false;
    if (state.region && p.region !== state.region) return false;
    if (state.difficulty && terrainSlug(p.terrain_difficulty) !== state.difficulty) return false;
    if (state.query) {
      // Every word must land somewhere, in any field: "rail qld" finds the
      // Brisbane Valley Rail Trail, "snowy" finds routes by name or region.
      const text = searchText(p);
      if (!state.query.split(/\s+/).every((w) => text.includes(w))) return false;
    }
    return true;
  });
}

// What the search box matches against: the route name, its region, and its
// state as both the code on the data ("QLD") and the name people actually
// type ("Queensland").
const STATE_NAMES = {
  ACT: "australian capital territory", NSW: "new south wales", NT: "northern territory",
  QLD: "queensland", SA: "south australia", TAS: "tasmania", VIC: "victoria", WA: "western australia",
};
function searchText(p) {
  const st = String(p.state || "");
  return [p.name, p.region, st, STATE_NAMES[st.toUpperCase()]].filter(Boolean).join(" ").toLowerCase();
}

export function getState() {
  return { ...state };
}

// How many panel filters are on (search excluded — it's always on screen).
function activeCount() {
  return (state.maxDistance < SLIDER_MAX) + !!state.usState + !!state.region + !!state.difficulty;
}

export function setupFilters(features, onChangeOuter) {
  // Every control change also refreshes the count pill on the folded
  // "Filters" row, so a narrowed list is never mistaken for a short one.
  const badge = document.getElementById("filters-active");
  const renderActive = () => {
    if (!badge) return;
    const n = activeCount();
    badge.hidden = !n;
    badge.textContent = String(n);
    badge.setAttribute("aria-label", `${n} filter${n === 1 ? "" : "s"} on`);
  };
  const onChange = () => {
    renderActive();
    onChangeOuter();
  };
  const stateSel = document.getElementById("f-state");
  const regionSel = document.getElementById("f-region");

  // Distinct states present in the data.
  const states = [...new Set(features.map((f) => f.properties.state).filter(Boolean))].sort();
  for (const s of states) {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    stateSel.appendChild(opt);
  }

  // Rebuild the region options for the currently selected state (or all).
  const fillRegions = () => {
    const scoped = features.filter((f) => !state.usState || (f.properties.state || "") === state.usState);
    const regions = [...new Set(scoped.map((f) => f.properties.region).filter(Boolean))].sort();
    regionSel.innerHTML = '<option value="">All regions</option>';
    for (const r of regions) {
      const opt = document.createElement("option");
      opt.value = r;
      opt.textContent = r;
      regionSel.appendChild(opt);
    }
    // Keep the current region only if it's still valid under the new state.
    if (state.region && !regions.includes(state.region)) state.region = "";
    regionSel.value = state.region;
  };
  fillRegions();

  // Search — route name, case-insensitive substring. Filters the map pins
  // too (applyFilters feeds both), so a typed name narrows the whole view,
  // not just the list underneath it.
  const search = document.getElementById("f-search");
  const searchClear = document.getElementById("f-search-clear");
  const renderSearchClear = () => { searchClear.hidden = !search.value; };
  // One refresh per frame, however fast the typing: each refresh rewrites the
  // list and the map's pin source, so coalescing keystrokes keeps it instant.
  let searchFrame = 0;
  const applySearch = () => {
    state.query = search.value.trim().toLowerCase();
    renderSearchClear();
    cancelAnimationFrame(searchFrame);
    searchFrame = requestAnimationFrame(onChange);
  };
  search.addEventListener("input", applySearch);
  search.addEventListener("keydown", (e) => {
    // Results are already live, so Enter has nothing left to do except get
    // the phone keyboard out of the way of them.
    if (e.key === "Enter") {
      e.preventDefault();
      search.blur();
    } else if (e.key === "Escape" && search.value) {
      e.preventDefault();
      search.value = "";
      applySearch();
    }
  });
  searchClear.addEventListener("click", () => {
    search.value = "";
    applySearch();
    search.focus();
  });

  // Nothing in the filter panel is a real form submission. Without this,
  // Enter in any field submitted it and reloaded the whole page.
  const form = document.getElementById("filters");
  if (form) form.addEventListener("submit", (e) => e.preventDefault());

  // Distance slider
  const dist = document.getElementById("f-distance");
  const distVal = document.getElementById("f-distance-val");
  const renderDist = () => {
    state.maxDistance = Number(dist.value);
    distVal.textContent =
      state.maxDistance >= SLIDER_MAX ? "any" : `up to ${state.maxDistance} km`;
  };
  dist.addEventListener("input", () => {
    renderDist();
    onChange();
  });
  renderDist();

  stateSel.addEventListener("change", () => {
    state.usState = stateSel.value;
    fillRegions();
    onChange();
  });
  regionSel.addEventListener("change", () => {
    state.region = regionSel.value;
    onChange();
  });

  // Terrain toggle group — single-select, click again to clear.
  wireToggleGroup("f-difficulty", (val) => {
    state.difficulty = val;
    onChange();
  });

  // Reset
  document.getElementById("f-reset").addEventListener("click", () => {
    state.maxDistance = SLIDER_MAX;
    state.usState = "";
    state.region = "";
    state.difficulty = null;
    state.query = "";
    dist.value = String(SLIDER_MAX);
    stateSel.value = "";
    search.value = "";
    renderSearchClear();
    fillRegions();
    renderDist();
    // Scoped to the terrain group on purpose. This used to be a document-wide
    // ".toggle.is-active" sweep, which was harmless while that was the only
    // toggle-group — but the Map view controls (#f-relief) are toggles too,
    // and resetting route filters must not silently switch off 3D relief.
    document
      .querySelectorAll("#f-difficulty .toggle.is-active")
      .forEach((b) => b.classList.remove("is-active"));
    onChange();
  });
}

function wireToggleGroup(groupId, setValue) {
  const group = document.getElementById(groupId);
  group.querySelectorAll(".toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const wasActive = btn.classList.contains("is-active");
      group.querySelectorAll(".toggle").forEach((b) => b.classList.remove("is-active"));
      if (wasActive) {
        setValue(null);
      } else {
        btn.classList.add("is-active");
        setValue(btn.dataset.value);
      }
    });
  });
}
