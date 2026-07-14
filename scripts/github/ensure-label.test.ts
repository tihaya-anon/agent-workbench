import assert from "node:assert/strict";
import test from "node:test";
import { ensureLabel, parseEnsureLabelArguments } from "./ensure-label.ts";
import { GhApiError, type GhApi, type GhApiOptions } from "./gh-api.ts";

test("creates a missing label through the GitHub REST API", async () => {
  // Given
  const calls: Array<{ endpoint: string } & GhApiOptions> = [];
  const api: GhApi = async (endpoint, options = {}) => {
    calls.push({ endpoint, ...options });
    if (options.method === "GET") throw new GhApiError("gh: Not Found (HTTP 404)", 404);
    const body = options.body as { name: string; color: string; description: string };
    return {
      name: body.name,
      color: body.color,
      description: body.description,
    };
  };

  // When
  const name = await ensureLabel(
    {
      name: "ready-for-agent",
      color: "0E8A16",
      description: "Fully specified and ready for an agent",
    },
    api,
  );

  // Then
  assert.equal(name, "ready-for-agent");
  assert.deepEqual(calls, [
    {
      endpoint: "repos/{owner}/{repo}/labels/ready-for-agent",
      method: "GET",
    },
    {
      endpoint: "repos/{owner}/{repo}/labels",
      method: "POST",
      body: {
        name: "ready-for-agent",
        color: "0E8A16",
        description: "Fully specified and ready for an agent",
      },
    },
  ]);
});

test("reconciles an existing label with the requested configuration", async () => {
  // Given
  const calls: Array<{ endpoint: string } & GhApiOptions> = [];
  const api: GhApi = async (endpoint, options = {}) => {
    calls.push({ endpoint, ...options });
    if (options.method === "GET") {
      return { name: "ready-for-agent", color: "ffffff", description: "Stale" };
    }
    const body = options.body as { new_name: string; color: string; description: string };
    return {
      name: body.new_name,
      color: body.color,
      description: body.description,
    };
  };

  // When
  const name = await ensureLabel(
    {
      name: "ready-for-agent",
      color: "0E8A16",
      description: "Fully specified and ready for an agent",
    },
    api,
  );

  // Then
  assert.equal(name, "ready-for-agent");
  assert.deepEqual(calls, [
    {
      endpoint: "repos/{owner}/{repo}/labels/ready-for-agent",
      method: "GET",
    },
    {
      endpoint: "repos/{owner}/{repo}/labels/ready-for-agent",
      method: "PATCH",
      body: {
        new_name: "ready-for-agent",
        color: "0E8A16",
        description: "Fully specified and ready for an agent",
      },
    },
  ]);
});

test("ensures a label in an explicitly selected repository", async () => {
  // Given
  const calls: Array<{ endpoint: string } & GhApiOptions> = [];
  const api: GhApi = async (endpoint, options = {}) => {
    calls.push({ endpoint, ...options });
    if (options.method === "GET") throw new GhApiError("gh: Not Found (HTTP 404)", 404);
    const body = options.body as { name: string; color: string; description: string };
    return {
      name: body.name,
      color: body.color,
      description: body.description,
    };
  };

  // When
  await ensureLabel(
    {
      repository: "example/platform",
      name: "ready-for-agent",
      color: "0E8A16",
      description: "Fully specified and ready for an agent",
    },
    api,
  );

  // Then
  assert.deepEqual(
    calls.map(({ endpoint }) => endpoint),
    ["repos/example/platform/labels/ready-for-agent", "repos/example/platform/labels"],
  );
});

test("updates a label in an explicitly selected repository", async () => {
  // Given
  const calls: Array<{ endpoint: string } & GhApiOptions> = [];
  const api: GhApi = async (endpoint, options = {}) => {
    calls.push({ endpoint, ...options });
    if (options.method === "GET") {
      return { name: "ready-for-agent", color: "ffffff", description: "Stale" };
    }
    const body = options.body as { new_name: string; color: string; description: string };
    return {
      name: body.new_name,
      color: body.color,
      description: body.description,
    };
  };

  // When
  await ensureLabel(
    {
      repository: "example/platform",
      name: "ready-for-agent",
      color: "0E8A16",
      description: "Fully specified and ready for an agent",
    },
    api,
  );

  // Then
  assert.deepEqual(
    calls.map(({ endpoint }) => endpoint),
    [
      "repos/example/platform/labels/ready-for-agent",
      "repos/example/platform/labels/ready-for-agent",
    ],
  );
});

test("parses an explicitly selected label repository", () => {
  // Given
  const arguments_ = [
    "--repo",
    "example/platform",
    "--name",
    "ready-for-agent",
    "--color",
    "0E8A16",
  ];

  // When
  const options = parseEnsureLabelArguments(arguments_);

  // Then
  assert.deepEqual(options, {
    repository: "example/platform",
    name: "ready-for-agent",
    color: "0E8A16",
    description: "",
  });
});
