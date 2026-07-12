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
    return true;
  });
}

export function getState() {
  return { ...state };
}

export function setupFilters(features, onChange) {
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
    dist.value = String(SLIDER_MAX);
    stateSel.value = "";
    fillRegions();
    renderDist();
    document
      .querySelectorAll(".toggle.is-active")
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
