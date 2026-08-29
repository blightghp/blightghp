import type { AnatomicalCatalogEntry } from "./anatomy";
import type { SimulationView } from "./render/laminar-layer";

/** Read-only explanatory contract for the six visual scales of the application. */
export interface ViewContext {
  readonly label: string;
  readonly model: string;
  readonly unit: string;
  readonly hypothesis: string;
  readonly limitation: string;
}

/** Selection evidence shown alongside the stable context of its active view. */
export interface ViewContextSelection {
  readonly label: string;
  readonly id: string;
  readonly hypothesis: string;
  readonly limitation: string;
}

/**
 * UI-034 source of truth. These descriptions explain the visible model without
 * making a new scientific claim or introducing presentation state into the ABI.
 */
export const VIEW_CONTEXTS: Readonly<Record<SimulationView, ViewContext>> = {
  overview: {
    label: "Visão geral",
    model: "MOD-001/010 · rede abstrata e campo E/I procedural.",
    unit: "Proxies/u.a. por vértice; taxa exibida em Hz por nó.",
    hypothesis: "Entradas do protocolo alteram disparos, atrasos e estados observáveis.",
    limitation: "Topologia procedural; não é atlas parcelado, indivíduo ou calibração clínica.",
  },
  laminar: {
    label: "Lâminas",
    model: "MOD-020/030 · circuito L1–L6, relé talâmico e TRN.",
    unit: "E/I, relé, TRN e rebote em [0,1] adimensional.",
    hypothesis: "Relé, TRN e rebote representam relações didáticas, não massa neural estimada.",
    limitation: "Sem canais de Ca²⁺ tipo T, morfologia ou calibração clínica.",
  },
  cell: {
    label: "Célula",
    model: "MOD-040/050 · patch de 12 células AdEx e receptores.",
    unit: "V, A, Hz e s no motor; interface em mV, pA e ms.",
    hypothesis: "O patch substitui a contribuição macro no vértice selecionado.",
    limitation: "Sem canais dendríticos ativos, população calibrada ou amostra histológica.",
  },
  neuron: {
    label: "Neurônio",
    model: "MOD-040/091 · uma célula AdEx e eventos carimbados.",
    unit: "V, A e s do snapshot; interface em mV, pA e ms.",
    hypothesis: "O gradiente apresenta somente os três potenciais publicados.",
    limitation: "Morfologia ilustrativa; sem tipo celular real ou condução ativa.",
  },
  electricity: {
    label: "Eletricidade",
    model: "MOD-040/050/091 · prancha de apresentação do patch.",
    unit: "mV, pA, nS e ms.",
    hypothesis: "Correntes e condutância derivada leem o snapshot; a prancha não calcula circuito.",
    limitation: "Esquema didático; atraso e ganho macro não são atributos celulares.",
  },
  synapse: {
    label: "Sinapse",
    model: "MOD-060/070/080/081 · microdomínio químico representativo.",
    unit: "mol, mol·m⁻³ e fração; interface exibe amol e porcentagem.",
    hypothesis: "Concentrações, matéria e ocupações são publicadas pelo Rust.",
    limitation: "Fenda e escala ~1 µm são didáticas; não representa todas as sinapses nem ultraestrutura.",
  },
};

export function viewContextFor(view: SimulationView): ViewContext {
  return VIEW_CONTEXTS[view];
}

export function viewContextSelectionFor(entry: AnatomicalCatalogEntry): ViewContextSelection {
  return {
    label: entry.label,
    id: entry.id,
    hypothesis: entry.evidence.claim,
    limitation: entry.evidence.limitations.join(" "),
  };
}
