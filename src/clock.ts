import type { SimulationTick } from "./protocol";

export interface FixedStepClockOptions {
  stepSeconds: number;
  maxInteractiveDeltaSeconds?: number;
}

export interface ClockFrame {
  targetTick: SimulationTick;
  renderTimeSeconds: number;
  frameDeltaSeconds: number;
  interpolationAlpha: number;
  droppedFrameSeconds: number;
  droppedTotalSeconds: number;
}

export class FixedStepClock {
  readonly stepSeconds: number;
  readonly maxInteractiveDeltaSeconds: number;

  private target = 0;
  private remainderSeconds = 0;
  private lastTimestampMilliseconds: number | undefined;
  private presentationSeconds = 0;
  private totalDroppedSeconds = 0;

  constructor(options: FixedStepClockOptions) {
    if (!Number.isFinite(options.stepSeconds) || options.stepSeconds <= 0) {
      throw new RangeError("O passo da simulação deve ser um número positivo e finito.");
    }

    const maximum = options.maxInteractiveDeltaSeconds ?? 0.1;
    if (!Number.isFinite(maximum) || maximum <= 0) {
      throw new RangeError("O limite de tempo por frame deve ser positivo e finito.");
    }

    this.stepSeconds = options.stepSeconds;
    this.maxInteractiveDeltaSeconds = maximum;
  }

  observe(timestampMilliseconds: number, speed = 1): ClockFrame {
    this.assertTimestamp(timestampMilliseconds);
    this.assertSpeed(speed);

    if (this.lastTimestampMilliseconds === undefined) {
      this.lastTimestampMilliseconds = timestampMilliseconds;
      return this.frame(0, 0);
    }

    if (timestampMilliseconds <= this.lastTimestampMilliseconds) {
      return this.frame(0, 0);
    }

    const wallDeltaSeconds = (timestampMilliseconds - this.lastTimestampMilliseconds) / 1000;
    this.lastTimestampMilliseconds = timestampMilliseconds;
    this.presentationSeconds += wallDeltaSeconds;

    const acceptedSeconds = Math.min(wallDeltaSeconds, this.maxInteractiveDeltaSeconds);
    const droppedSeconds = wallDeltaSeconds - acceptedSeconds;
    this.totalDroppedSeconds += droppedSeconds;
    this.schedule(acceptedSeconds * speed);

    return this.frame(acceptedSeconds, droppedSeconds);
  }

  advanceExact(deltaSeconds: number, speed = 1): ClockFrame {
    this.assertDelta(deltaSeconds);
    this.assertSpeed(speed);
    this.schedule(deltaSeconds * speed);
    return this.frame(deltaSeconds, 0);
  }

  advanceTicks(count: number): ClockFrame {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new RangeError("A quantidade de ticks deve ser um inteiro não negativo.");
    }
    this.setTarget(this.target + count);
    return this.frame(0, 0);
  }

  synchronize(tick: SimulationTick): void {
    if (!Number.isSafeInteger(tick) || tick < 0) {
      throw new RangeError("O tick deve ser um inteiro não negativo.");
    }
    this.target = tick;
    this.remainderSeconds = 0;
  }

  rebase(timestampMilliseconds: number): void {
    this.assertTimestamp(timestampMilliseconds);
    this.lastTimestampMilliseconds = timestampMilliseconds;
  }

  reset(tick: SimulationTick = 0, timestampMilliseconds?: number): void {
    this.synchronize(tick);
    if (timestampMilliseconds !== undefined) this.assertTimestamp(timestampMilliseconds);
    this.lastTimestampMilliseconds = timestampMilliseconds;
    this.presentationSeconds = 0;
    this.totalDroppedSeconds = 0;
  }

  get targetTick(): SimulationTick {
    return this.target;
  }

  get renderTimeSeconds(): number {
    return this.presentationSeconds;
  }

  get interpolationAlpha(): number {
    return this.remainderSeconds / this.stepSeconds;
  }

  get droppedSeconds(): number {
    return this.totalDroppedSeconds;
  }

  private schedule(simulationSeconds: number): void {
    this.remainderSeconds += simulationSeconds;
    const tolerance = this.stepSeconds * 1e-10;
    const elapsedTicks = Math.floor((this.remainderSeconds + tolerance) / this.stepSeconds);
    if (elapsedTicks === 0) return;

    this.remainderSeconds -= elapsedTicks * this.stepSeconds;
    if (this.remainderSeconds < 0 && this.remainderSeconds > -tolerance) {
      this.remainderSeconds = 0;
    }
    this.setTarget(this.target + elapsedTicks);
  }

  private setTarget(tick: number): void {
    if (!Number.isSafeInteger(tick)) {
      throw new RangeError("O relógio ultrapassou o intervalo seguro de ticks.");
    }
    this.target = tick;
  }

  private frame(frameDeltaSeconds: number, droppedFrameSeconds: number): ClockFrame {
    return {
      targetTick: this.target,
      renderTimeSeconds: this.presentationSeconds,
      frameDeltaSeconds,
      interpolationAlpha: this.interpolationAlpha,
      droppedFrameSeconds,
      droppedTotalSeconds: this.totalDroppedSeconds,
    };
  }

  private assertTimestamp(value: number): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError("O timestamp deve ser um número não negativo e finito.");
    }
  }

  private assertDelta(value: number): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError("O intervalo deve ser um número não negativo e finito.");
    }
  }

  private assertSpeed(value: number): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError("A escala temporal deve ser um número não negativo e finito.");
    }
  }
}
