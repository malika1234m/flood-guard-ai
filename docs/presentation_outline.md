# FloodGuard AI — Presentation Outline

**Format:** 9 required sections, **8–10 minutes total**. Suggested timings below
add to ~9 minutes; trim the Demonstration if running long, since it's the
section judges will remember most.

---

## 1. Team Introduction (~30s)

- Team name, member names + roles (e.g. "ML / feature engineering",
  "MLOps / deployment", "frontend / AI advisor", "presentation").
- One sentence: "We're FloodGuard AI — we turned our Initial Round flood-risk
  model into a deployed, AI-powered web product with full MLOps."

*Speaker note:* keep this brief — judges want to get to the system fast.

---

## 2. Problem Understanding (~1 min)

- Restate the task: predict **`flood_risk_score`** (0–1) for Sri Lankan
  locations from 47 raw columns covering geography, climate, land cover,
  infrastructure, and socioeconomics — 20,886 training rows, 25 districts.
- Custom metric: `(0.5·MAE + 0.5·RMSE) × (1 + max(0, 1 − explained_variance))`
  — both accuracy *and* calibration matter.
- Key dataset insight to highlight: **`district` dominates feature importance**
  (district target-encoding is the #1 feature by a wide margin in every model
  version), and the data is synthetic/noisy, so ensembling + district-level
  aggregates were the winning strategy from round one.

*Slide idea:* a small table of the 5 input categories (Geography, Climate,
Land, Infrastructure & Socioeconomics, Event context) with 1–2 example columns
each.

---

## 3. Initial Round Approach (~1 min)

- `solution_v10.py`, the best Initial Round submission (custom metric **≈ 0.383**):
  - 5-model ensemble: LightGBM, LightGBM-DART, CatBoost, XGBoost, ExtraTrees
    (Optuna-tuned)
  - ~150 engineered features: district stats/quantiles/ranks, KMeans clusters
    (k=5,10,20), haversine-KNN target stats, target encoding, interaction
    features
  - 10-fold × 3-seed CV, Ridge meta-learner stacking
  - 10 rounds of pseudo-labeling on the test set
  - Post-processing: shift prediction mean to match train mean exactly
    (the **calibration insight**)

*Slide idea:* one diagram — "5 models → Ridge stack → calibration shift → 0.383"

---

## 4. Improvements Made (~1.5 min)

Frame this as: **"same winning ideas, re-engineered to serve one prediction at
a time."**

- Built `FeatureEngineer` (`src/features.py`) — a **fit/transform/save/load**
  object. Every "compute over the whole dataset" step from v10 (district
  stats, KMeans, KNN via BallTree, target encoding, `*_qmap` empirical
  mappings) is now **fit once and saved**, then applied to a single new row in
  milliseconds.
- Reduced to a **3-model ensemble** (LightGBM + CatBoost + XGBoost), **5-fold**
  CV, fixed hyperparameters, no pseudo-labeling → **45-second, reproducible
  training run**, 223 features, 14 MB of artifacts.
- Kept the two highest-leverage ideas: **Ridge meta-stacking** (weights:
  lgb=0.229, cat=0.713, xgb=0.134) and **mean-calibration shift** (shift ≈ 0 —
  the stacked prediction mean already matches the train mean of 0.4780).
- Result: OOF custom metric **0.4071** (vs 0.383 for the heavier Initial Round
  search) — an explicit, documented trade-off of leaderboard score for
  **deployability**.
- **New**: an **AI Risk Advisor** (GPT-4o-mini via OpenAI, with a
  deterministic template fallback) that turns the score + top contributing
  features into a plain-language report and recommendations.
- **New**: **Quick Mode** on `/predict` — click any district chip (grouped by
  province) to auto-fill all 26 fields from district median values and score
  instantly — no form required.
- **New**: **10-day Flood Forecast** (`/forecast`) — Open-Meteo rainfall fed
  through the model for all 25 districts, animated day-by-day with district map.
- **New**: **Emergency Priority** (`/priority`) — composite response-priority
  ranking for all 25 districts using a weighted formula across 5 factors.

*Slide idea:* the "v10 (batch) → FloodGuard AI (fit/transform)" table from the
technical report (§3.2) — it's the single best visual for "what we actually
changed."

---

## 5. System Architecture (~1.5 min)

- Walk through the architecture diagram (technical report §2.1 / README §2):
  **Client (web UI) → FastAPI service (single Docker image) → FeatureEngineer
  → 3-model ensemble + Ridge + calibration → response**, with the **AI
  advisor** and **SQLite monitoring** as side paths feeding the dashboard.
- Emphasize: **one Docker image, one Render URL** serves the REST API, the
  prediction form, and the monitoring dashboard — "judges don't need to set up
  anything."
- Mention the offline path briefly: `src/train.py` → MLflow (`mlruns/`) →
  `models/v1/` artifacts loaded at API startup.

*Slide idea:* the mermaid architecture diagram, full-slide.

---

## 6. MLOps Workflow (~1.5 min)

Cover all five expected components quickly, one bullet each:

- **Data pipeline**: `src/data_validation.py` — schema/null/range checks before
  training, plus per-request out-of-distribution flags.
- **Model management**: MLflow experiment tracking (`mlruns/`) logs every
  training run's hyperparameters and metrics; `models/v1/metadata.json` records
  feature count, CV metrics, Ridge weights, and feature importances —
  versioned, so `v2`, `v3`, … can be compared directly.
- **Deployment**: `Dockerfile` → Railway Docker web service, `/health` check,
  optional `OPENAI_API_KEY` (already set in production; `ai_report.source` is
  `"llm"` for all live requests). `render.yaml` kept as documented alternative.
