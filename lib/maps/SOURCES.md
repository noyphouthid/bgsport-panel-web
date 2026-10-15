The interactive Laos province map uses geometry from **Simplemaps**, copyright
2024 Pareto Software, LLC:

- Map: https://simplemaps.com/svg/country/la
- Source SVG: https://simplemaps.com/static/svg/country/la/admin1/la.svg
- SVG library license: https://simplemaps.com/resources/svg-license

The SVG library permits incorporation into personal and commercial websites and
software. This is a derived, interactive customer visualization with Lao labels,
counts, filtering, ranking and drill-down; the original map collection is not
redistributed. Attribution is retained in the interface and exported map.

`laos-provinces.json` retains all 18 source province IDs and label anchors. Paths
are converted from relative to absolute coordinates and simplified with a maximum
deviation of 0.6 source SVG units. Source dimensions are 1000 × 1000. Regenerate
with `node scripts/prepare-laos-map.mjs`, or pass a downloaded source SVG path.
No map service, API key, external tile request or runtime download is required.
