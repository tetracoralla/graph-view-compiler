import {
  compileGraphView,
  type SemanticGraphV1,
} from "@openadam/graph-projection/compiler";

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

if (plan.nodes.length !== 3 || plan.edges.length !== 2) {
  throw new Error("Independent consumer received an incomplete view plan");
}
if (!plan.nodes.every((node) => plan.membership.nodes[node.id]?.includes(node.id))) {
  throw new Error("Independent consumer lost source membership");
}
if (!plan.quality.complete) {
  throw new Error("Small independent fixture should receive a complete inspection");
}

console.log(JSON.stringify({
  version: plan.version,
  backend: plan.profile.backend,
  nodeIds: plan.nodes.map((node) => node.id),
  bounds: plan.bounds,
}));
