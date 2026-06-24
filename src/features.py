"""
FeatureEngineer v2: production feature pipeline with all upgrades from
competitor analysis:
  - Synthetic fingerprint (lat/lon decimal precision)
  - Compound categoricals (downstream_sig, infra_deficit_sig)
  - Multi-resolution grid IDs (4 scales)
  - Physics features (soil infiltration, TWI, urban runoff, cyclone risk)
  - Yeo-Johnson divergence via fitted PowerTransformer (inference-safe)
  - Topographic KMeans clusters (k=50) for GroupKFold spatial de-leakage
  - Frequency encoding of all categorical values
  - Denoising autoencoder (DAE) 16-dim bottleneck features
  - 5-stat Bayesian target encoding (mean/std/q25/q75/log_cnt) with
    GroupKFold folds instead of random KFold
"""
from __future__ import annotations

import warnings

import numpy as np
import pandas as pd
import joblib
from sklearn.cluster import KMeans
from sklearn.model_selection import KFold, GroupKFold
from sklearn.neighbors import BallTree
from sklearn.neural_network import MLPRegressor
from sklearn.preprocessing import PowerTransformer, StandardScaler

from . import config

warnings.filterwarnings("ignore", category=RuntimeWarning, message="invalid value encountered in log1p")
warnings.filterwarnings("ignore", category=pd.errors.PerformanceWarning)
warnings.filterwarnings("ignore", category=UserWarning, message="Stochastic Optimizer")


# ── small stateless helpers ─────────────────────────────────────────────
def _haversine_coords(lat, lon):
    return np.deg2rad(np.column_stack([lat, lon]))


def _fit_monotonic_map(raw: pd.Series, mapped: pd.Series):
    mask = raw.notna() & mapped.notna()
    x, y = raw[mask].to_numpy(), mapped[mask].to_numpy()
    order = np.argsort(x)
    x, y = x[order], y[order]
    ux, first_idx = np.unique(x, return_index=True)
    bounds = list(first_idx[1:]) + [len(x)]
    uy = np.array([y[a:b].mean() for a, b in zip(first_idx, bounds)])
    return ux, uy


def _apply_monotonic_map(values: pd.Series, mapping) -> np.ndarray:
    ux, uy = mapping
    arr = values.to_numpy(dtype=float)
    out = np.full_like(arr, np.nan)
    ok = ~np.isnan(arr)
    if ok.any():
        out[ok] = np.interp(arr[ok], ux, uy)
    return out


def _rank_pct(sorted_values: np.ndarray, value: float) -> float:
    n = len(sorted_values)
    if n == 0 or np.isnan(value):
        return 0.5
    lo = np.searchsorted(sorted_values, value, side="left")
    hi = np.searchsorted(sorted_values, value, side="right")
    return (lo + hi) / 2.0 / n


