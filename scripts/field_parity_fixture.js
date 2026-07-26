import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "vite";

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(directory, "..");
const fixturePath = path.join(
  projectRoot,
  "fixtures",
  "parity",
  "field-observables-v1.json",
);

const input = {
  topology: {
    nodeIndices: [0, 1, 2],
    vertexByNode: [0, 1, 2, -1],
    rowOffsets: [0, 1, 2, 3],
    neighbors: [1, 2, 0],
    edgeLengths: [0.02, 0.02, 0.02],
  },
  neuronKinds: ["excitatory", "inhibitory", "excitatory", "excitatory"],
  config: {
    dtSeconds: 0.01,
    tauESeconds: 0.02,
    tauISeconds: 0.03,
    propagationEPerSecond: 1,
    propagationIPerSecond: 0.5,
    couplingGain: 0.08,
    conductionSpeedUnitsPerSecond: 1,
    spatialKernelScale: 0.2,
    excitatorySpikeImpulse: 0.45,
    inhibitorySpikeImpulse: 0.55,
    maxActivity: 2.5,
  },
  projectionSpikes: [1, 1, 0, 1],
  fieldSteps: [[0], [], [], [1], [], []],
  observable: {
    weights: [0.5, -0.5, 0.25, -0.25],
    populationSize: 10,
    dtSeconds: 0.01,
    windowSeconds: 0.03,
    spikeSamples: [1, 0, 2, 0, 0, 0],
  },
};

function typedTopology(topology) {
  return {
    nodeIndices: Uint32Array.from(topology.nodeIndices),
    vertexByNode: Int32Array.from(topology.vertexByNode),
    rowOffsets: Uint32Array.from(topology.rowOffsets),
    neighbors: Uint32Array.from(topology.neighbors),
    edgeLengths: Float32Array.from(topology.edgeLengths),
  };
}

export async function buildFieldParityFixture() {
  const server = await createServer({
    root: projectRoot,
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const fieldModule = await server.ssrLoadModule("/src/field.ts");
    const observableModule = await server.ssrLoadModule("/src/observables.ts");
    const topology = typedTopology(input.topology);
    const data = { corticalField: topology };

    const projection = fieldModule.projectSpikesToField(
      topology,
      Uint8Array.from(input.projectionSpikes),
      input.neuronKinds,
      input.config.excitatorySpikeImpulse,
      input.config.inhibitorySpikeImpulse,
    );

    const field = new fieldModule.PopulationField(data, input.config);
    const snapshots = [];
    for (const spikingNodes of input.fieldSteps) {
      const spikes = new Uint8Array(input.neuronKinds.length);
      for (const node of spikingNodes) spikes[node] = 1;
      field.step(spikes, input.neuronKinds, input.config.dtSeconds);
      snapshots.push({
        excitatory: Array.from(field.eField),
        inhibitory: Array.from(field.iField),
        waveActivity: Array.from(field.waveActivity),
      });
    }

    const observable = input.observable;
    const firingRate = new observableModule.PopulationFiringRate(
      observable.populationSize,
      observable.dtSeconds,
      observable.windowSeconds,
    );

    return {
      schemaVersion: 1,
      input,
      expected: {
        projectedExcitatory: Array.from(projection.excitatory),
        projectedInhibitory: Array.from(projection.inhibitory),
        fieldSnapshots: snapshots,
        meanAbsoluteWeight: observableModule.meanAbsoluteWeight(observable.weights),
        firingRates: observable.spikeSamples.map((spikes) => firingRate.sample(spikes)),
      },
    };
  } finally {
    await server.close();
  }
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function main() {
  const generated = stableJson(await buildFieldParityFixture());
  if (process.argv.includes("--check")) {
    const current = fs.readFileSync(fixturePath, "utf8").replaceAll("\r\n", "\n");
    if (current !== generated) {
      throw new Error(
        "field-observables-v1.json diverged; run npm run generate:field-fixture",
      );
    }
    return;
  }
  fs.writeFileSync(fixturePath, generated);
}

if (pathToFileURL(path.resolve(process.argv[1] ?? "")).href === import.meta.url) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
