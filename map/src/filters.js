// Client-side filtering over the in-memory FeatureCollection.
// Pure-ish: setupFilters() wires the DOM controls and calls onChange()
// whenever any control moves. applyFilters() does the actual filtering.

const state = {
  maxDistance: 200, // km; 200 == "any" (slider max)
  region: "",
  difficulty: null, // "easy" | "moderate" | "hard"
  recency: null, // "1m" | "6m" | "old"
};

const SLIDER_MAX = 200;

// Age of a route in days from its last_ridden date, relative to "today".
function ageDays(lastRidden, now = new Date()) {
  const then = new Date(lastRidden + "T00:00:00Z");
  return (now - then) / 86400000;
}

function matchesRecency(bucket, lastRidden) {
  const days = ageDays(lastRidden);
  if (bucket === "1m") return days < 30;
  if (bucket === "6m") return days >= 30 && days < 182;
  if (bucket === "old") return days >= 182;
  return true;
}

export function applyFilters(features) {
  return features.filter((f) => {
    const p = f.properties;
    if (p.status && p.status !== "published") return false;
    if (state.maxDistance < SLIDER_MAX && p.distance_km > state.maxDistance) return false;
    if (state.region && p.region !== state.region) return false;
    if (state.difficulty && p.terrain_difficulty !== state.difficulty) return false;
    if (state.recency && !matchesRecency(state.recency, p.last_ridden)) return false;
    return true;
  });
}

export function getState() {
  return { ...state };
}

export function setupFilters(features, onChange) {
  // Region dropdown — built dynamically from distinct region values.
  const regionSel = document.getElementById("f-region");
  const regions = [...new Set(features.map((f) => f.properties.region))].sort();
  for (const r of regions) {
    const opt = document.createElement("option");
    opt.value = r;
    opt.textContent = r;
    regionSel.appendChild(opt);
  }

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

  regionSel.addEventListener("change", () => {
    state.region = regionSel.value;
    onChange();
  });

  // Toggle groups (difficulty + recency) — single-select, click again to clear.
  wireToggleGroup("f-difficulty", (val) => {
    state.difficulty = val;
    onChange();
  });
  wireToggleGroup("f-recency", (val) => {
    state.recency = val;
    onChange();
  });

  // Reset
  document.getElementById("f-reset").addEventListener("click", () => {
    state.maxDistance = SLIDER_MAX;
    state.region = "";
    state.difficulty = null;
    state.recency = null;
    dist.value = String(SLIDER_MAX);
    regionSel.value = "";
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
