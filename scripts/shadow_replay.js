import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(projectRoot, "fixtures", "parity", "field-observables-v1.json");
const reportPath = path.join(projectRoot, "AUDIT_0.5_SHADOW.json");

function typedTopology(source) {
  return {
    nodeIndices: Uint32Array.from(source.nodeIndices),
    vertexByNode: Int32Array.from(source.vertexByNode),
    rowOffsets: Uint32Array.from(source.rowOffsets),
    neighbors: Uint32Array.from(source.neighbors),
    edgeLengths: Float32Array.from(source.edgeLengths),
  };
}

function maxAbs(left, right) {
  if (left.length !== right.length) return Number.POSITIVE_INFINITY;
  let maximum = 0;
  for (let index = 0; index < left.length; index += 1) {
    maximum = Math.max(maximum, Math.abs(left[index] - right[index]));
  }
  return maximum;
}

async function verify() {
  const fixtureBytes = fs.readFileSync(fixturePath);
  const fixture = JSON.parse(fixtureBytes);
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const fixtureSha256 = crypto.createHash("sha256").update(fixtureBytes).digest("hex");
  if (fixtureSha256 !== report.fixtureSha256) {
    throw new Error("o fixture mudou depois do replay sombra registrado");
  }
  if (!report.passed || !report.samples.every((sample) => sample.exactHash)) {
    throw new Error("o relatório sombra não aprovou hashes exatos");
  }

  const { input, expected } = fixture;
  const topology = typedTopology(input.topology);
  const simulation = input.simulation;
  const bindingsDirectory = process.env.BRAIN_WASM_DIR
    ? path.resolve(process.env.BRAIN_WASM_DIR)
    : path.join(projectRoot, "src", "wasm");
  const { initSync, WasmNeuralEngine } = await import(
    pathToFileURL(path.join(bindingsDirectory, "brain_wasm.js")).href
  );
  initSync({
    module: fs.readFileSync(
      path.join(bindingsDirectory, "brain_wasm_bg.wasm"),
    ),
  });
  const wasm = new WasmNeuralEngine(
    simulation.seed,
    input.config.dtSeconds,
    Uint8Array.from(input.neuronKinds, (kind) => Number(kind === "inhibitory")),
    Uint32Array.from(simulation.synapses, (synapse) => synapse.from),
    Uint32Array.from(simulation.synapses, (synapse) => synapse.to),
    Float32Array.from(simulation.synapses, (synapse) => synapse.weight),
    Float64Array.from(simulation.synapses, (synapse) => synapse.delay),
    Uint8Array.from(simulation.synapses, (synapse) => Number(synapse.plastic)),
    Uint32Array.from([...simulation.groups.leftHemi, ...simulation.groups.rightHemi]),
    Float64Array.from(simulation.nodeZ),
    topology.nodeIndices,
    topology.vertexByNode,
    topology.rowOffsets,
    topology.neighbors,
    topology.edgeLengths,
  );

  try {
    simulation.advances.forEach((advance, index) => {
      wasm.advance_to(
        advance.targetTick,
        advance.intensity,
        advance.confidence,
        advance.learningRate,
      );
      const oracle = expected.simulationSnapshots[index];
      const maximum = Math.max(
        maxAbs(wasm.potentials(), oracle.potentials),
        maxAbs(wasm.activations(), oracle.activations),
        maxAbs(wasm.weights(), oracle.weights),
        maxAbs(wasm.field_excitatory(), oracle.fieldExcitatory),
        maxAbs(wasm.field_inhibitory(), oracle.fieldInhibitory),
      );
      if (wasm.state_hash() !== oracle.hash || maximum > 1e-7) {
        throw new Error(`divergência Wasm no tick ${advance.targetTick}`);
      }
    });
  } finally {
    wasm.free();
  }
  console.log(
    `replay sombra verificado: ${report.samples.length} marcos, hashes exatos, ` +
      `divergência máxima ${Math.max(...report.samples.map((sample) => sample.maximumAbsoluteDivergence))}`,
  );
}

try {
  await verify();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
