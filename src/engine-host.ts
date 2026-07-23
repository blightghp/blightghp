import type {
  EngineAdvanceCommand,
  EngineCommand,
  EngineEvent,
  EngineFaultEvent,
  EngineInitializeCommand,
  EngineResetCommand,
} from "./protocol";
import { NeuralSimulation } from "./simulation";

function fault(code: string, message: string): EngineFaultEvent {
  return { type: "fault", code, message };
}

// Dono único do laço serial. Recebe um comando por vez e devolve os eventos
// resultantes; quem chama decide se isso roda no thread principal ou num Worker.
// simulation.worker.ts só liga isso a postMessage/onmessage.
export class EngineHost {
  private simulation: NeuralSimulation | undefined;
  private topology: EngineInitializeCommand["topology"] | undefined;
  private fixedStep: number | undefined;

  handle(command: EngineCommand): EngineEvent[] {
    switch (command.type) {
      case "initialize":
        return this.initialize(command);
      case "advance":
        return this.advance(command);
      case "reset":
        return this.reset(command);
      case "dispose":
        this.simulation = undefined;
        this.topology = undefined;
        return [];
      default:
        return [
          fault(
            "unknown-command",
            `Comando desconhecido: ${String((command as { type?: unknown }).type)}`,
          ),
        ];
    }
  }

  private initialize(command: EngineInitializeCommand): EngineEvent[] {
    this.topology = command.topology;
    this.fixedStep = command.fixedStep;
    this.simulation = new NeuralSimulation(command.topology, command.fixedStep, command.seed);
    return [{ type: "ready", tick: this.simulation.tick }];
  }

  private advance(command: EngineAdvanceCommand): EngineEvent[] {
    if (!this.simulation) {
      return [fault("not-initialized", "advance recebido antes de initialize.")];
    }
    if (command.targetTick < this.simulation.tick) {
      return [fault("tick-regression", "O tick alvo não pode recuar o estado do motor.")];
    }

    if (command.learningRate !== undefined) {
      this.simulation.setPlasticity(command.learningRate);
    }
    while (this.simulation.tick < command.targetTick) {
      this.simulation.step(command.stimulus);
    }
    return [{ type: "snapshot", snapshot: this.simulation.snapshot() }];
  }

  private reset(command: EngineResetCommand): EngineEvent[] {
    if (!this.simulation || !this.topology) {
      return [fault("not-initialized", "reset recebido antes de initialize.")];
    }

    if (command.seed === undefined) {
      this.simulation.reset();
    } else {
      this.simulation = new NeuralSimulation(this.topology, this.fixedStep, command.seed);
    }
    return [{ type: "ready", tick: this.simulation.tick }];
  }
}
