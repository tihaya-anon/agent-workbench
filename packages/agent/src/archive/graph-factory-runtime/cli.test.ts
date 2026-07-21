import { describe, expect, it } from "vitest";
import { parseGraphFactoryRuntimeRequestJson } from "./cli";

describe("parseGraphFactoryRuntimeRequestJson", () => {
  it("parses a JSON Graph Factory runtime request for process-based trial tooling", () => {
    // Given
    const requestJson = JSON.stringify({
      graphFactoryIdentity: "graph-factory:agent",
      graphFactoryVersion: "v1",
      trialParameters: {
        answer: "Trial parameter answer",
      },
    });

    // When
    const request = parseGraphFactoryRuntimeRequestJson(requestJson);

    // Then
    expect(request).toEqual({
      graphFactoryIdentity: "graph-factory:agent",
      graphFactoryVersion: "v1",
      trialParameters: {
        answer: "Trial parameter answer",
      },
    });
  });
});
