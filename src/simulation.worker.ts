import { generateBrainData } from "./brain";
import type { EngineCommand, EngineEvent, EngineSnapshotEvent } from "./protocol";
import {
  DiagnosticFallbackHost,
  snapshotTransferList,
  WasmEngineHost,
} from "./wasm-engine-host";

interface WorkerGlobal {
  onmessage: ((event: MessageEvent<EngineCommand>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
}

const workerScope = self as unknown as WorkerGlobal;
const wasm = new WasmEngineHost();
const fallback = new DiagnosticFallbackHost();
let active: WasmEngineHost | DiagnosticFallbackHost = wasm;
let initialization: Extract<EngineCommand, { type: "initialize" }> | undefined;
let commandQueue = Promise.resolve();

function publish(event: EngineEvent): void {
  if (event.type === "snapshot") {
    workerScope.postMessage(event, snapshotTransferList(event.snapshot));
  } else {
    workerScope.postMessage(event);
  }
}

function fault(error: unknown): void {
  publish({
    type: "fault",
    code: "engine-command-failed",
    message: error instanceof Error ? error.message : String(error),
  });
}

async function handle(command: EngineCommand): Promise<void> {
  switch (command.type) {
    case "initialize":
      initialization = command;
      try {
        publish(await wasm.initialize(command));
        active = wasm;
      } catch (error) {
        active = fallback;
        publish(fallback.initialize(command, error));
      }
      return;
    case "advance":
      publish(active.advance(command) as EngineSnapshotEvent);
      return;
    case "reset":
      if (!initialization) throw new Error("reset recebido antes de initialize");
      if (command.seed === undefined) {
        publish(active.reset());
        return;
      }
      initialization = {
        ...initialization,
        seed: command.seed,
        topology: generateBrainData({
          ...initialization.topology.generation,
          seed: command.seed,
        }),
      };
      try {
        publish(await wasm.initialize(initialization));
        active = wasm;
      } catch (error) {
        active = fallback;
        publish(fallback.initialize(initialization, error));
      }
      return;
    case "dispose":
      wasm.dispose();
      fallback.dispose();
      initialization = undefined;
      return;
  }
}

workerScope.onmessage = (event) => {
  commandQueue = commandQueue.then(() => handle(event.data)).catch(fault);
};
