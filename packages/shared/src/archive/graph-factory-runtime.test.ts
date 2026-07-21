import { describe, expect, it } from "vitest";
import { graphFactoryRuntimeRequestSchema } from "./graph-factory-runtime";

describe("graphFactoryRuntimeRequestSchema", () => {
  it("accepts a JSON request that selects a Graph Factory version and passes trial parameters", () => {
    // Given
    const request: unknown = {
      graphFactoryIdentity: "graph-factory:agent",
      graphFactoryVersion: "v2",
      trialParameters: {
        answer: "Trial parameter answer",
        temperature: 0.2,
        tools: ["retrieval"],
      },
    };

    // When
    const result = graphFactoryRuntimeRequestSchema.safeParse(request);

    // Then
    expect(result).toMatchObject({
      success: true,
      data: request,
    });
  });

  it.each([
    {},
    {
      graphFactoryIdentity: "graph-factory:agent",
      trialParameters: {},
    },
    {
      graphFactoryIdentity: "graph-factory:agent",
      graphFactoryVersion: "v1",
      trialParameters: () => "not-json",
    },
  ])("rejects a malformed Graph Factory runtime request: %j", (request) => {
    // Given
    const malformedRequest: unknown = request;

    // When
    const result = graphFactoryRuntimeRequestSchema.safeParse(malformedRequest);

    // Then
    expect(result.success).toBe(false);
  });
});
