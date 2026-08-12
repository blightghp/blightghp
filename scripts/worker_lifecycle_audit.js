const HASH_PATTERN = /^[0-9a-f]{16}$/;

export async function auditWorkerLifecycle(page) {
  const evidence = await page.evaluate(async () => {
    const engine = window.__BRAIN_ENGINE__;
    const worker = engine.createAuditWorker();

    const auditBackpressure = (topology) =>
      new Promise((resolve, reject) => {
        const probe = engine.createAuditWorker();
        const responses = [];
        const timeout = window.setTimeout(() => {
          probe.terminate();
          reject(new Error("timeout aguardando prova de backpressure"));
        }, 30_000);
        probe.addEventListener("message", (event) => {
          responses.push(event.data);
          if (responses.length !== 65) return;
          window.clearTimeout(timeout);
          probe.terminate();
          resolve({
            responses: responses.length,
            rejected: responses.filter(
              (response) =>
                response.type === "fault" && response.code === "worker-backpressure",
            ).length,
          });
        });
        probe.postMessage({
          type: "initialize",
          topology,
          fixedStep: 1 / 60,
          seed: topology.seed,
        });
        for (let index = 0; index < 64; index += 1) {
          probe.postMessage({ type: "schedule", inputs: [] });
        }
      });

    const send = (command) =>
      new Promise((resolve, reject) => {
        const onMessage = (event) => {
          window.clearTimeout(timeout);
          resolve(event.data);
        };
        const timeout = window.setTimeout(() => {
          worker.removeEventListener("message", onMessage);
          reject(new Error(`timeout aguardando ${command.type}`));
        }, 30_000);
        worker.addEventListener("message", onMessage, { once: true });
        worker.postMessage(command);
      });

    const hashes = (snapshot) => ({
      network: snapshot.diagnostics.stateHash,
      corticothalamic: snapshot.diagnostics.corticothalamicHash,
      cell: snapshot.diagnostics.cellPatchHash,
      chemical: snapshot.diagnostics.chemicalHash,
      cellSpikes: snapshot.diagnostics.cellSpikeEventHash,
    });
    const cellSpikeEvents = (snapshot) => ({
      schemaVersion: snapshot.cellSpikeEvents.schemaVersion,
      startTick: snapshot.cellSpikeEvents.startTick,
      endTick: snapshot.cellSpikeEvents.endTick,
      count: snapshot.cellSpikeEvents.cellIds.length,
      bytes:
        snapshot.cellSpikeEvents.cellIds.byteLength +
        snapshot.cellSpikeEvents.timeOffsetsSeconds.byteLength,
      bytesPerEvent: 12,
      maximumEvents: 4096,
      canonical: snapshot.cellSpikeEvents.timeOffsetsSeconds.every((offset, index, offsets) =>
        index === 0 ||
        offset > offsets[index - 1] ||
        (offset === offsets[index - 1] &&
          snapshot.cellSpikeEvents.cellIds[index] >=
            snapshot.cellSpikeEvents.cellIds[index - 1])),
    });
    const runReplay = async () => {
      const scheduled = await send({
        type: "schedule",
        inputs: [
          { tick: 2, sequence: 10, kind: "stimulus", intensity: 0.8, confidence: 0.7 },
          { tick: 2, sequence: 11, kind: "plasticity", learningRate: 0.002 },
        ],
      });
      const advanced = await send({
        type: "advance",
        targetTick: 12,
        stimulus: { intensity: 0.61, confidence: 0 },
        learningRate: 0.003,
      });
      if (scheduled.type !== "scheduled" || advanced.type !== "snapshot") {
        throw new Error(`replay inesperado: ${scheduled.type}/${advanced.type}`);
      }
      return advanced.snapshot;
    };

    try {
      const topology = engine.createAuditTopology();
      const backpressure = await auditBackpressure(topology);
      const initialize = {
        type: "initialize",
        topology,
        fixedStep: 1 / 60,
        seed: topology.seed,
      };
      const ready = await send(initialize);
      const first = await runReplay();
      const buffers = engine.snapshotBufferLayout(first);
      const firstHashes = hashes(first);
      const firstCellSpikeEvents = cellSpikeEvents(first);

      const resetReady = await send({ type: "reset" });
      const afterReset = await runReplay();
      const resetHashes = hashes(afterReset);

      worker.postMessage({ type: "dispose" });
      const disposedAdvance = await send({
        type: "advance",
        targetTick: 13,
        stimulus: { intensity: 0, confidence: 0 },
      });

      const reinitialized = await send(initialize);
      const afterReinitialize = await runReplay();
      const reinitializedHashes = hashes(afterReinitialize);

      worker.postMessage({ type: "dispose" });
      return {
        schemaVersion: first.schemaVersion,
        runtime: first.diagnostics.runtime,
        initialized: ready.type === "ready" && ready.tick === 0,
        buffers,
        snapshotBytes: buffers.reduce((total, { byteLength }) => total + byteLength, 0),
        hashes: firstHashes,
        cellSpikeEvents: firstCellSpikeEvents,
        backpressure,
        reset: {
          ready: resetReady.type === "ready" && resetReady.tick === 0,
          exactReplay: JSON.stringify(resetHashes) === JSON.stringify(firstHashes),
          hashes: resetHashes,
        },
        dispose: {
          rejectedAdvance:
            disposedAdvance.type === "fault" &&
            disposedAdvance.code === "engine-command-failed",
          faultCode: disposedAdvance.type === "fault" ? disposedAdvance.code : undefined,
        },
        reinitialize: {
          ready: reinitialized.type === "ready" && reinitialized.tick === 0,
          exactReplay: JSON.stringify(reinitializedHashes) === JSON.stringify(firstHashes),
          hashes: reinitializedHashes,
        },
      };
    } finally {
      worker.terminate();
    }
  });

  assertWorkerLifecycleEvidence(evidence);
  return evidence;
}

