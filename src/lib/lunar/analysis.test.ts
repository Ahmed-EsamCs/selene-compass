import { describe, expect, it } from "vitest";
import { classify, DEFAULT_FILTERS, factorScores, safetyScore } from "./analysis";

describe("safety score", () => {
  it("gives 100 for a 2° slope, 70% sunlight and 60% Earth visibility", () => {
    expect(safetyScore(2, 0.7, 0.6)).toBeCloseTo(100, 5);
  });

  it("gives 0 slope credit at 20° or steeper", () => {
    expect(factorScores(20, 1, 1).slope).toBe(0);
    expect(factorScores(11, 1, 1).slope).toBeCloseTo(0.5, 5);
  });

  it("respects weights: slope-only weighting ignores light and comm", () => {
    expect(safetyScore(2, 0, 0, { slope: 1, illumination: 0, comm: 0 })).toBeCloseTo(100, 5);
  });
});

describe("classification", () => {
  it("marks anything steeper than 15° as hazardous", () => {
    expect(classify(15.5, 0.9, 0.9, 90)).toBe("hazard");
  });

  it("marks permanently shadowed ground (<5% sun) as hazardous", () => {
    expect(classify(1, 0.04, 0.9, 80)).toBe("hazard");
  });

  it("marks a score below 40 as hazardous", () => {
    expect(classify(5, 0.5, 0.5, 39)).toBe("hazard");
  });

  it("is safe only when every filter passes", () => {
    expect(classify(5, 0.5, 0.5, 80, DEFAULT_FILTERS)).toBe("safe");
    expect(classify(12, 0.5, 0.5, 80, DEFAULT_FILTERS)).toBe("caution");
    expect(classify(5, 0.5, 0.5, 80, { ...DEFAULT_FILTERS, minComm: 0.6 })).toBe("caution");
  });
});
