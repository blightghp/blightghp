export const MAX_PENDING_ENGINE_COMMANDS = 64;

export class PendingCommandGate {
  private pending = 0;

  tryEnter(): boolean {
    if (this.pending >= MAX_PENDING_ENGINE_COMMANDS) return false;
    this.pending += 1;
    return true;
  }

  leave(): void {
    if (this.pending === 0) throw new Error("fila de comandos já está vazia");
    this.pending -= 1;
  }

  get size(): number {
    return this.pending;
  }
}
