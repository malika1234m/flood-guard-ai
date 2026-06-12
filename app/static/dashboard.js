let histogramChart = null;
let categoryChart = null;
let districtChart = null;

const CATEGORY_COLORS = { Low: "#22c55e", Moderate: "#eab308", High: "#f97316", Severe: "#ef4444" };

function fmt(v, digits = 3) {
  return v === null || v === undefined ? "--" : Number(v).toFixed(digits);
}

function renderHistogram(bins) {
  const labels = bins.map((_, i) => `${(i / 10).toFixed(1)}-${((i + 1) / 10).toFixed(1)}`);
  if (histogramChart) histogramChart.destroy();
  histogramChart = new Chart(document.getElementById("histogram-chart"), {
    type: "bar",
    data: { labels, datasets: [{ label: "Predictions", data: bins, backgroundColor: "#38bdf8" }] },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#93a4bf" }, grid: { display: false } },
        y: { ticks: { color: "#93a4bf", precision: 0 }, grid: { color: "#25395a" } },
      },
    },
  });
}

function renderCategoryChart(counts) {
  const labels = Object.keys(counts);
  const data = Object.values(counts);
  const colors = labels.map((l) => CATEGORY_COLORS[l] || "#6366f1");
  if (categoryChart) categoryChart.destroy();
  categoryChart = new Chart(document.getElementById("category-chart"), {
    type: "doughnut",
    data: { labels, datasets: [{ data, backgroundColor: colors }] },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom", labels: { color: "#e6edf6" } } },
    },
  });
}

function renderDistrictChart(counts) {
  const labels = Object.keys(counts);
  const data = Object.values(counts);
  if (districtChart) districtChart.destroy();
  districtChart = new Chart(document.getElementById("district-chart"), {
    type: "bar",
    data: { labels, datasets: [{ label: "Predictions", data, backgroundColor: "#6366f1" }] },
    options: {
      indexAxis: "y",
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#93a4bf", precision: 0 }, grid: { color: "#25395a" } },
        y: { ticks: { color: "#e6edf6" }, grid: { display: false } },
      },
    },
  });
}

function renderRecentTable(rows) {
  const tbody = document.querySelector("#recent-table tbody");
  tbody.innerHTML = "";
  for (const r of rows) {
    const tr = document.createElement("tr");
    const time = new Date(r.timestamp * 1000).toLocaleString();
    tr.innerHTML = `<td>${time}</td><td>${r.district ?? ""}</td><td>${fmt(r.flood_risk_score)}</td>` +
      `<td><span class="badge ${r.risk_category}">${r.risk_category}</span></td><td>${fmt(r.latency_ms, 1)}</td>`;
    tbody.appendChild(tr);
  }
}

async function refresh() {
  const res = await fetch("/monitoring/stats");
  const stats = await res.json();

  document.getElementById("stat-total").textContent = stats.total_predictions;
  document.getElementById("stat-avg-score").textContent = fmt(stats.avg_score);
  document.getElementById("stat-latency").textContent = fmt(stats.avg_latency_ms, 1);
  document.getElementById("stat-feedback").textContent = stats.feedback_count;
  document.getElementById("stat-rating").textContent = fmt(stats.avg_user_rating, 2);

  renderHistogram(stats.score_histogram);
  renderCategoryChart(stats.category_counts);
  renderDistrictChart(stats.district_counts);
  renderRecentTable(stats.recent);
}

document.getElementById("refresh-btn").addEventListener("click", refresh);
refresh();
setInterval(refresh, 15000);