export function assertWorkerLifecycleEvidence(
  evidence,
  { schemaVersion = 7, bufferCount = 36, hashCount = 5 } = {},
) {
  const stampedEventsInvalid = schemaVersion >= 7 && (
    !evidence.cellSpikeEvents ||
    evidence.cellSpikeEvents.schemaVersion !== 1 ||
    evidence.cellSpikeEvents.count > evidence.cellSpikeEvents.maximumEvents ||
    evidence.cellSpikeEvents.bytes !==
      evidence.cellSpikeEvents.count * evidence.cellSpikeEvents.bytesPerEvent ||
    evidence.cellSpikeEvents.bytesPerEvent !== 12 ||
    evidence.cellSpikeEvents.maximumEvents !== 4_096 ||
    evidence.cellSpikeEvents.startTick > evidence.cellSpikeEvents.endTick ||
    !evidence.cellSpikeEvents.canonical
  );
  const backpressureInvalid = schemaVersion >= 7 && (
    !evidence.backpressure ||
    evidence.backpressure.responses !== 65 ||
    evidence.backpressure.rejected < 1
  );
  if (
    evidence.schemaVersion !== schemaVersion ||
    evidence.runtime !== "rust-wasm" ||
    !evidence.initialized ||
    evidence.buffers.length !== bufferCount ||
    new Set(evidence.buffers.map(({ name }) => name)).size !== bufferCount ||
    evidence.snapshotBytes <= 0 ||
    stampedEventsInvalid ||
    backpressureInvalid ||
    Object.keys(evidence.hashes).length !== hashCount ||
    !Object.values(evidence.hashes).every((hash) => HASH_PATTERN.test(hash)) ||
    !evidence.reset.ready ||
    !evidence.reset.exactReplay ||
    !evidence.dispose.rejectedAdvance ||
    !evidence.reinitialize.ready ||
    !evidence.reinitialize.exactReplay
  ) {
    throw new Error(`evidência de lifecycle ABI v${schemaVersion} inválida: ${JSON.stringify(evidence)}`);
  }
}
