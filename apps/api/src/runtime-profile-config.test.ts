import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import publishedProfileDocument from "../../../profiles/runtime-published.json";
import { loadRuntimeProfileForStartup } from "./runtime-profile-config";

const createTemporaryProfileDirectory = () => mkdtempSync(join(tmpdir(), "runtime-profile-"));

describe("loadRuntimeProfileForStartup", () => {
  it("defaults production startup to the published Runtime Profile", () => {
    // Given
    const environment = { NODE_ENV: "production" };

    // When
    const runtimeProfile = loadRuntimeProfileForStartup(environment);

    // Then
    expect(runtimeProfile).toMatchObject({
      profileId: "runtime-published",
      runtimePolicy: {
        agentBehaviorVersion: { policy: "strict" },
      },
    });
  });

  it("defaults non-production startup to the development Runtime Profile", () => {
    // Given
    const environment = { NODE_ENV: "test" };

    // When
    const runtimeProfile = loadRuntimeProfileForStartup(environment);

    // Then
    expect(runtimeProfile).toMatchObject({
      profileId: "runtime-development",
      runtimePolicy: {
        agentBehaviorVersion: { policy: "development" },
      },
    });
  });

  it("loads a selected Runtime Profile document from the environment path", () => {
    // Given
    const profileDirectory = createTemporaryProfileDirectory();
    const profilePath = join(profileDirectory, "selected-runtime-profile.json");
    writeFileSync(
      profilePath,
      JSON.stringify({
        ...publishedProfileDocument,
        profileId: "runtime-selected",
      }),
    );

    // When
    const runtimeProfile = loadRuntimeProfileForStartup({
      NODE_ENV: "development",
      RUNTIME_PROFILE_PATH: profilePath,
    });

    // Then
    expect(runtimeProfile).toMatchObject({
      profileId: "runtime-selected",
      runtimePolicy: {
        agentBehaviorVersion: { policy: "strict" },
      },
    });
  });

  it("rejects a malformed selected Runtime Profile document at startup", () => {
    // Given
    const profileDirectory = createTemporaryProfileDirectory();
    const profilePath = join(profileDirectory, "malformed-runtime-profile.json");
    writeFileSync(profilePath, JSON.stringify({ profileId: "malformed" }));
    const loadMalformedRuntimeProfile = () =>
      loadRuntimeProfileForStartup({ RUNTIME_PROFILE_PATH: profilePath });

    // When
    const loadMalformedRuntimeProfileAction = loadMalformedRuntimeProfile;

    // Then
    expect(loadMalformedRuntimeProfileAction).toThrow();
  });
});
