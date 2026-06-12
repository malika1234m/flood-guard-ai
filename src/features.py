"""
FeatureEngineer: production version of the Initial Round (v10) feature
pipeline, restructured as a fit/transform object so it can be:
  - fit once on the training data and saved (`models/v1/feature_engineer.joblib`)
  - applied to new, single-record inputs at inference time

Compared to `solution_v10.py`, the feature *philosophy* is unchanged
(geo/interaction features, district stats/quantiles/ranks, KMeans
clusters, haversine-KNN target stats, target encoding, label encoding).
What changes is *how* leakage-safe statistics are computed so a single
new row can be transformed without access to the training set at
request time:
  - District stats/quantiles/ranks: precomputed lookup tables.
  - KMeans: fitted cluster models.
  - KNN target stats: a BallTree over training coordinates + targets.
  - Target encoding: out-of-fold for the training matrix, full-train
    mean maps for new data.
  - `*_qmap` columns (no raw counterpart): learned via an empirical
    monotonic mapping from the corresponding raw column.
  - Composite indices with no raw counterpart (`seasonal_index`, etc.):
    default to the district mean when not supplied.
"""
from __future__ import annotations

import warnings

import numpy as np
import pandas as pd
import joblib
from sklearn.cluster import KMeans
from sklearn.model_selection import KFold
from sklearn.neighbors import BallTree

from . import config

# Negative rainfall/distance values in the synthetic dataset push log1p()
# out of its domain (NaN), exactly as in v10; tree models handle NaN as a
# missing-value split. Iterative `df[col] = ...` assignments during target
# encoding fragment the frame; both warnings are cosmetic.
warnings.filterwarnings("ignore", category=RuntimeWarning, message="invalid value encountered in log1p")
warnings.filterwarnings("ignore", category=pd.errors.PerformanceWarning)


# ── small stateless helpers ─────────────────────────────────────────────
def _haversine_coords(lat, lon):
    return np.deg2rad(np.column_stack([lat, lon]))


