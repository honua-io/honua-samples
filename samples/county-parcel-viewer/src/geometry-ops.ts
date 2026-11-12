import { area, intersect, union } from "@honua/sdk-js/geometry";
import type { GeometryOps } from "./overlap.js";

export const geometryOps: GeometryOps = {
  intersect: (a, b) => intersect(a, b),
  union: (...parts) => union(...parts),
  area: (input) => area(input),
};