- **Monitoring**: every prediction logged to SQLite (input, score, category,
  latency, OOD flags); `/monitoring/stats` + `/dashboard` visualize volume,
  score distribution, district/category breakdowns, latency, and user feedback.
- **CI/CD (bonus)**: GitHub Actions runs the full `pytest` suite (feature
  pipeline, inference, API) and builds the Docker image on every push/PR.

*Slide idea:* a 5-row table, one row per MLOps pillar, "what we built."

---

## 7. Demonstration (~2.5 min — the core of the talk)

Live demo script (have the Railway URL open, plus a backup screen-recording per
the booklet's recommendation):

0. **Landing page** (`/`): animated hero, "how it works" steps, live model
   snapshot (version, feature count, OOF metric) pulled from `/model/info`. The
   geolocation live-risk preview fires automatically if location permission is
   granted.
1. **Quick Mode** (`/predict` → click **⚡ Quick Mode**): click any district
   chip (e.g. Colombo) — the result appears instantly in the panel on the right
   with a full AI report. No form filling required. Click **Adjust details →**
   to see the full form pre-filled with that district's values.
2. **Full prediction flow**: switch back to the full form, change a few values
   (high rainfall, low elevation, near a river) → submit → show the **risk
   gauge**, **model breakdown** (lgb/cat/xgb scores), **top contributing
   factors** chart, and the **AI-generated risk report**.
3. **OOD flag**: submit a value well outside normal range (e.g. elevation = 0)
   → show the out-of-distribution warning appearing in the result.
4. **10-day Forecast** (`/forecast`): page auto-loads on arrival — show the
   KPI strip (peak day, peak score, trend), click **Animate** to step through
   the risk timeline, hover the SVG map to inspect district dots, click a
   different district in the ranking table to switch.
5. **Emergency Priority** (`/priority`): auto-loaded priority ranking of all 25
   districts — click any row to expand the score breakdown (five progress bars
   showing each factor's contribution).
6. **Feedback + Dashboard** (`/dashboard`): rate the prediction with the star
   widget → switch to `/dashboard` → show the prediction just logged live in
   the score histogram and district breakdown.
7. (Optional, if time) **API docs** (`/docs`): auto-generated OpenAPI schema —
   "any system can integrate against this REST API."

*Speaker note:* rehearse this against the **live Railway URL**
(`https://floodguard-production.up.railway.app`), not just localhost — and
keep a screen-recording ready as a fallback if the network fails during the
demo. The forecast page may take 5–10 seconds to load (25 districts × 10 days
of Open-Meteo calls); mention this is cached for an hour after first load.

---

## 8. Challenges Faced (~1 min)

Pick 2–3 honest, specific challenges — judges value this section for engineering
maturity, not for hiding problems:

- **Making a batch feature pipeline servable for one record.** v10's district
  stats, KMeans, KNN, and target encodings were all computed over the entire
  training set at once; redesigning each as a fit-once/apply-to-one-row
  component (`FeatureEngineer`) was the single biggest engineering effort of
  the Final Round.
- **Trading leaderboard score for deployability.** Dropping pseudo-labeling,
  2 of 5 base models, and going from 10-fold×3-seed to 5-fold cost ~0.024 on
  the custom metric (0.383 → 0.407) — a deliberate, documented trade-off rather
  than an oversight.
- **Handling "expected" data noise without over-engineering.** Negative
  rainfall/distance values in the synthetic data produce `NaN` after
  `log1p()`; rather than imputing or dropping rows, we leaned on
  LightGBM/CatBoost/XGBoost's native NaN handling (missing-value splits) and
  documented it — and added `flag_out_of_distribution()` so these cases are
  *visible* in production rather than silently handled.
- *(If applicable)* local environment constraints encountered while
  containerizing/testing (disk space, Docker Desktop) — framed as "deployment
  is validated via Render's managed build" if local Docker verification was
  incomplete.

---

## 9. Future Improvements (~30–45s)

- Periodic retraining as new labeled data arrives, versioned as `models/v2/`,
  `v3/`, … and compared via MLflow run history.
- KS-test data-drift GHA workflow: weekly GitHub Actions job comparing incoming
  feature distributions against training baselines, flagging significant drift.
- Lightweight pseudo-labeling using accumulated predictions + user feedback as a
  weak-label source.
- Multilingual AI Risk Advisor (Sinhala/Tamil) for end users in the regions the
  model covers.
- Push notifications for the mobile app when a user's district crosses a risk
  threshold (requires background location + FCM integration).

*Closing line:* "FloodGuard AI shows the Initial Round model didn't just survive
the transition to production — its core ideas (ensembling, stacking,
calibration) are exactly what made that transition work. And the same district-
level insight that drove the leaderboard score now powers a real-time emergency
priority ranking for civil defence."

---

## Timing summary

| Section | Suggested time |
|---|---|
| 1. Team Introduction | 0:30 |
| 2. Problem Understanding | 1:00 |
| 3. Initial Round Approach | 0:45 |
| 4. Improvements Made | 1:30 |
| 5. System Architecture | 1:00 |
| 6. MLOps Workflow | 1:00 |
| 7. Demonstration | 3:00 |
| 8. Challenges Faced | 0:45 |
| 9. Future Improvements | 0:30 |
| **Total** | **~10:00** |

The demo is the most impactful section — spend the extra time there. Quick Mode
and the Forecast/Priority pages are the most visually impressive; lead with Quick
Mode, then Forecast, then the dashboard to show the full arc from "instant
reading" to "10-day planning tool" to "monitored system."
