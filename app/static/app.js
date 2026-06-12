const REQUIRED_NUMERIC = [
  "latitude", "longitude", "elevation_m", "distance_to_river_m",
  "population_density_per_km2", "built_up_percent", "rainfall_7d_mm",
  "monthly_rainfall_mm", "drainage_index", "ndvi", "ndwi",
  "historical_flood_count", "infrastructure_score", "nearest_hospital_km", "nearest_evac_km",
];
const REQUIRED_CATEGORICAL = [
  "district", "landcover", "soil_type", "water_supply", "electricity",
  "road_quality", "urban_rural", "water_presence_flag",
];
const OPTIONAL_NUMERIC = [
  "inundation_area_sqm", "seasonal_index", "terrain_roughness_index",
  "socioeconomic_status_index", "extreme_weather_index",
];
const OPTIONAL_CATEGORICAL = ["flood_occurrence_current_event", "is_good_to_live"];
const ADVANCED_INDEX_FIELDS = [
  "seasonal_index", "terrain_roughness_index", "socioeconomic_status_index", "extreme_weather_index",
];
const RISK_COLORS = { Low: "#22c55e", Moderate: "#eab308", High: "#f97316", Severe: "#ef4444" };

let districtDefaults = {};
let globalDefaults = {};
let factorsChart = null;
let currentPredictionId = null;

function prettify(name) {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildPayload() {
  const payload = {};
  for (const id of REQUIRED_NUMERIC) payload[id] = parseFloat(document.getElementById(id).value);
  for (const id of REQUIRED_CATEGORICAL) payload[id] = document.getElementById(id).value;
  for (const id of OPTIONAL_NUMERIC) {
    const v = document.getElementById(id).value;
    payload[id] = v === "" ? null : parseFloat(v);
  }
  for (const id of OPTIONAL_CATEGORICAL) payload[id] = document.getElementById(id).value;
  const reason = document.getElementById("reason_not_good_to_live").value.trim();
  payload.reason_not_good_to_live = reason === "" ? null : reason;
  payload.include_ai_report = true;
  return payload;
}

function renderGauge(score, category) {
  const gauge = document.getElementById("gauge");
  gauge.style.setProperty("--pct", (score * 100).toFixed(1));
  gauge.style.setProperty("--gauge-color", RISK_COLORS[category] || "#38bdf8");
  document.getElementById("score-value").textContent = score.toFixed(3);
  const badge = document.getElementById("risk-badge");
  badge.textContent = category;
  badge.className = "badge " + category;
}

function renderModelBreakdown(base) {
  const el = document.getElementById("model-breakdown");
  el.innerHTML = Object.entries(base)
    .map(([k, v]) => `<span>${k.toUpperCase()}: ${v.toFixed(3)}</span>`)
    .join("");
}

function renderOOD(flags) {
  const el = document.getElementById("ood-flags");
  if (!flags || flags.length === 0) {
    el.style.display = "none";
    return;
  }
  el.style.display = "block";
  el.innerHTML = "<strong>Note:</strong> Some inputs are outside the typical training range &mdash; " + flags.join("; ");
}

function renderAIReport(report) {
  document.getElementById("ai-source").textContent =
    report.source === "llm" ? "AI-generated (Claude)" : "Generated from a rule-based template";
  document.getElementById("ai-summary").textContent = report.summary;
  const ul = document.getElementById("ai-recommendations");
  ul.innerHTML = "";
  for (const r of report.recommendations) {
    const li = document.createElement("li");
    li.textContent = r;
    ul.appendChild(li);
  }
}

function renderFactorsChart(factors) {
  const ctx = document.getElementById("factors-chart");
  const labels = factors.map((f) => prettify(f.feature));
  const data = factors.map((f) => f.importance);
  if (factorsChart) factorsChart.destroy();
  factorsChart = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ label: "Model importance", data, backgroundColor: "#38bdf8" }] },
    options: {
      indexAxis: "y",
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#93a4bf" }, grid: { color: "#25395a" } },
        y: { ticks: { color: "#e6edf6" }, grid: { display: false } },
      },
    },
  });
}

function updateAdvancedPlaceholders() {
  const district = document.getElementById("district").value;
  const defaults = districtDefaults[district] || globalDefaults || {};
  for (const f of ADVANCED_INDEX_FIELDS) {
    const input = document.getElementById(f);
    const v = defaults[f];
    input.placeholder = v !== undefined ? `District avg: ${v.toFixed(4)}` : "";
  }
}

async function loadModelInfo() {
  const res = await fetch("/model/info");
  const info = await res.json();
  for (const [field, options] of Object.entries(info.categorical_options)) {
    const select = document.getElementById(field);
    if (!select) continue;
    select.innerHTML = options.map((o) => `<option value="${o}">${o}</option>`).join("");
  }
  districtDefaults = info.district_defaults || {};
  globalDefaults = info.advanced_field_global_defaults || {};
  updateAdvancedPlaceholders();
  document.getElementById("district").addEventListener("change", updateAdvancedPlaceholders);
}

function setupConditionalFields() {
  document.getElementById("flood_occurrence_current_event").addEventListener("change", (e) => {
    document.getElementById("inundation-wrap").style.display = e.target.value === "Yes" ? "block" : "none";
  });
  document.getElementById("is_good_to_live").addEventListener("change", (e) => {
    document.getElementById("reason-wrap").style.display = e.target.value === "No" ? "block" : "none";
  });
}

function setupFeedback() {
  document.getElementById("stars").addEventListener("click", async (e) => {
    const span = e.target.closest("span[data-v]");
    if (!span || currentPredictionId === null) return;
    const rating = parseInt(span.dataset.v, 10);
    document.querySelectorAll("#stars span").forEach((s) => {
      s.classList.toggle("active", parseInt(s.dataset.v, 10) <= rating);
    });
    await fetch("/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prediction_id: currentPredictionId, user_rating: rating }),
    });
    document.getElementById("feedback-msg").textContent = "Thanks for your feedback!";
  });
}

function setupForm() {
  document.getElementById("predict-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("submit-btn");
    btn.disabled = true;
    btn.textContent = "Assessing...";
    try {
      const payload = buildPayload();
      const res = await fetch("/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Prediction failed");
      }
      const data = await res.json();
      currentPredictionId = data.prediction_id;

      document.getElementById("results-placeholder").style.display = "none";
      document.getElementById("results-content").style.display = "block";
      renderGauge(data.flood_risk_score, data.risk_category);
      renderModelBreakdown(data.base_model_scores);
      renderOOD(data.ood_flags);
      renderAIReport(data.ai_report);
      renderFactorsChart(data.top_factors);

      document.getElementById("feedback-msg").textContent = "";
      document.querySelectorAll("#stars span").forEach((s) => s.classList.remove("active"));
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "Assess Flood Risk";
    }
  });
}

loadModelInfo();
setupConditionalFields();
setupFeedback();
setupForm();
