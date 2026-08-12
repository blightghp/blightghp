import type { NeuralSnapshot } from "./protocol";

export interface SnapshotBufferEntry {
  readonly name: string;
  readonly view: ArrayBufferView;
}

/**
 * Canonical wire order for every typed-array view transferred by the Worker.
 * Keep this as the single source used by transfer, profiling and ABI audits.
 */
export function snapshotBufferEntries(snapshot: NeuralSnapshot): SnapshotBufferEntry[] {
  return [
    { name: "potentials", view: snapshot.potentials },
    { name: "activations", view: snapshot.activations },
    { name: "weights", view: snapshot.weights },
    { name: "signals.synapseIds", view: snapshot.signals.synapseIds },
    { name: "signals.progress", view: snapshot.signals.progress },
    { name: "signals.strength", view: snapshot.signals.strength },
    { name: "signals.inhibitory", view: snapshot.signals.inhibitory },
    { name: "field.nodeIndices", view: snapshot.field.nodeIndices },
    { name: "field.eField", view: snapshot.field.eField },
    { name: "field.iField", view: snapshot.field.iField },
    { name: "field.waveActivity", view: snapshot.field.waveActivity },
    { name: "corticothalamic.excitatory", view: snapshot.corticothalamic.excitatory },
    { name: "corticothalamic.inhibitory", view: snapshot.corticothalamic.inhibitory },
    { name: "cellPatch.kinds", view: snapshot.cellPatch.kinds },
    { name: "cellPatch.membraneVolts", view: snapshot.cellPatch.membraneVolts },
    { name: "cellPatch.dendriteVolts", view: snapshot.cellPatch.dendriteVolts },
    { name: "cellPatch.adaptationAmperes", view: snapshot.cellPatch.adaptationAmperes },
    { name: "cellPatch.ampaAmperes", view: snapshot.cellPatch.ampaAmperes },
    { name: "cellPatch.nmdaAmperes", view: snapshot.cellPatch.nmdaAmperes },
    { name: "cellPatch.gabaaAmperes", view: snapshot.cellPatch.gabaaAmperes },
    { name: "cellPatch.gababAmperes", view: snapshot.cellPatch.gababAmperes },
    { name: "cellPatch.spiked", view: snapshot.cellPatch.spiked },
    { name: "cellSpikeEvents.cellIds", view: snapshot.cellSpikeEvents.cellIds },
    {
      name: "cellSpikeEvents.timeOffsetsSeconds",
      view: snapshot.cellSpikeEvents.timeOffsetsSeconds,
    },
    { name: "chemical.releaseEventIndices", view: snapshot.chemical.releaseEventIndices },
    { name: "chemical.presynapticSpikeCounts", view: snapshot.chemical.presynapticSpikeCounts },
    {
      name: "chemical.vesicleAvailableFraction",
      view: snapshot.chemical.vesicleAvailableFraction,
    },
    {
      name: "chemical.vesicleUtilizationFraction",
      view: snapshot.chemical.vesicleUtilizationFraction,
    },
    { name: "chemical.latestReleaseMoles", view: snapshot.chemical.latestReleaseMoles },
    {
      name: "chemical.latestReleaseTimeSeconds",
      view: snapshot.chemical.latestReleaseTimeSeconds,
    },
    { name: "chemical.totalReleasedMoles", view: snapshot.chemical.totalReleasedMoles },
    { name: "chemical.cleftMoles", view: snapshot.chemical.cleftMoles },
    {
      name: "chemical.cleftConcentrationMolesPerCubicMeter",
      view: snapshot.chemical.cleftConcentrationMolesPerCubicMeter,
    },
    { name: "chemical.receptorBoundMoles", view: snapshot.chemical.receptorBoundMoles },
    {
      name: "chemical.receptorOccupancyFraction",
      view: snapshot.chemical.receptorOccupancyFraction,
    },
    { name: "chemical.clearedMoles", view: snapshot.chemical.clearedMoles },
  ];
}
