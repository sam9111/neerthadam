"""Export the experimental native classification as timeline-ready map layers."""

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image
import rasterio
from rasterio.transform import array_bounds
from rasterio.warp import Resampling, calculate_default_transform, reproject, transform

PALETTE = [
    (0, 0, 0, 0),
    (199, 204, 195, 170),
    (38, 94, 229, 255),
    (43, 223, 202, 255),
]


def export_raster(source, target):
    with rasterio.open(source) as src:
        grid, width, height = calculate_default_transform(
            src.crs, "EPSG:3857", src.width, src.height, *src.bounds
        )
        classes = np.zeros((height, width), dtype=np.uint8)
        reproject(src.read(1), classes, src_transform=src.transform, src_crs=src.crs,
                  dst_transform=grid, dst_crs="EPSG:3857", resampling=Resampling.nearest)
    Image.fromarray(np.array(PALETTE, dtype=np.uint8)[classes]).save(target, optimize=True)
    west, south, east, north = array_bounds(height, width, grid)
    longitude, latitude = transform("EPSG:3857", "EPSG:4326",
                                    [west, east, east, west], [north, north, south, south])
    return list(zip(longitude, latitude))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("results", type=Path, help="Classification output from nisar_inundation.py")
    args = parser.parse_args()
    out = Path(__file__).resolve().parents[1] / "public/context/inundation"
    out.mkdir(parents=True, exist_ok=True)
    report = json.loads((args.results / "summary.json").read_text())
    observations = {}
    for date, entry in report["dates"].items():
        filename = f"{date}.png"
        observations[entry["granule"]] = {
            "url": f"context/inundation/{filename}",
            "coordinates": export_raster(args.results / f"{date}-native.tif", out / filename),
        }
    manifest = {"observations": observations, "colors": [
        f"rgba({r}, {g}, {b}, {a / 255:.3f})" for r, g, b, a in PALETTE[1:]
    ]}
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
