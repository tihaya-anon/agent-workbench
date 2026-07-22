#!/usr/bin/env bash
set -euo pipefail

docker run --rm \
  --name "${AGENT_RUN_DIAGNOSIS_ACCEPTANCE_CONTAINER_NAME:-teach-everything-agent-run-diagnosis-acceptance}" \
  --label com.docker.compose.service=teach-everything-api \
  --network "${AGENT_RUN_DIAGNOSIS_ACCEPTANCE_DOCKER_NETWORK:-observability}" \
  -v "$PWD":/workspace \
  -w /workspace \
  -e NODE_ENV=production \
  -e OTEL_SDK_DISABLED=false \
  -e OTEL_SERVICE_NAME="${OTEL_SERVICE_NAME:-teach-everything-api}" \
  -e OTEL_EXPORTER_OTLP_ENDPOINT="${OTEL_EXPORTER_OTLP_ENDPOINT:-http://alloy:4318}" \
  -e LOG_SINKS=stdout \
  -e LOG_STDOUT_FORMAT=json \
  -e AGENT_RUN_DIAGNOSIS_ACCEPTANCE_PREFIX="${AGENT_RUN_DIAGNOSIS_ACCEPTANCE_PREFIX:-ar_current_acceptance}" \
  "${AGENT_RUN_DIAGNOSIS_ACCEPTANCE_NODE_IMAGE:-node:22.23.1-slim}" \
  corepack pnpm observability:agent-run-diagnosis:acceptance:local
