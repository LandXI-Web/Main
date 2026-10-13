import duckdb,sys,time
t=time.time()
c=duckdb.connect(); c.sql("INSTALL spatial;LOAD spatial;INSTALL httpfs;LOAD httpfs;SET s3_region='us-west-2';")
w,s,e,n=74.567,42.849,74.641,42.903
out="E:/Land-XI 플랫폼/02. 데이터/basemap-relief/src/bishkek-overture-buildings.geojson"
c.sql(f"""COPY (SELECT id, height, num_floors, subtype, class, sources[1].dataset AS src, geometry
FROM read_parquet('s3://overturemaps-us-west-2/release/2026-09-23.1/theme=buildings/type=building/*', hive_partitioning=1)
WHERE bbox.xmin<{e} AND bbox.xmax>{w} AND bbox.ymin<{n} AND bbox.ymax>{s}) TO '{out}' WITH (FORMAT GDAL, DRIVER 'GeoJSON')""")
print(c.sql(f"select count(*), count(height), count(num_floors) from ST_Read('{out}')").fetchall(), time.time()-t)