class FeatureEngineer:
    def __init__(self):
        self.fitted = False
        self.feature_cols: list[str] = []

    # ════════════════════════════════════════════════════════════════
    # Public API
    # ════════════════════════════════════════════════════════════════
    def fit_transform(self, train_df: pd.DataFrame) -> pd.DataFrame:
        df = train_df.copy()
        df = self._step_basic(df)

        self._fit_qmaps(df)
        self._fit_medians(df)

        df = self._step_interactions(df)

        self._fit_district_stats(df)
        df = self._merge_district_stats(df)
        df = self._merge_district_quantiles(df)

        self._fit_district_ranks(df)
        df = self._merge_district_ranks(df)

        # Topo clusters first — used as GroupKFold groups downstream
        self._fit_topo_clusters(df)

        self._fit_kmeans(df)
        df = self._add_kmeans_features(df)

        self._fit_freq_encoding(df)
        df = self._add_freq_features(df)

        self._fit_dae(df)
        df = self._add_dae_features(df)

        df = self._add_knn_features_oof(df)

        df = self._fit_target_encoding_oof(df)
        df = self._fit_label_encoding(df)

        # Grid-ID string columns are handled via TE only; drop originals.
        _GRID_COLS = ["grid_id_100", "grid_id_050", "grid_id_025", "grid_id_012"]
        self.feature_cols = [
            c for c in df.columns
            if c not in config.DROP_COLS + [config.TARGET] + _GRID_COLS
        ]
        self.fitted = True
        return df[self.feature_cols].astype(np.float32)

    def transform(self, df_in: pd.DataFrame) -> pd.DataFrame:
        if not self.fitted:
            raise RuntimeError("FeatureEngineer must be fit before transform()")
        df = df_in.copy()
        df = self._step_basic(df)
        df = self._ensure_qmap_cols(df)
        df = self._ensure_advanced_cols(df)
        df = self._step_interactions(df)

        df = self._merge_district_stats(df)
        df = self._merge_district_quantiles(df)
        df = self._merge_district_ranks(df)

        df = self._add_kmeans_features(df)
        df = self._add_freq_features(df)
        df = self._add_dae_features(df)
        df = self._add_knn_features_full(df)

        df = self._apply_target_encoding(df)
        df = self._apply_label_encoding(df)

        for c in self.feature_cols:
            if c not in df.columns:
                df[c] = 0.0
        return df[self.feature_cols].astype(np.float32)

    def save(self, path):
        joblib.dump(self, path)

    @staticmethod
    def load(path) -> "FeatureEngineer":
        return joblib.load(path)

    # ════════════════════════════════════════════════════════════════
    # Step 1: basic cleanup (shared by fit & transform)
    # ════════════════════════════════════════════════════════════════
    def _step_basic(self, df: pd.DataFrame) -> pd.DataFrame:
        for c in config.ZERO_GAIN:
            if c in df.columns:
                df = df.drop(columns=c)

        # Date features
        if "generation_date" in df.columns:
            dt = pd.to_datetime(df["generation_date"], errors="coerce")
        else:
            dt = pd.Series([pd.Timestamp.now()] * len(df), index=df.index)
        dt = dt.fillna(pd.Timestamp.now())
        df["gen_month"]     = dt.dt.month.astype(int)
        df["gen_year"]      = dt.dt.year.astype(int)
        df["gen_dayofyear"] = dt.dt.dayofyear.astype(int)
        df["is_sw_monsoon"] = df["gen_month"].isin([5, 6, 7, 8, 9]).astype(float)
        df["is_ne_monsoon"] = df["gen_month"].isin([10, 11, 12, 1]).astype(float)
        df["month_sin"]     = np.sin(2 * np.pi * df["gen_month"] / 12)
        df["month_cos"]     = np.cos(2 * np.pi * df["gen_month"] / 12)
        df["day_sin"]       = np.sin(2 * np.pi * df["gen_dayofyear"] / 365)
        df["day_cos"]       = np.cos(2 * np.pi * df["gen_dayofyear"] / 365)

        if "is_synthetic" in df.columns:
            df["is_synthetic_num"] = (df["is_synthetic"] == True).astype(float)  # noqa: E712
        else:
            df["is_synthetic_num"] = 0.0

        # Reason-text features
        reason = (
            df["reason_not_good_to_live"]
            if "reason_not_good_to_live" in df.columns
            else pd.Series([""] * len(df), index=df.index)
        )
        r = reason.fillna("").astype(str).str.lower()
        df["reason_has_flood"] = r.str.contains("flood").astype(float)
        df["reason_has_infra"] = r.str.contains("infra").astype(float)
        df["reason_has_road"]  = r.str.contains("road").astype(float)
        df["reason_n_issues"]  = df["reason_has_flood"] + df["reason_has_infra"] + df["reason_has_road"]

        # Event / habitability defaults
        for col, default in config.EVENT_DEFAULTS.items():
            if col not in df.columns:
                df[col] = default
            else:
                df[col] = df[col].fillna(default)

        # Raw categorical columns
        for col in config.RAW_CAT_COLS:
            if col not in df.columns:
                df[col] = "Unknown"
            else:
                df[col] = df[col].fillna("Unknown").astype(str)

        # Synthetic fingerprint: decimal precision of lat/lon encodes data generation pattern
        def _decimal_len(series: pd.Series) -> pd.Series:
            def _dl(x):
                s = str(x)
                if "." in s and s.lower() != "nan":
                    return len(s.split(".")[1])
                return 0
            return series.apply(_dl)

        df["lat_decimal_len"] = _decimal_len(df["latitude"] if "latitude" in df.columns else pd.Series([0.0] * len(df), index=df.index))
        df["lon_decimal_len"] = _decimal_len(df["longitude"] if "longitude" in df.columns else pd.Series([0.0] * len(df), index=df.index))

        # Compound categoricals
        flood_ev  = df["flood_occurrence_current_event"].astype(str).str.strip()
        good_live = df["is_good_to_live"].astype(str).str.strip()
        reason_s  = reason.fillna("").astype(str).str.strip().str[:20]
        df["downstream_sig"] = flood_ev + "_" + good_live + "_" + reason_s

        water = df["water_supply"].astype(str).str.strip() if "water_supply" in df.columns else pd.Series(["Unknown"] * len(df), index=df.index)
        elec  = df["electricity"].astype(str).str.strip()  if "electricity"  in df.columns else pd.Series(["Unknown"] * len(df), index=df.index)
        road  = df["road_quality"].astype(str).str.strip() if "road_quality"  in df.columns else pd.Series(["Unknown"] * len(df), index=df.index)
        df["infra_deficit_sig"] = water + "_" + elec + "_" + road

        return df

    # ════════════════════════════════════════════════════════════════
    # qmap / advanced-index handling
    # ════════════════════════════════════════════════════════════════
    def _fit_qmaps(self, df: pd.DataFrame):
        self.qmap_mappings = {}
        for qmap_col, raw_col in config.QMAP_SOURCE.items():
            self.qmap_mappings[qmap_col] = _fit_monotonic_map(df[raw_col], df[qmap_col])

    def _ensure_qmap_cols(self, df: pd.DataFrame) -> pd.DataFrame:
        for qmap_col, raw_col in config.QMAP_SOURCE.items():
            if qmap_col not in df.columns or df[qmap_col].isna().all():
                if raw_col in df.columns:
                    df[qmap_col] = _apply_monotonic_map(df[raw_col], self.qmap_mappings[qmap_col])
                else:
                    df[qmap_col] = np.nan
        return df

    def _ensure_advanced_cols(self, df: pd.DataFrame) -> pd.DataFrame:
        for col in config.ADVANCED_COLS:
            mean_col = f"dist_{col}_mean"
            if col not in df.columns:
                df[col] = np.nan
            need_default = df[col].isna()
            if need_default.any():
                if mean_col in self.district_stats_df.columns:
                    fallback = df["district"].map(
                        self.district_stats_df.set_index("district")[mean_col]
                    )
                else:
                    fallback = pd.Series(self.global_means.get(col, 0.0), index=df.index)
                df.loc[need_default, col] = fallback[need_default].fillna(
                    self.global_means.get(col, 0.0)
                )
        return df

    # ════════════════════════════════════════════════════════════════
    # Step 2: medians + Yeo-Johnson transformers for physics features
    # ════════════════════════════════════════════════════════════════
    def _fit_medians(self, df: pd.DataFrame):
        median_cols = [
            "latitude", "longitude", "elevation_m", "distance_to_river_m",
            "drainage_index", "rainfall_7d_mm", "monthly_rainfall_mm",
            "ndvi_qmap", "ndwi_qmap",
        ]
        self.medians = {c: float(df[c].median()) for c in median_cols if c in df.columns}
        self.global_means = {c: float(df[c].mean()) for c in config.ADVANCED_COLS if c in df.columns}

        # Fit PowerTransformer for elevation and drainage (inference-safe yeo-johnson)
        self.yj_transformers: dict[str, PowerTransformer] = {}
        for col in ["elevation_m", "drainage_index"]:
            if col in df.columns:
                pt = PowerTransformer(method="yeo-johnson", standardize=False)
                vals = df[[col]].fillna(float(df[col].median())).values
                pt.fit(vals)
                self.yj_transformers[col] = pt

    def _apply_yj(self, df: pd.DataFrame, col: str, fillval: float = 0.0) -> np.ndarray:
        if col in self.yj_transformers:
            vals = df[[col]].fillna(fillval).values
            return self.yj_transformers[col].transform(vals).flatten()
        return df[col].fillna(fillval).to_numpy(dtype=float)

    # ════════════════════════════════════════════════════════════════
    # Step 3: interaction / geo / physics features
    # ════════════════════════════════════════════════════════════════
    def _step_interactions(self, df: pd.DataFrame) -> pd.DataFrame:
        med = self.medians
        lat = df["latitude"].fillna(med.get("latitude", 7.9))
        lon = df["longitude"].fillna(med.get("longitude", 80.7))
        df["dist_from_center"] = np.sqrt((lat - 8.0) ** 2 + (lon - 80.8) ** 2)
        df["lat_lon_prod"]     = lat * lon
        df["lat_from_south"]   = lat - 6.0
        df["geo_cluster"]      = (lat * 4).round(0) * 100 + (lon * 4).round(0)
        df["inund_log1p"]      = np.log1p(df["inundation_area_sqm"].fillna(0))
        df["hist_flood_sqrt"]  = np.sqrt(df["historical_flood_count"].fillna(0))

        river  = np.log1p(df["distance_to_river_m"].fillna(med.get("distance_to_river_m", 500)))
        rain7  = np.log1p(df["rainfall_7d_mm"].fillna(0))
        rainM  = np.log1p(df["monthly_rainfall_mm"].fillna(0))
        drain  = df["drainage_index"].fillna(med.get("drainage_index", 0.5))
        ndvi_q = df["ndvi_qmap"].fillna(0)
        ndwi_q = df["ndwi_qmap"].fillna(0)
        elev   = df["elevation_m"].fillna(med.get("elevation_m", 50))
        pop    = np.log1p(df["population_density_per_km2"].fillna(0))
        built  = df["built_up_percent_qmap"].fillna(0)
        hosp   = np.log1p(df["nearest_hospital_km"].fillna(0))
        evac   = np.log1p(df["nearest_evac_km"].fillna(0))
        infra  = df["infrastructure_score"].fillna(0)
        inund  = df["inund_log1p"]
        hist_f = df["hist_flood_sqrt"]
        terrain = df["terrain_roughness_index"] if "terrain_roughness_index" in df.columns else pd.Series(0.5, index=df.index)
        extreme = df["extreme_weather_index"]    if "extreme_weather_index"    in df.columns else pd.Series(0.5, index=df.index)
        socio   = df["socioeconomic_status_index"] if "socioeconomic_status_index" in df.columns else pd.Series(0.5, index=df.index)
        seas    = df["seasonal_index"]             if "seasonal_index"             in df.columns else pd.Series(0.5, index=df.index)

        # Original 40 interaction features
        df["river_x_ndwi"]       = river * ndwi_q
        df["rain_x_drain"]       = rain7 * drain
        df["rain7_over_mon"]     = rain7 / (rainM + 1e-3)
        df["elev_x_river"]       = elev * river
        df["ndvi_x_ndwi"]        = ndvi_q * ndwi_q
        df["ndwi_x_inund"]       = ndwi_q * inund
        df["inund_x_flood"]      = inund * hist_f
        df["infra_x_hosp"]       = infra * hosp
        df["infra_x_evac"]       = infra * evac
        df["hosp_x_evac"]        = hosp * evac
        df["pop_x_built"]        = pop * built
        df["flood_x_rain"]       = hist_f * rain7
        df["extreme_x_flood"]    = extreme * hist_f
        df["extreme_x_rain"]     = extreme * rain7
        df["terrain_x_river"]    = terrain * river
        df["socio_x_infra"]      = socio * infra
        df["seas_x_rain"]        = seas * rain7
        df["geo_x_rain"]         = df["dist_from_center"] * rain7
        df["lat_x_rain"]         = lat * rain7
        df["lon_x_river"]        = lon * river
        df["rain_x_pop"]         = rain7 * pop
        df["ndvi_x_rain"]        = ndvi_q * rain7
        df["elev_x_drain"]       = elev * drain
        df["rain_x_ndwi"]        = rain7 * ndwi_q
        df["elev_x_pop"]         = elev * pop
        df["seas_x_ndwi"]        = seas * ndwi_q
        df["infra_sq"]           = infra ** 2
        df["rain7_sq"]           = rain7 ** 2
        df["river_sq"]           = river ** 2
        df["rain7_cu"]           = rain7 ** 3
        df["elev_sq"]            = elev ** 2
        df["inund_sq"]           = inund ** 2
        df["drain_x_ndwi"]       = drain * ndwi_q
        df["socio_x_seas"]       = socio * seas
        df["extreme_x_terrain"]  = extreme * terrain
        df["built_x_rain"]       = built * rain7
        df["pop_x_drain"]        = pop * drain
        df["hist_x_extreme"]     = hist_f * extreme
        df["hist_x_terrain"]     = hist_f * terrain
        df["river_x_elev"]       = river * elev
        df["ndwi_sq"]            = ndwi_q ** 2
        df["infra_x_seas"]       = infra * seas

        # ── Physics features ──────────────────────────────────────────
        # Raw (unlogged) values for physics ratios
        rain7_raw  = df["rainfall_7d_mm"].fillna(0).values
        rainM_raw  = df["monthly_rainfall_mm"].fillna(100).values
        river_raw  = df["distance_to_river_m"].fillna(med.get("distance_to_river_m", 500)).values
        elev_raw   = df["elevation_m"].fillna(med.get("elevation_m", 50)).values
        built_raw  = df["built_up_percent_qmap"].fillna(0).values
        drain_raw  = df["drainage_index"].fillna(med.get("drainage_index", 0.5)).values

        # Yeo-Johnson variants (from fitted transformers, inference-safe)
        elev_yj  = self._apply_yj(df, "elevation_m",  med.get("elevation_m", 50))
        drain_yj = self._apply_yj(df, "drainage_index", med.get("drainage_index", 0.5))

        # Soil infiltration
        soil_infilt = (
            df["soil_type"].astype(str)
            .map(config.SOIL_INFILTRATION_MAP)
            .fillna(0.35)
            .values
        )
        df["soil_infiltration"]      = soil_infilt
        df["soil_saturation_limit"]  = rain7_raw / (soil_infilt + 0.1)

        # Fluvial and urban flood risk
        df["fluvial_risk_feat"]      = rain7_raw / (river_raw + 1.0)
        df["urban_runoff_potential"] = rain7_raw * built_raw / (drain_raw + 1e-5)

        # Pseudo topographic wetness index
        df["pseudo_twi"] = np.log1p((river_raw + 1.0) / (np.clip(elev_raw, 0, None) + 1.0))

        # Monsoon surge
        weekly_normal              = rainM_raw / 4.0 + 1.0
        df["monsoon_surge_ratio"]  = rain7_raw / weekly_normal
        wet_zone_flag = df["district"].astype(str).isin(config.WET_ZONE_DISTRICTS).astype(float).values
        df["monsoon_surge_impact"] = df["monsoon_surge_ratio"].values * wet_zone_flag

        # Cyclone belt exposure
        in_cyclone                  = df["district"].astype(str).isin(config.CYCLONE_DISTRICTS).astype(float).values
        df["cyclone_vulnerability"] = in_cyclone * extreme.values

        # Elevation divergence from Yeo-Johnson (captures non-linear risk zone)
        df["elevation_divergence"] = elev_raw - elev_yj
        df["drainage_deficit"]     = (rain7.values + 1.0) * (1.0 - drain_yj)

        # Binary risk signals
        flood_ev  = df["flood_occurrence_current_event"].astype(str).str.strip()
        good_live = df["is_good_to_live"].astype(str).str.strip()
        df["confirmed_severe_risk"] = (
            (flood_ev == "Yes") & (good_live == "No") &
            (df["inundation_area_sqm"].fillna(0) > 0)
        ).astype(float)
        df["confirmed_risk"] = ((flood_ev == "Yes") & (good_live == "No")).astype(float)
        df["no_flood_confirmed"] = ((flood_ev == "No") & (good_live == "Yes")).astype(float)

        df["rain_spike_ratio"]      = rain7_raw / (rainM_raw + 1e-6)
        df["is_repeat_flood_zone"]  = (df["historical_flood_count"].fillna(0) > 2).astype(float)
        df["flood_pressure"]        = extreme.values * seas.values
        df["water_signal"]          = ndwi_q.clip(lower=0)
        df["pooling_vulnerability"] = ndwi_q.clip(lower=0).values * (1.0 - ndvi_q.clip(-1, 1).values)
        df["infra_resilience"]      = infra.values / (np.expm1(pop.values) + 1e-6)
        df["inundation_density_risk"] = inund.values / (np.expm1(pop.values) + 1e-6)

        # Multi-resolution grid IDs (TE'd later, then dropped as strings)
        lat_v = lat.values
        lon_v = lon.values
        df["grid_id_100"] = (lat_v / 1.000).astype(int).astype(str) + "_" + (lon_v / 1.000).astype(int).astype(str)
        df["grid_id_050"] = (lat_v / 0.500).astype(int).astype(str) + "_" + (lon_v / 0.500).astype(int).astype(str)
        df["grid_id_025"] = (lat_v / 0.250).astype(int).astype(str) + "_" + (lon_v / 0.250).astype(int).astype(str)
        df["grid_id_012"] = (lat_v / 0.125).astype(int).astype(str) + "_" + (lon_v / 0.125).astype(int).astype(str)

        return df

    # ════════════════════════════════════════════════════════════════
    # Step 4: district stats / quantiles / ranks
    # ════════════════════════════════════════════════════════════════
    def _fit_district_stats(self, df: pd.DataFrame):
        agg_cols = [c for c in config.AGG_COLS if c in df.columns]
        stats = df.groupby("district")[agg_cols].agg(["mean", "std"]).reset_index()
        stats.columns = ["district"] + [f"dist_{c}_{s}" for c in agg_cols for s in ["mean", "std"]]
        self.district_stats_df = stats.fillna(0.0)

        qcols = [c for c in config.QCOLS if c in df.columns]
        q25 = df.groupby("district")[qcols].quantile(0.25).reset_index()
        q75 = df.groupby("district")[qcols].quantile(0.75).reset_index()
        q25.columns = ["district"] + [f"dist_{c}_q25" for c in qcols]
        q75.columns = ["district"] + [f"dist_{c}_q75" for c in qcols]
        iqr = q75.copy()
        for c in qcols:
            iqr[f"dist_{c}_q75"] = q75[f"dist_{c}_q75"] - q25[f"dist_{c}_q25"]
        iqr.columns = ["district"] + [f"dist_{c}_iqr" for c in qcols]
        self.district_q25 = q25
        self.district_q75 = q75
        self.district_iqr = iqr
        self.qcols = qcols

    def _merge_district_stats(self, df: pd.DataFrame) -> pd.DataFrame:
        return df.merge(self.district_stats_df, on="district", how="left").fillna(
            {c: 0.0 for c in self.district_stats_df.columns if c != "district"}
        )

    def _merge_district_quantiles(self, df: pd.DataFrame) -> pd.DataFrame:
        for q_df in (self.district_q25, self.district_q75, self.district_iqr):
            df = df.merge(q_df, on="district", how="left")
        fill_cols = [c for c in df.columns if c.startswith("dist_") and (c.endswith("_q25") or c.endswith("_q75") or c.endswith("_iqr"))]
        df[fill_cols] = df[fill_cols].fillna(0.0)
        return df

    def _fit_district_ranks(self, df: pd.DataFrame):
        self.district_rank_sorted: dict[str, dict[str, np.ndarray]] = {}
        rank_cols = [c for c in config.RANK_COLS if c in df.columns]
        self.rank_cols = rank_cols
        for col in rank_cols:
            per_district = {}
            for d, g in df.groupby("district")[col]:
                vals = g.dropna().to_numpy()
                vals.sort()
                per_district[d] = vals
            self.district_rank_sorted[col] = per_district

    def _merge_district_ranks(self, df: pd.DataFrame) -> pd.DataFrame:
        for col in self.rank_cols:
            per_district = self.district_rank_sorted[col]
            out = np.empty(len(df))
            districts = df["district"].to_numpy()
            values = df[col].to_numpy(dtype=float)
            for i, (d, v) in enumerate(zip(districts, values)):
                sorted_vals = per_district.get(d, np.array([]))
                out[i] = _rank_pct(sorted_vals, v)
            df[f"{col}_dist_rank"] = out
        return df

    # ════════════════════════════════════════════════════════════════
    # Topo clusters (GroupKFold groups for spatial de-leakage)
    # ════════════════════════════════════════════════════════════════
    def _fit_topo_clusters(self, df: pd.DataFrame):
        feats = ["latitude", "longitude", "elevation_m"]
        X = np.column_stack([
            df[c].fillna(self.medians.get(c, 0.0)).to_numpy(dtype=float) for c in feats
        ])
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
        km = KMeans(n_clusters=config.KMEANS_TOPO_K, random_state=config.RANDOM_STATE, n_init=10)
        km.fit(X_scaled)
        self.topo_scaler = scaler
        self.topo_kmeans = km
        self.train_topo_groups: np.ndarray = km.predict(X_scaled)

    def _get_topo_groups(self, df: pd.DataFrame) -> np.ndarray:
        feats = ["latitude", "longitude", "elevation_m"]
        X = np.column_stack([
            df[c].fillna(self.medians.get(c, 0.0)).to_numpy(dtype=float) for c in feats
        ])
        return self.topo_kmeans.predict(self.topo_scaler.transform(X))

    # ════════════════════════════════════════════════════════════════
    # Step 5: KMeans cluster features
    # ════════════════════════════════════════════════════════════════
    def _kmeans_inputs(self, df: pd.DataFrame) -> np.ndarray:
        feats = []
        for c in config.GEO_FEATS:
            col = df[c] if c in df.columns else pd.Series(np.nan, index=df.index)
            fill = self.medians.get(c, 0.0)
            feats.append(col.fillna(fill).to_numpy(dtype=float))
        return np.column_stack(feats)

    def _fit_kmeans(self, df: pd.DataFrame):
        X = self._kmeans_inputs(df)
        self.kmeans_models = {}
        for k in config.KMEANS_KS:
            km = KMeans(n_clusters=k, random_state=config.RANDOM_STATE, n_init=10)
            km.fit(X)
            self.kmeans_models[k] = km

    def _add_kmeans_features(self, df: pd.DataFrame) -> pd.DataFrame:
        X = self._kmeans_inputs(df)
        for k, km in self.kmeans_models.items():
            df[f"kmeans_{k}"]      = km.predict(X).astype(float)
            df[f"kmeans_{k}_dist"] = km.transform(X).min(axis=1)
        return df

    # ════════════════════════════════════════════════════════════════
    # Frequency encoding
    # ════════════════════════════════════════════════════════════════
    def _fit_freq_encoding(self, df: pd.DataFrame):
        self.freq_maps: dict[str, dict[str, float]] = {}
        total = float(len(df))
        for col in config.CAT_COLS + config.COMPOUND_CAT_COLS:
            if col in df.columns:
                counts = df[col].astype(str).value_counts().to_dict()
                self.freq_maps[col] = {k: v / total for k, v in counts.items()}

    def _add_freq_features(self, df: pd.DataFrame) -> pd.DataFrame:
        for col, freq_map in self.freq_maps.items():
            if col in df.columns:
                df[f"{col}_freq"] = df[col].astype(str).map(freq_map).fillna(0.0)
        return df

    # ════════════════════════════════════════════════════════════════
    # Denoising Autoencoder (16-dim bottleneck features)
    # ════════════════════════════════════════════════════════════════
    def _fit_dae(self, df: pd.DataFrame):
        exclude = set(config.DROP_COLS) | {config.TARGET}
        # String/object columns are handled via TE/label encoding, not DAE
        dae_cols = [
            c for c in df.columns
            if c not in exclude and df[c].dtype != object
            and not c.endswith("_te") and not c.endswith("_te_std")
        ]
        self.dae_cols = dae_cols

        X = df[dae_cols].fillna(0).values.astype(np.float64)
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
        self.dae_scaler = scaler

        # Swap noise: 15% of values replaced with random values from other rows
        rng = np.random.RandomState(42)
        X_corrupted = X_scaled.copy()
        mask = rng.rand(*X_scaled.shape) < 0.15
        row_draws = rng.randint(0, X_scaled.shape[0], size=X_scaled.shape)
        X_corrupted[mask] = X_scaled[row_draws, np.arange(X_scaled.shape[1])][mask.nonzero()[0], mask.nonzero()[1]]

        dae = MLPRegressor(
            hidden_layer_sizes=(64, 16, 64),
            activation="relu",
            max_iter=50,
            random_state=42,
            learning_rate_init=1e-3,
            early_stopping=False,
            verbose=False,
        )
        dae.fit(X_corrupted, X_scaled)
        self.dae_model = dae

    def _get_bottleneck(self, X_scaled: np.ndarray) -> np.ndarray:
        a1 = np.maximum(0, X_scaled @ self.dae_model.coefs_[0] + self.dae_model.intercepts_[0])
        a2 = np.maximum(0, a1 @ self.dae_model.coefs_[1] + self.dae_model.intercepts_[1])
        return a2  # (n, 16)

    def _add_dae_features(self, df: pd.DataFrame) -> pd.DataFrame:
        cols = [c for c in self.dae_cols if c in df.columns]
        X = df[cols].fillna(0).values.astype(np.float64)
        X_scaled = self.dae_scaler.transform(X)
        bottleneck = self._get_bottleneck(X_scaled)
        for i in range(bottleneck.shape[1]):
            df[f"dae_{i}"] = bottleneck[:, i]
        return df

    # ════════════════════════════════════════════════════════════════
    # Step 6: KNN haversine target-stats features
    # ════════════════════════════════════════════════════════════════
    def _knn_coords(self, df: pd.DataFrame):
        lat = df["latitude"].fillna(self.medians.get("latitude", 7.9)).to_numpy(dtype=float)
        lon = df["longitude"].fillna(self.medians.get("longitude", 80.7)).to_numpy(dtype=float)
        return _haversine_coords(lat, lon)

    @staticmethod
    def _knn_stats(neighbor_y: np.ndarray, dists: np.ndarray) -> dict[str, np.ndarray]:
        w = 1.0 / (dists ** 2 + 1e-8)
        w /= w.sum(axis=1, keepdims=True)
        q75 = np.percentile(neighbor_y, 75, axis=1)
        q25 = np.percentile(neighbor_y, 25, axis=1)
        return {
            "mean": neighbor_y.mean(axis=1),
            "std":  neighbor_y.std(axis=1),
            "min":  neighbor_y.min(axis=1),
            "max":  neighbor_y.max(axis=1),
            "idw":  (neighbor_y * w).sum(axis=1),
            "iqr":  q75 - q25,
        }

    def _add_knn_features_oof(self, df: pd.DataFrame) -> pd.DataFrame:
        coords = self._knn_coords(df)
        y = df[config.TARGET].to_numpy(dtype=float)
        n = len(df)
        results = {f"knn{K}_{s}": np.zeros(n) for K in config.KNN_K_VALUES for s in ["mean", "std", "min", "max", "idw", "iqr"]}

        # GroupKFold on topo clusters to prevent spatial leakage
        groups = getattr(self, "train_topo_groups", None)
        if groups is not None:
            kf = GroupKFold(n_splits=config.N_FOLDS)
            splits = list(kf.split(coords, y, groups=groups))
        else:
            kf = KFold(n_splits=config.N_FOLDS, shuffle=True, random_state=0)
            splits = list(kf.split(coords))

        for tr_idx, va_idx in splits:
            tree = BallTree(coords[tr_idx], metric="haversine")
            for K in config.KNN_K_VALUES:
                k_eff = min(K, len(tr_idx))
                dists, idxs = tree.query(coords[va_idx], k=k_eff)
                neighbor_y = y[tr_idx][idxs]
                stats = self._knn_stats(neighbor_y, dists)
                for s, vals in stats.items():
                    results[f"knn{K}_{s}"][va_idx] = vals

        for col, vals in results.items():
            df[col] = vals

        self.full_tree    = BallTree(coords, metric="haversine")
        self.train_targets = y
        return df

    def _add_knn_features_full(self, df: pd.DataFrame) -> pd.DataFrame:
        coords = self._knn_coords(df)
        n_train = len(self.train_targets)
        for K in config.KNN_K_VALUES:
            k_eff = min(K, n_train)
            dists, idxs = self.full_tree.query(coords, k=k_eff)
            neighbor_y = self.train_targets[idxs]
            stats = self._knn_stats(neighbor_y, dists)
            for s, vals in stats.items():
                df[f"knn{K}_{s}"] = vals
        return df

    # ════════════════════════════════════════════════════════════════
    # Step 7: 5-stat Bayesian target encoding (GroupKFold)
    # ════════════════════════════════════════════════════════════════
    def _te_columns(self) -> list[str]:
        base = (
            config.CAT_COLS
            + config.COMPOUND_CAT_COLS
            + ["geo_cluster"]
            + [f"kmeans_{k}" for k in config.KMEANS_KS]
            + ["grid_id_100", "grid_id_050", "grid_id_025", "grid_id_012"]
        )
        return base

    def _fit_target_encoding_oof(self, df: pd.DataFrame) -> pd.DataFrame:
        y = df[config.TARGET].to_numpy(dtype=float)
        self.global_mean_target = float(y.mean())
        self.global_std_target  = float(y.std() + 1e-8)
        self.global_q25_target  = float(np.percentile(y, 25))
        self.global_q75_target  = float(np.percentile(y, 75))

        te_cols = self._te_columns()
        sm = config.TE_SMOOTHING

        # GroupKFold splits
        groups = getattr(self, "train_topo_groups", None)
        if groups is not None:
            kf = GroupKFold(n_splits=config.N_FOLDS)
            splits = list(kf.split(df, y, groups=groups))
        else:
            kf = KFold(n_splits=config.N_FOLDS, shuffle=True, random_state=0)
            splits = list(kf.split(df))

        self.te_maps: dict[str, dict[str, dict]] = {}

        for col in te_cols:
            col_vals = df[col].astype(str).values

            oof_mean = np.full(len(df), self.global_mean_target)
            oof_std  = np.full(len(df), self.global_std_target)
            oof_q25  = np.full(len(df), self.global_q25_target)
            oof_q75  = np.full(len(df), self.global_q75_target)
            oof_cnt  = np.zeros(len(df))

            for tr_idx, va_idx in splits:
                tr_y   = y[tr_idx]
                tr_col = col_vals[tr_idx]
                va_col = col_vals[va_idx]

                g_mean = float(tr_y.mean())
                g_std  = float(tr_y.std() + 1e-8)
                g_q25  = float(np.percentile(tr_y, 25))
                g_q75  = float(np.percentile(tr_y, 75))

                mean_map: dict[str, float] = {}
                std_map:  dict[str, float] = {}
                q25_map:  dict[str, float] = {}
                q75_map:  dict[str, float] = {}
                cnt_map:  dict[str, float] = {}

                unique_vals, inv_idx = np.unique(tr_col, return_inverse=True)
                for ui, v in enumerate(unique_vals):
                    arr = tr_y[inv_idx == ui]
                    n = len(arr)
                    cnt_map[v]  = np.log1p(n)
                    mean_map[v] = (n * arr.mean()                  + sm * g_mean) / (n + sm)
                    s           = arr.std()  if n > 1 else g_std
                    std_map[v]  = (n * s                           + sm * g_std)  / (n + sm)
                    q25v        = float(np.percentile(arr, 25)) if n > 1 else g_q25
                    q75v        = float(np.percentile(arr, 75)) if n > 1 else g_q75
                    q25_map[v]  = (n * q25v                       + sm * g_q25)  / (n + sm)
                    q75_map[v]  = (n * q75v                       + sm * g_q75)  / (n + sm)

                oof_mean[va_idx] = [mean_map.get(v, g_mean) for v in va_col]
                oof_std[va_idx]  = [std_map.get(v,  g_std)  for v in va_col]
                oof_q25[va_idx]  = [q25_map.get(v,  g_q25)  for v in va_col]
                oof_q75[va_idx]  = [q75_map.get(v,  g_q75)  for v in va_col]
                oof_cnt[va_idx]  = [cnt_map.get(v,  0.0)    for v in va_col]

            df[f"{col}_te"]     = oof_mean
            df[f"{col}_te_std"] = oof_std
            df[f"{col}_te_q25"] = oof_q25
            df[f"{col}_te_q75"] = oof_q75
            df[f"{col}_te_cnt"] = oof_cnt

            # Full-train maps for inference
            g_mean = self.global_mean_target
            g_std  = self.global_std_target
            g_q25  = self.global_q25_target
            g_q75  = self.global_q75_target

            mean_map, std_map, q25_map, q75_map, cnt_map = {}, {}, {}, {}, {}
            unique_vals, inv_idx = np.unique(col_vals, return_inverse=True)
            for ui, v in enumerate(unique_vals):
                arr = y[inv_idx == ui]
                n = len(arr)
                cnt_map[v]  = np.log1p(n)
                mean_map[v] = (n * arr.mean()                  + sm * g_mean) / (n + sm)
                s           = arr.std()  if n > 1 else g_std
                std_map[v]  = (n * s                           + sm * g_std)  / (n + sm)
                q25v        = float(np.percentile(arr, 25)) if n > 1 else g_q25
                q75v        = float(np.percentile(arr, 75)) if n > 1 else g_q75
                q25_map[v]  = (n * q25v                       + sm * g_q25)  / (n + sm)
                q75_map[v]  = (n * q75v                       + sm * g_q75)  / (n + sm)

            self.te_maps[col] = {
                "mean": mean_map, "std": std_map,
                "q25":  q25_map,  "q75": q75_map, "cnt": cnt_map,
            }

        return df

    def _apply_target_encoding(self, df: pd.DataFrame) -> pd.DataFrame:
        for col in self._te_columns():
            if col not in self.te_maps:
                continue
            maps   = self.te_maps[col]
            col_str = df[col].astype(str)
            df[f"{col}_te"]     = col_str.map(maps["mean"]).fillna(self.global_mean_target)
            df[f"{col}_te_std"] = col_str.map(maps["std"]).fillna(self.global_std_target)
            df[f"{col}_te_q25"] = col_str.map(maps["q25"]).fillna(self.global_q25_target)
            df[f"{col}_te_q75"] = col_str.map(maps["q75"]).fillna(self.global_q75_target)
            df[f"{col}_te_cnt"] = col_str.map(maps["cnt"]).fillna(0.0)
        return df

    # ════════════════════════════════════════════════════════════════
    # Step 8: label encoding
    # ════════════════════════════════════════════════════════════════
    def _fit_label_encoding(self, df: pd.DataFrame) -> pd.DataFrame:
        self.label_maps: dict[str, dict[str, float]] = {}
        for col in config.CAT_COLS + config.COMPOUND_CAT_COLS:
            if col not in df.columns:
                continue
            cats = sorted(df[col].astype(str).unique())
            mapping = {c: float(i) for i, c in enumerate(cats)}
            self.label_maps[col] = mapping
            df[col] = df[col].astype(str).map(mapping).astype(float)
        return df

    def _apply_label_encoding(self, df: pd.DataFrame) -> pd.DataFrame:
        for col, mapping in self.label_maps.items():
            if col not in df.columns:
                df[col] = float(len(mapping))
                continue
            unknown = float(len(mapping))
            df[col] = df[col].astype(str).map(mapping).fillna(unknown).astype(float)
        return df

    # ════════════════════════════════════════════════════════════════
    # Metadata helpers for the API / frontend
    # ════════════════════════════════════════════════════════════════
    def categorical_options(self, train_df: pd.DataFrame) -> dict[str, list[str]]:
        options = {}
        for col in config.RAW_CAT_COLS:
            vals = sorted(train_df[col].dropna().astype(str).unique().tolist())
            options[col] = vals
        return options

    def district_defaults(self) -> dict[str, dict[str, float]]:
        out = {}
        for _, row in self.district_stats_df.iterrows():
            d = row["district"]
            out[d] = {
                col: float(row.get(f"dist_{col}_mean", self.global_means.get(col, 0.0)))
                for col in config.ADVANCED_COLS
            }
        return out
