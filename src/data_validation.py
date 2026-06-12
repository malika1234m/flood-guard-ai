"""
Lightweight data validation for the flood-risk pipeline.

Two responsibilities:
  1. `validate_training_data` - sanity-checks the raw train/test CSVs
     before feature engineering (schema + null + range report).
  2. `flag_out_of_distribution` - checks a single inference record
     against expected ranges, used for monitoring / drift flags.

Deliberately dependency-free (pandas only) so it can run in the training
pipeline, the API, and CI without extra packages.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import pandas as pd

from . import config

# Columns every training row must have (the raw competition schema).
REQUIRED_TRAIN_COLUMNS = (
    [config.ID_COL, config.TARGET]
    + config.RAW_NUMERIC_COLS
    + config.RAW_CAT_COLS
    + list(config.EVENT_DEFAULTS.keys())
    + list(config.QMAP_SOURCE.keys())
    + config.ADVANCED_COLS
)

# Soft bounds for raw numeric inputs. The source dataset contains some
# noisy/extreme synthetic values (e.g. negative rainfall), so values
# outside these ranges are *flagged*, not rejected.
NUMERIC_BOUNDS: dict[str, tuple[float, float]] = {
    "latitude": (5.0, 10.5),
    "longitude": (79.0, 82.5),
    "elevation_m": (-100, 2500),
    "distance_to_river_m": (-500, 20000),
    "population_density_per_km2": (0, 10000),
    "built_up_percent": (0, 200),
    "rainfall_7d_mm": (-100, 1200),
    "monthly_rainfall_mm": (-100, 2500),
    "drainage_index": (0, 2),
    "ndvi": (-1, 2),
    "ndwi": (-1.5, 2),
    "historical_flood_count": (0, 10),
    "infrastructure_score": (0, 100),
    "nearest_hospital_km": (0, 200),
    "nearest_evac_km": (0, 200),
}


@dataclass
class ValidationReport:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def is_valid(self) -> bool:
        return not self.errors

    def __str__(self) -> str:
        lines = []
        if self.errors:
            lines.append(f"ERRORS ({len(self.errors)}):")
            lines += [f"  - {e}" for e in self.errors]
        if self.warnings:
            lines.append(f"WARNINGS ({len(self.warnings)}):")
            lines += [f"  - {w}" for w in self.warnings]
        return "\n".join(lines) if lines else "OK - no issues found"


def validate_training_data(df: pd.DataFrame, name: str = "dataset") -> ValidationReport:
    """Schema + null + range sanity check for a raw train/test dataframe."""
    report = ValidationReport()

    missing_cols = [c for c in REQUIRED_TRAIN_COLUMNS if c not in df.columns]
    if missing_cols:
        report.errors.append(f"{name}: missing required columns: {missing_cols}")

    if config.TARGET in df.columns:
        n_null_target = df[config.TARGET].isna().sum()
        if n_null_target:
            report.errors.append(f"{name}: target column has {n_null_target} null values")
        out_of_range = ((df[config.TARGET] < 0) | (df[config.TARGET] > 1)).sum()
        if out_of_range:
            report.errors.append(f"{name}: {out_of_range} target values outside [0, 1]")

    for col, (lo, hi) in NUMERIC_BOUNDS.items():
        if col not in df.columns:
            continue
        null_pct = 100 * df[col].isna().mean()
        if null_pct > 0:
            report.warnings.append(f"{name}.{col}: {null_pct:.1f}% null")
        out = ((df[col] < lo) | (df[col] > hi)).sum()
        if out:
            report.warnings.append(
                f"{name}.{col}: {out} values outside expected range [{lo}, {hi}]"
            )

    for col in config.RAW_CAT_COLS + config.CAT_COLS:
        if col not in df.columns:
            continue
        null_pct = 100 * df[col].isna().mean()
        if null_pct > 5:
            report.warnings.append(f"{name}.{col}: {null_pct:.1f}% null")

    return report


def flag_out_of_distribution(record: dict) -> list[str]:
    """Return human-readable warnings if a single inference record looks
    out-of-distribution relative to the training data. Used to annotate
    predictions for monitoring; does not block prediction."""
    flags: list[str] = []
    for col, (lo, hi) in NUMERIC_BOUNDS.items():
        val = record.get(col)
        if val is None:
            continue
        if val < lo or val > hi:
            flags.append(f"{col}={val} is outside the typical training range [{lo}, {hi}]")
    return flags


if __name__ == "__main__":
    train_df = pd.read_csv(config.TRAIN_PATH)
    test_df = pd.read_csv(config.TEST_PATH)
    print("=== train.csv ===")
    print(validate_training_data(train_df, "train"))
    print("\n=== test.csv ===")
    print(validate_training_data(test_df, "test"))
