# Geo Detectives map close-ups

The Find It on the Map close-ups use Natural Earth's **Admin 0 Countries, 1:10 million scale, version 5.1.1**. Natural Earth puts its raster and vector data in the public domain and permits commercial redistribution. Its default country layer depicts de facto boundaries. The map is for identifying countries and regions and has the detail limits of this source scale.

- [Natural Earth Admin 0 Countries](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/)
- [Natural Earth terms of use](https://www.naturalearthdata.com/about/terms-of-use/)
- [Source shapefile archive](https://naturalearth.s3.amazonaws.com/10m_cultural/ne_10m_admin_0_countries.zip)

The generator clips and simplifies the source polygons for the view and keeps the principal island or land area as the arrow target. It projects geographic coordinates locally using an equidistant cylindrical projection with the standard parallel at the center of the view. All map elements in a view use the same scale. For dispersed archipelagos, the wider view shows the extent of the island group at a smaller scale.

To regenerate the data, extract the complete archive together and run the generator with Python, PyShp and Shapely 2 installed.

```sh
python scripts/build_geo_location_insets.py /path/to/ne_10m_admin_0_countries.shp
```
