import {
  compileGraphView,
  type EdgeRouteConstraints,
  type SemanticGraphV1,
} from "@openadam/graph-view-compiler/compiler";

interface ReleaseTask {
  key: string;
  title: string;
  needs: readonly string[];
}

const tasks: readonly ReleaseTask[] = [
  { key: "contract", title: "Freeze contract", needs: [] },
  { key: "client", title: "Update client", needs: ["contract"] },
  { key: "release", title: "Release", needs: ["client"] },
];

const graph: SemanticGraphV1 = {
  version: 1,
  nodes: tasks.map((task) => ({ id: task.key, label: task.title, kind: "release-task" })),
  relations: tasks.flatMap((task) => task.needs.map((dependency) => ({
    id: `${dependency}-before-${task.key}`,
    source: dependency,
    target: task.key,
    direction: "directed" as const,
    kind: "requires",
  }))),
};

const plan = compileGraphView({
  graph,
  passes: [{
    id: "release-slice",
    type: "slice",
    slice: { focus: ["release"], direction: "incoming" },
  }],
  nodeSizes: Object.fromEntries(tasks.map((task) => [
    task.key,
    { width: Math.max(120, task.title.length * 10 + 32), height: 52 },
  ])),
  profile: {
    type: "layered",
    layout: { direction: "left-to-right", nodeGap: 36, rankGap: 88 },
  },
});

const edgeRouteConstraints: EdgeRouteConstraints = Object.fromEntries(
  graph.relations.map((relation, index) => [relation.id, {
    type: "orthogonal-corridor" as const,
    axis: "y" as const,
    coordinate: 110 + index * 24,
  }]),
);
const constrainedPlan = compileGraphView({
  graph,
  nodeSizes: Object.fromEntries(tasks.map((task) => [
    task.key,
    { width: Math.max(120, task.title.length * 10 + 32), height: 52 },
  ])),
  profile: {
    type: "fixed",
    positions: {
      contract: { x: 0, y: 0 },
      client: { x: 240, y: 0 },
      release: { x: 480, y: 0 },
    },
  },
  edgeRouteConstraints,
});

if (plan.nodes.length !== 3 || plan.edges.length !== 2) {
  throw new Error("Independent consumer received an incomplete view plan");
}
if (!plan.nodes.every((node) => plan.membership.nodes[node.id]?.includes(node.id))) {
  throw new Error("Independent consumer lost source membership");
}
if (!plan.quality.complete) {
  throw new Error("Small independent fixture should receive a complete inspection");
}
if (!constrainedPlan.edges.every((edge) =>
  edge.route.strategy === "constrained" &&
  edge.route.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)))) {
  throw new Error("Independent consumer did not receive finite constrained routes");
}

console.log(JSON.stringify({
  version: plan.version,
  backend: plan.profile.backend,
  nodeIds: plan.nodes.map((node) => node.id),
  bounds: plan.bounds,
}));
