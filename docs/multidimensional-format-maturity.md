# Zarr, NetCDF and HDF5 readiness

This is reference guidance, not a runnable sample or a production support claim.
No public JavaScript adapter or end-to-end canary qualifies these formats for the
sample gallery. Registration and server source evidence alone do not establish a
client workflow.

| Format | JavaScript client | Server evidence | Public end-to-end workflow |
| --- | --- | --- | --- |
| Zarr | Unavailable | Experimental | Unavailable |
| NetCDF-4 | Unavailable | Metadata only, build optional | Unavailable |
| Geospatial HDF5 | Unavailable | Metadata only, build optional | Unavailable |

Geospatial HDF5 covers only datasets that map to a documented coverage model;
arbitrary HDF5 group browsing is outside this scope. Do not infer readable
variables, bounded subsets, or a production deployment from metadata registration.

The [preserved evidence record](multidimensional-format-maturity.json) contains
the source revisions, capability matrix, missing client contracts, and expected
outcomes behind this assessment. Its upstream baseline is the
[pinned SDK format maturity contract](https://github.com/honua-io/honua-sdk-js/blob/d68f221a3ee49b86f06f0d587faf2c627263283d/config/multidimensional-format-maturity.v1.json).

A runnable example can enter the gallery after a published client, seeded public
service, and signed-out end-to-end run demonstrate the bounded read contract.
Native application guidance remains in [native applications](native-applications.md).
