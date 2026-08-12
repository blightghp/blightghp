const HASH_PATTERN = /^[0-9a-f]{16}$/;

export async function auditWorkerLifecycle(page) {
  const evidence = await page.evaluate(async () => {
    const [{ generateBrainData }, { snapshotBufferEntries }] = await Promise.all([
      import("/src/brain.ts"),
      import("/src/snapshot-layout.ts"),
    ]);
    const worker = new Worker(new URL("/src/simulation.worker.ts", window.location.origin), {
      type: "module",
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
        stimulus: { intensity: 0.61, confidence: 0.73 },
        learningRate: 0.003,
      });
      if (scheduled.type !== "scheduled" || advanced.type !== "snapshot") {
        throw new Error(`replay inesperado: ${scheduled.type}/${advanced.type}`);
      }
      return advanced.snapshot;
    };

    try {
      const topology = generateBrainData({
        seed: 0x51a7c0de,
        surfaceNodesPerHemisphere: 48,
        innerNodesPerHemisphere: 8,
      });
      const initialize = {
        type: "initialize",
        topology,
        fixedStep: 1 / 60,
        seed: topology.seed,
      };
      const ready = await send(initialize);
      const first = await runReplay();
      const entries = snapshotBufferEntries(first);
      const firstHashes = hashes(first);

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
        buffers: entries.map(({ name, view }) => ({ name, byteLength: view.byteLength })),
        snapshotBytes: entries.reduce((total, { view }) => total + view.byteLength, 0),
        hashes: firstHashes,
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

export function assertWorkerLifecycleEvidence(evidence) {
  if (
    evidence.schemaVersion !== 6 ||
    evidence.runtime !== "rust-wasm" ||
    !evidence.initialized ||
    evidence.buffers.length !== 34 ||
    new Set(evidence.buffers.map(({ name }) => name)).size !== 34 ||
    evidence.snapshotBytes <= 0 ||
    !Object.values(evidence.hashes).every((hash) => HASH_PATTERN.test(hash)) ||
    !evidence.reset.ready ||
    !evidence.reset.exactReplay ||
    !evidence.dispose.rejectedAdvance ||
    !evidence.reinitialize.ready ||
    !evidence.reinitialize.exactReplay
  ) {
    throw new Error(`evidência de lifecycle ABI v6 inválida: ${JSON.stringify(evidence)}`);
  }
}
