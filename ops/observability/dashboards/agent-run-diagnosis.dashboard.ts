import { LogsDedupStrategy, TableCellHeight } from "@grafana/grafana-foundation-sdk/common";
import {
  DashboardBuilder,
  PanelBuilder,
  TextBoxVariableBuilder,
} from "@grafana/grafana-foundation-sdk/dashboard";
import { PanelBuilder as LogsPanelBuilder } from "@grafana/grafana-foundation-sdk/logs";
import { DataqueryBuilder as LokiQueryBuilder } from "@grafana/grafana-foundation-sdk/loki";
import { PanelBuilder as TablePanelBuilder } from "@grafana/grafana-foundation-sdk/table";
import { DataqueryBuilder as TempoQueryBuilder } from "@grafana/grafana-foundation-sdk/tempo";
import {
  agentRunDiagnosisQueries,
  agentRunIdentifierVariableName,
  expectedAgentRunDiagnosisDatasources,
} from "./agent-run-diagnosis.queries";

export type JsonObject = {
  [key: string]: JsonValue;
};

export type JsonValue = boolean | JsonObject | JsonValue[] | null | number | string;

type GridPosition = {
  h: number;
  w: number;
  x: number;
  y: number;
};

const tempoDatasource = () => ({
  type: expectedAgentRunDiagnosisDatasources.tempo.type,
  uid: expectedAgentRunDiagnosisDatasources.tempo.uid,
});

const lokiDatasource = () => ({
  type: expectedAgentRunDiagnosisDatasources.loki.type,
  uid: expectedAgentRunDiagnosisDatasources.loki.uid,
});

const traceQlTarget = (query: string) =>
  new TempoQueryBuilder()
    .refId("A")
    .datasource(tempoDatasource())
    .queryType("traceql")
    .query(query)
    .limit(20);

const tablePanel = (panel: {
  gridPos: GridPosition;
  id: number;
  query: string;
  title: string;
}) =>
  new TablePanelBuilder()
    .id(panel.id)
    .title(panel.title)
    .gridPos(panel.gridPos)
    .datasource(tempoDatasource())
    .showHeader(true)
    .cellHeight(TableCellHeight.Sm)
    .inspect(false)
    .withTarget(traceQlTarget(panel.query));

const tracesPanel = () =>
  new PanelBuilder()
    .id(2)
    .type("traces")
    .title("Complete Trace")
    .gridPos({
      h: 9,
      w: 24,
      x: 0,
      y: 8,
    })
    .datasource(tempoDatasource())
    .options({})
    .fieldConfig({ defaults: {}, overrides: [] })
    .withTarget(traceQlTarget(agentRunDiagnosisQueries.completeTrace));

const logsPanel = () =>
  new LogsPanelBuilder()
    .id(5)
    .title("Correlated Agent Run Logs")
    .gridPos({
      h: 12,
      w: 24,
      x: 0,
      y: 37,
    })
    .datasource(lokiDatasource())
    .showTime(true)
    .showLabels(false)
    .showCommonLabels(false)
    .wrapLogMessage(true)
    .prettifyLogMessage(true)
    .enableLogDetails(true)
    .dedupStrategy(LogsDedupStrategy.None)
    .withTarget(
      new LokiQueryBuilder()
        .refId("A")
        .datasource(lokiDatasource())
        .expr(agentRunDiagnosisQueries.correlatedLogs)
        .queryType("range"),
    );

const serializeDashboardModel = (dashboard: unknown): JsonObject =>
  JSON.parse(JSON.stringify(dashboard)) as JsonObject;

export const buildAgentRunDiagnosisDashboard = (): JsonObject =>
  serializeDashboardModel(
    new DashboardBuilder("Agent Run Diagnosis")
      .uid("agent-run-diagnosis")
      .description("Diagnose one Teach Everything Agent Run from its opaque Agent Run Identifier.")
      .tags(["teach-everything", "agent-run-diagnosis"])
      .timezone("browser")
      .version(1)
      .refresh("")
      .withVariable(
        new TextBoxVariableBuilder(agentRunIdentifierVariableName)
          .label("Agent Run Identifier")
          .defaultValue("")
          .current({ text: "", value: "" })
          .hide(0),
      )
      .withPanel(
        tablePanel({
          id: 1,
          title: "Selected Agent Run Summary",
          gridPos: {
            h: 8,
            w: 24,
            x: 0,
            y: 0,
          },
          query: agentRunDiagnosisQueries.selectedRunSummary,
        }),
      )
      .withPanel(tracesPanel())
      .withPanel(
        tablePanel({
          id: 3,
          title: "Slow Model and Tool Operations",
          gridPos: {
            h: 10,
            w: 24,
            x: 0,
            y: 17,
          },
          query: agentRunDiagnosisQueries.slowOperations,
        }),
      )
      .withPanel(
        tablePanel({
          id: 4,
          title: "Failed Model and Tool Operations",
          gridPos: {
            h: 10,
            w: 24,
            x: 0,
            y: 27,
          },
          query: agentRunDiagnosisQueries.failedOperations,
        }),
      )
      .withPanel(logsPanel())
      .build(),
  );
