"""Run the NISAR inundation notebook's Default/sum classification on a GCOV comparison batch."""

import argparse
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap
import numpy as np
import rasterio
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject

LABELS = ["NoData", "Non-inundated", "Open water", "Inundated vegetation"]
COLORS = ["#ffffff", "#ececee", "#151b73", "#42e9f5"]
# Default/sum from the upstream wetland_calibration_parameters.yaml.
THRESHOLDS = {
    "sum_min": 0.0, "sum_max": 0.06800000369548798,
    "hh_min": 0.42448979591836733, "hh_max": 10,
    "ratio_min": 1.2000000000000002, "ratio_max": 500,
}


def read_power(path, expected_grid):
    with rasterio.open(path) as src:
        grid = (src.crs, src.transform, src.shape)
        if expected_grid is not None and grid != expected_grid:
            raise ValueError(f"Mismatched native grid in {path}")
        db = src.read(1, masked=True).astype(np.float64).filled(np.nan)
    return np.power(10.0, db / 10.0), grid


def classify(hh, hv):
    valid = np.isfinite(hh) & np.isfinite(hv) & (hh > 0) & (hv > 0)
    combined = hh + hv
    ratio = np.divide(hh, hv, out=np.full_like(hh, np.nan), where=valid)
    limits = THRESHOLDS
    water = valid & (combined > limits["sum_min"]) & (combined <= limits["sum_max"])
    vegetation = (valid & ~water &
                  (hh >= limits["hh_min"]) & (hh <= limits["hh_max"]) &
                  (ratio >= limits["ratio_min"]) & (ratio <= limits["ratio_max"]))
    classes = valid.astype(np.uint8)
    classes[water] = 2
    classes[vegetation] = 3
    return classes


def write_classes(path, classes, crs, transform, driver):
    height, width = classes.shape
    with rasterio.open(
        path, "w", driver=driver, width=width, height=height, count=1,
        dtype="uint8", crs=crs, transform=transform, nodata=0, compress="deflate",
    ) as dst:
        dst.write(classes, 1)
        dst.update_tags(class_names=json.dumps(dict(enumerate(LABELS))),
                        threshold_profile="NISAR notebook Default/sum",
                        status="Experimental, thresholds unvalidated for Pallikaranai")


def aggregate(classes, crs, transform):
    west, south, east, north = rasterio.transform.array_bounds(*classes.shape, transform)
    coarse_transform = from_origin(west, north, 100, 100)
    coarse = np.zeros((int(np.ceil((north - south) / 100)),
                       int(np.ceil((east - west) / 100))), dtype=np.uint8)
    # The notebook includes class zero in the mode vote.
    reproject(classes, coarse, src_crs=crs, src_transform=transform,
              dst_crs=crs, dst_transform=coarse_transform, resampling=Resampling.mode)
    return coarse, coarse_transform


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("batch", type=Path, help="Directory with summary.json and native HH/HV dB GeoTIFFs")
    parser.add_argument("output", type=Path, help="New directory for classification outputs")
    args = parser.parse_args()
    source = json.loads((args.batch / "summary.json").read_text())
    dates = source["dates_utc"]
    args.output.mkdir()
    report = {"thresholds": THRESHOLDS, "classes": dict(enumerate(LABELS)), "dates": {}}
    fig, axes = plt.subplots(2, len(dates), figsize=(3.5 * len(dates), 9), squeeze=False)
    grid = None
    for index, (date, granule) in enumerate(zip(dates, source["granules"], strict=True)):
        prefix = source["frequency"]
        hh, grid = read_power(args.batch / f"{prefix}_HH_{date}.tif", grid)
        hv, _ = read_power(args.batch / f"{prefix}_HV_{date}.tif", grid)
        classes = classify(hh, hv)
        crs, transform, _ = grid
        if not crs.is_projected or crs.linear_units != "metre":
            raise ValueError(f"Expected a projected grid in metres, got {crs}")
        coarse, coarse_transform = aggregate(classes, crs, transform)
        native_posting = f"{transform.a:g} m"
        write_classes(args.output / f"{date}-native.tif", classes, crs, transform, "GTiff")
        write_classes(args.output / f"{date}-100m.tif", coarse, crs, coarse_transform, "COG")
        report["dates"][date] = {
            "granule": granule, "native_posting": native_posting,
            "native_counts": np.bincount(classes.ravel(), minlength=4).tolist(),
            "100m_counts": np.bincount(coarse.ravel(), minlength=4).tolist(),
        }
        for row, (raster, posting) in enumerate(((classes, native_posting), (coarse, "100 m"))):
            ax = axes[row, index]
            image = ax.imshow(raster, cmap=ListedColormap(COLORS), vmin=-0.5, vmax=3.5,
                              interpolation="nearest")
            ax.set_title(f"{date} · {posting}")
            ax.set_axis_off()
    fig.suptitle("Pallikaranai Marsh · Experimental inundation classification")
    fig.subplots_adjust(bottom=0.13, top=0.93)
    bar = fig.colorbar(image, cax=fig.add_axes([0.12, 0.08, 0.76, 0.025]),
                       orientation="horizontal", ticks=range(4))
    bar.ax.set_xticklabels(LABELS, fontsize=8)
    fig.savefig(args.output / "overview.png", dpi=150)
    (args.output / "summary.json").write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