def _fit_monotonic_map(raw: pd.Series, mapped: pd.Series):
    """Learn an empirical monotonic mapping raw -> mapped from paired
    training observations (used for the dataset's `_qmap` columns)."""
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
    """Approximate pandas' `rank(pct=True)` for `value` against the
    empirical distribution `sorted_values` (average-rank tie handling)."""
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

        # Learn qmap mappings + defaults from the raw training columns
        # (which already contain both the raw and `_qmap`/index columns).
        self._fit_qmaps(df)
        self._fit_medians(df)

        df = self._step_interactions(df)

        self._fit_district_stats(df)
        df = self._merge_district_stats(df)
        df = self._merge_district_quantiles(df)

        self._fit_district_ranks(df)
        df = self._merge_district_ranks(df)

        self._fit_kmeans(df)
        df = self._add_kmeans_features(df)

        df = self._add_knn_features_oof(df)

        df = self._fit_target_encoding_oof(df)
        df = self._fit_label_encoding(df)

        self.feature_cols = [
            c for c in df.columns if c not in config.DROP_COLS + [config.TARGET]
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
        df["gen_month"] = dt.dt.month.astype(int)
        df["gen_year"] = dt.dt.year.astype(int)
        df["gen_dayofyear"] = dt.dt.dayofyear.astype(int)
        df["is_sw_monsoon"] = df["gen_month"].isin([5, 6, 7, 8, 9]).astype(float)
        df["is_ne_monsoon"] = df["gen_month"].isin([10, 11, 12, 1]).astype(float)
        df["month_sin"] = np.sin(2 * np.pi * df["gen_month"] / 12)
        df["month_cos"] = np.cos(2 * np.pi * df["gen_month"] / 12)
        df["day_sin"] = np.sin(2 * np.pi * df["gen_dayofyear"] / 365)
        df["day_cos"] = np.cos(2 * np.pi * df["gen_dayofyear"] / 365)

        # is_synthetic flag
        if "is_synthetic" in df.columns:
            df["is_synthetic_num"] = (df["is_synthetic"] == True).astype(float)  # noqa: E712
        else:
            df["is_synthetic_num"] = 0.0

        # Reason-for-not-good-to-live text features
        reason = df["reason_not_good_to_live"] if "reason_not_good_to_live" in df.columns else pd.Series([""] * len(df), index=df.index)
        r = reason.fillna("").astype(str).str.lower()
        df["reason_has_flood"] = r.str.contains("flood").astype(float)
        df["reason_has_infra"] = r.str.contains("infra").astype(float)
        df["reason_has_road"] = r.str.contains("road").astype(float)
        df["reason_n_issues"] = df["reason_has_flood"] + df["reason_has_infra"] + df["reason_has_road"]

        # Event / habitability defaults
        for col, default in config.EVENT_DEFAULTS.items():
            if col not in df.columns:
                df[col] = default
            else:
                df[col] = df[col].fillna(default)

        # Raw categorical columns: fill missing district/landcover/etc.
        for col in config.RAW_CAT_COLS:
            if col not in df.columns:
                df[col] = "Unknown"
            else:
                df[col] = df[col].fillna("Unknown").astype(str)

        return df

    # ════════════════════════════════════════════════════════════════
    # qmap / advanced-index handling (transform-side only)
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
    # Step 2: medians for fillna in interaction features
    # ════════════════════════════════════════════════════════════════
    def _fit_medians(self, df: pd.DataFrame):
        median_cols = [
            "latitude", "longitude", "elevation_m", "distance_to_river_m",
            "drainage_index", "rainfall_7d_mm", "monthly_rainfall_mm",
            "ndvi_qmap", "ndwi_qmap",
        ]
        self.medians = {c: float(df[c].median()) for c in median_cols if c in df.columns}
        self.global_means = {c: float(df[c].mean()) for c in config.ADVANCED_COLS if c in df.columns}

    # ════════════════════════════════════════════════════════════════
    # Step 3: interaction / geo features (ported from v10 engineer())
    # ════════════════════════════════════════════════════════════════
    def _step_interactions(self, df: pd.DataFrame) -> pd.DataFrame:
        med = self.medians
        lat = df["latitude"].fillna(med["latitude"])
        lon = df["longitude"].fillna(med["longitude"])
        df["dist_from_center"] = np.sqrt((lat - 8.0) ** 2 + (lon - 80.8) ** 2)
        df["lat_lon_prod"] = lat * lon
        df["lat_from_south"] = lat - 6.0
        df["geo_cluster"] = (lat * 4).round(0) * 100 + (lon * 4).round(0)
        df["inund_log1p"] = np.log1p(df["inundation_area_sqm"].fillna(0))
        df["hist_flood_sqrt"] = np.sqrt(df["historical_flood_count"].fillna(0))

        river = np.log1p(df["distance_to_river_m"].fillna(med["distance_to_river_m"]))
        rain7 = np.log1p(df["rainfall_7d_mm"].fillna(0))
        rainM = np.log1p(df["monthly_rainfall_mm"].fillna(0))
        drain = df["drainage_index"].fillna(med["drainage_index"])
        ndvi_q = df["ndvi_qmap"].fillna(0)
        ndwi_q = df["ndwi_qmap"].fillna(0)
        elev = df["elevation_m"].fillna(med["elevation_m"])
        pop = np.log1p(df["population_density_per_km2"].fillna(0))
        built = df["built_up_percent_qmap"].fillna(0)
        hosp = np.log1p(df["nearest_hospital_km"].fillna(0))
        evac = np.log1p(df["nearest_evac_km"].fillna(0))
        infra = df["infrastructure_score"].fillna(0)
        inund = df["inund_log1p"]
        hist_f = df["hist_flood_sqrt"]
        terrain = df["terrain_roughness_index"]
        extreme = df["extreme_weather_index"]
        socio = df["socioeconomic_status_index"]
        seas = df["seasonal_index"]

        df["river_x_ndwi"] = river * ndwi_q
        df["rain_x_drain"] = rain7 * drain
        df["rain7_over_mon"] = rain7 / (rainM + 1e-3)
        df["elev_x_river"] = elev * river
        df["ndvi_x_ndwi"] = ndvi_q * ndwi_q
        df["ndwi_x_inund"] = ndwi_q * inund
        df["inund_x_flood"] = inund * hist_f
        df["infra_x_hosp"] = infra * hosp
        df["infra_x_evac"] = infra * evac
        df["hosp_x_evac"] = hosp * evac
        df["pop_x_built"] = pop * built
        df["flood_x_rain"] = hist_f * rain7
        df["extreme_x_flood"] = extreme * hist_f
        df["extreme_x_rain"] = extreme * rain7
        df["terrain_x_river"] = terrain * river
        df["socio_x_infra"] = socio * infra
        df["seas_x_rain"] = seas * rain7
        df["geo_x_rain"] = df["dist_from_center"] * rain7
        df["lat_x_rain"] = lat * rain7
        df["lon_x_river"] = lon * river
        df["rain_x_pop"] = rain7 * pop
        df["ndvi_x_rain"] = ndvi_q * rain7
        df["elev_x_drain"] = elev * drain
        df["rain_x_ndwi"] = rain7 * ndwi_q
        df["elev_x_pop"] = elev * pop
        df["seas_x_ndwi"] = seas * ndwi_q
        df["infra_sq"] = infra ** 2
        df["rain7_sq"] = rain7 ** 2
        df["river_sq"] = river ** 2
        df["rain7_cu"] = rain7 ** 3
        df["elev_sq"] = elev ** 2
        df["inund_sq"] = inund ** 2
        df["drain_x_ndwi"] = drain * ndwi_q
        df["socio_x_seas"] = socio * seas
        df["extreme_x_terrain"] = extreme * terrain
        df["built_x_rain"] = built * rain7
        df["pop_x_drain"] = pop * drain
        df["hist_x_extreme"] = hist_f * extreme
        df["hist_x_terrain"] = hist_f * terrain
        df["river_x_elev"] = river * elev
        df["ndwi_sq"] = ndwi_q ** 2
        df["infra_x_seas"] = infra * seas
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
            df[f"kmeans_{k}"] = km.predict(X).astype(float)
            df[f"kmeans_{k}_dist"] = km.transform(X).min(axis=1)
        return df

    # ════════════════════════════════════════════════════════════════
    # Step 6: KNN haversine target-stats features
    # ════════════════════════════════════════════════════════════════
    def _knn_coords(self, df: pd.DataFrame):
        lat = df["latitude"].fillna(self.medians["latitude"]).to_numpy(dtype=float)
        lon = df["longitude"].fillna(self.medians["longitude"]).to_numpy(dtype=float)
        return _haversine_coords(lat, lon)

    @staticmethod
    def _knn_stats(neighbor_y: np.ndarray, dists: np.ndarray) -> dict[str, np.ndarray]:
        w = 1.0 / (dists ** 2 + 1e-8)
        w /= w.sum(axis=1, keepdims=True)
        q75 = np.percentile(neighbor_y, 75, axis=1)
        q25 = np.percentile(neighbor_y, 25, axis=1)
        return {
            "mean": neighbor_y.mean(axis=1),
            "std": neighbor_y.std(axis=1),
            "min": neighbor_y.min(axis=1),
            "max": neighbor_y.max(axis=1),
            "idw": (neighbor_y * w).sum(axis=1),
            "iqr": q75 - q25,
        }

    def _add_knn_features_oof(self, df: pd.DataFrame) -> pd.DataFrame:
        coords = self._knn_coords(df)
        y = df[config.TARGET].to_numpy(dtype=float)
        n = len(df)
        results = {f"knn{K}_{s}": np.zeros(n) for K in config.KNN_K_VALUES for s in ["mean", "std", "min", "max", "idw", "iqr"]}

        kf = KFold(n_splits=config.N_FOLDS, shuffle=True, random_state=0)
        for tr_idx, va_idx in kf.split(coords):
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

        # Store full-data tree + targets for transforming new records.
        self.full_tree = BallTree(coords, metric="haversine")
        self.train_targets = y
        return df

    def _add_knn_features_full(self, df: pd.DataFrame) -> pd.DataFrame:
        coords = self._knn_coords(df)
        for K in config.KNN_K_VALUES:
            dists, idxs = self.full_tree.query(coords, k=K)
            neighbor_y = self.train_targets[idxs]
            stats = self._knn_stats(neighbor_y, dists)
            for s, vals in stats.items():
                df[f"knn{K}_{s}"] = vals
        return df

    # ════════════════════════════════════════════════════════════════
    # Step 7: target encoding
    # ════════════════════════════════════════════════════════════════
    def _te_columns(self) -> list[str]:
        return config.CAT_COLS + ["geo_cluster"] + [f"kmeans_{k}" for k in config.KMEANS_KS]

    def _fit_target_encoding_oof(self, df: pd.DataFrame) -> pd.DataFrame:
        self.global_mean_target = float(df[config.TARGET].mean())
        self.te_maps = {}
        kf = KFold(n_splits=config.N_FOLDS, shuffle=True, random_state=0)
        for col in self._te_columns():
            df[f"{col}_te"] = 0.0
            for tr_idx, va_idx in kf.split(df):
                means = df.iloc[tr_idx].groupby(col)[config.TARGET].mean()
                df.loc[df.index[va_idx], f"{col}_te"] = (
                    df.iloc[va_idx][col].map(means).fillna(self.global_mean_target).to_numpy()
                )
            self.te_maps[col] = df.groupby(col)[config.TARGET].mean().to_dict()
        return df

    def _apply_target_encoding(self, df: pd.DataFrame) -> pd.DataFrame:
        for col in self._te_columns():
            df[f"{col}_te"] = df[col].map(self.te_maps[col]).fillna(self.global_mean_target)
        return df

    # ════════════════════════════════════════════════════════════════
    # Step 8: label encoding
    # ════════════════════════════════════════════════════════════════
    def _fit_label_encoding(self, df: pd.DataFrame) -> pd.DataFrame:
        self.label_maps = {}
        for col in config.CAT_COLS:
            cats = sorted(df[col].astype(str).unique())
            mapping = {c: i for i, c in enumerate(cats)}
            self.label_maps[col] = mapping
            df[col] = df[col].astype(str).map(mapping).astype(float)
        return df

    def _apply_label_encoding(self, df: pd.DataFrame) -> pd.DataFrame:
        for col in config.CAT_COLS:
            mapping = self.label_maps[col]
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
        """Per-district mean values for the ADVANCED_COLS, used to
        pre-fill the optional form fields."""
        out = {}
        for _, row in self.district_stats_df.iterrows():
            d = row["district"]
            out[d] = {
                col: float(row.get(f"dist_{col}_mean", self.global_means.get(col, 0.0)))
                for col in config.ADVANCED_COLS
            }
        return out
