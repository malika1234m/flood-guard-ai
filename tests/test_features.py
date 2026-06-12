import numpy as np
import pandas as pd

from src import config
from src.features import FeatureEngineer


def _sample_df(n=500):
    return pd.read_csv(config.TRAIN_PATH).sample(n, random_state=0).reset_index(drop=True)


def test_fit_transform_shape_and_dtype():
    df = _sample_df()
    fe = FeatureEngineer()
    X = fe.fit_transform(df)

    assert X.shape[0] == len(df)
    assert X.shape[1] == len(fe.feature_cols)
    assert all(dt == np.float32 for dt in X.dtypes)
    assert config.TARGET not in fe.feature_cols
    for col in config.DROP_COLS:
        assert col not in fe.feature_cols


def test_transform_matches_fit_columns_and_save_load(tmp_path):
    df = _sample_df()
    fe = FeatureEngineer()
    fe.fit_transform(df)

    path = tmp_path / "fe.joblib"
    fe.save(path)
    fe2 = FeatureEngineer.load(path)

    # transform() must work without the target column present (inference shape)
    new_rows = df.drop(columns=[config.TARGET]).iloc[:3].reset_index(drop=True)
    X2 = fe2.transform(new_rows)

    assert list(X2.columns) == fe.feature_cols
    assert X2.shape == (3, len(fe.feature_cols))
    assert all(dt == np.float32 for dt in X2.dtypes)


def test_transform_handles_missing_optional_columns():
    df = _sample_df()
    fe = FeatureEngineer()
    fe.fit_transform(df)

    # Minimal single-row input: only the raw fields a user would supply.
    row = df.iloc[[0]].reset_index(drop=True)
    minimal_cols = config.RAW_NUMERIC_COLS + config.RAW_CAT_COLS
    minimal = row[minimal_cols]

    X = fe.transform(minimal)
    assert X.shape == (1, len(fe.feature_cols))
    assert list(X.columns) == fe.feature_cols
