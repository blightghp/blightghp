import { EngineHost } from "./engine-host";
import type { EngineCommand } from "./protocol";

// Adaptador fino: toda a lógica mora em EngineHost, testável sem um Worker real.
// O tsconfig do projeto usa a lib DOM (não WebWorker), então o escopo global do
// Worker é acessado por um cast estreito em vez de depender dos tipos ambientes.
interface WorkerGlobal {
  onmessage: ((event: MessageEvent<EngineCommand>) => void) | null;
  postMessage: (message: unknown) => void;
}

const workerScope = self as unknown as WorkerGlobal;
const host = new EngineHost();

workerScope.onmessage = (event) => {
  for (const outgoing of host.handle(event.data)) {
    workerScope.postMessage(outgoing);
  }
};
