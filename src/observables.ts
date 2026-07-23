// Métricas online: baratas, atualizadas a cada tick ou poucos ticks, sem análise
// topológica pesada. Cada uma declara unidade, janela e cadência (MODEL_SPEC.md,
// seção Observáveis) em vez de expor um número sem contexto físico.

export type ObservableSource = "state" | "events" | "currents" | "field";

export interface ObservableDefinition {
  id: string;
  unit: string;
  windowSeconds: number;
  source: ObservableSource;
  cadenceTicks: number;
  approximation?: string;
}

export const MEAN_ABSOLUTE_WEIGHT: ObservableDefinition = {
  id: "mean-absolute-weight",
  unit: "adimensional",
  windowSeconds: 0,
  source: "state",
  cadenceTicks: 1,
};

export function meanAbsoluteWeight(weights: ArrayLike<number>): number {
  if (weights.length === 0) return 0;
  let total = 0;
  for (let index = 0; index < weights.length; index += 1) total += Math.abs(weights[index]);
  return total / weights.length;
}

// Taxa de disparo por população numa janela deslizante em ticks, em vez da média
// móvel exponencial anterior (constante de suavização sem unidade declarada).
export class PopulationFiringRate {
  readonly definition: ObservableDefinition;

  private readonly counts: Uint32Array;
  private readonly dtSeconds: number;
  private readonly populationSize: number;
  private cursor = 0;
  private filledTicks = 0;
  private sum = 0;

  constructor(populationSize: number, dtSeconds: number, windowSeconds: number) {
    if (populationSize <= 0) {
      throw new RangeError("A população observada deve ter ao menos uma unidade.");
    }
    if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) {
      throw new RangeError("O passo temporal deve ser um número positivo e finito.");
    }
    if (!Number.isFinite(windowSeconds) || windowSeconds <= 0) {
      throw new RangeError("A janela de observação deve ser um número positivo e finito.");
    }

    const windowTicks = Math.max(1, Math.round(windowSeconds / dtSeconds));
    this.counts = new Uint32Array(windowTicks);
    this.dtSeconds = dtSeconds;
    this.populationSize = populationSize;
    this.definition = {
      id: "population-firing-rate",
      unit: "Hz",
      windowSeconds: windowTicks * dtSeconds,
      source: "events",
      cadenceTicks: 1,
      approximation: "soma de disparos numa janela deslizante de ticks, dividida pela população",
    };
  }

  sample(spikes: number): number {
    this.sum -= this.counts[this.cursor];
    this.counts[this.cursor] = spikes;
    this.sum += spikes;
    this.cursor = (this.cursor + 1) % this.counts.length;
    this.filledTicks = Math.min(this.filledTicks + 1, this.counts.length);

    const coveredSeconds = this.filledTicks * this.dtSeconds;
    return this.sum / coveredSeconds / this.populationSize;
  }

  reset(): void {
    this.counts.fill(0);
    this.cursor = 0;
    this.filledTicks = 0;
    this.sum = 0;
  }
}
