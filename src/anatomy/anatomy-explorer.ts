import {
  ANATOMICAL_CATALOG,
  ANATOMY_IDS,
  anatomicalBreadcrumbs,
  anatomicalDepth,
  anatomicalEntryById,
  anatomicalSourceOf,
  anatomicalTransformOf,
  auditAnatomicalCatalog,
  searchAnatomy,
} from "./anatomical-catalog";
import type {
  AnatomicalCatalogEntry,
  AnatomyView,
} from "./anatomical-catalog";

export type AnatomySelectionOrigin = "tree" | "scene" | "api" | "reset" | "view";

export interface AnatomyExplorerElements {
  readonly search: HTMLInputElement;
  readonly resultCount: HTMLElement;
  readonly results: HTMLUListElement;
  readonly breadcrumb: HTMLElement;
  readonly title: HTMLElement;
  readonly stableId: HTMLElement;
  readonly laterality: HTMLElement;
  readonly evidence: HTMLElement;
  readonly source: HTMLElement;
  readonly license: HTMLElement;
  readonly transform: HTMLElement;
  readonly limitation: HTMLElement;
  readonly status: HTMLElement;
  readonly reset: HTMLButtonElement;
}

export interface AnatomyExplorerAudit {
  readonly catalog: ReturnType<typeof auditAnatomicalCatalog>;
  readonly activeView: AnatomyView;
  readonly selectedId: string;
  readonly query: string;
  readonly visibleResultIds: readonly string[];
}

type SelectionListener = (
  entry: AnatomicalCatalogEntry,
  origin: AnatomySelectionOrigin,
) => void;

function entriesForView(view: AnatomyView): readonly AnatomicalCatalogEntry[] {
  const included = new Set<string>();
  for (const entry of ANATOMICAL_CATALOG.entries) {
    if (!entry.views.includes(view)) continue;
    for (const ancestor of anatomicalBreadcrumbs(entry.id)) included.add(ancestor.id);
  }
  return ANATOMICAL_CATALOG.entries.filter((entry) => included.has(entry.id));
}

function lateralityLabel(value: AnatomicalCatalogEntry["laterality"]): string {
  return {
    left: "esquerda",
    right: "direita",
    bilateral: "bilateral",
    midline: "linha média",
    unspecified: "não especificada",
    "not-applicable": "não aplicável",
  }[value];
}

/** Accessible DOM controller for catalog search, hierarchy and evidence details. */
export class AnatomyExplorerController {
  private activeView: AnatomyView = "overview";
  private selectedId: string = ANATOMY_IDS.encephalon;
  private visibleEntries: readonly AnatomicalCatalogEntry[] = [];

  private readonly handleSearch = (): void => this.render();
  private readonly handleReset = (): void => {
    this.elements.search.value = "";
    this.select(ANATOMY_IDS.encephalon, "reset");
  };
  private readonly handleResultsKeydown = (event: KeyboardEvent): void => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = Array.from(
      this.elements.results.querySelectorAll<HTMLButtonElement>("button[role='treeitem']"),
    );
    if (buttons.length === 0) return;
    const current = document.activeElement instanceof HTMLButtonElement
      ? buttons.indexOf(document.activeElement)
      : -1;
    let target = current;
    if (event.key === "ArrowDown") target = Math.min(buttons.length - 1, current + 1);
    if (event.key === "ArrowUp") target = Math.max(0, current <= 0 ? 0 : current - 1);
    if (event.key === "Home") target = 0;
    if (event.key === "End") target = buttons.length - 1;
    event.preventDefault();
    buttons[target].focus();
  };

  constructor(
    private readonly elements: AnatomyExplorerElements,
    private readonly onSelection: SelectionListener,
  ) {
    const audit = auditAnatomicalCatalog();
    if (!audit.contractReady) throw new Error("embedded anatomical catalog is invalid");
    elements.search.addEventListener("input", this.handleSearch);
    elements.reset.addEventListener("click", this.handleReset);
    elements.results.addEventListener("keydown", this.handleResultsKeydown);
    this.render();
  }

  /** Updates the view filter without crossing the scientific protocol. */
  setActiveView(view: AnatomyView): void {
    this.activeView = view;
    const selected = anatomicalEntryById(this.selectedId);
    if (!selected?.views.includes(view)) {
      const fallback = ANATOMICAL_CATALOG.entries.find((entry) => entry.views.includes(view));
      if (fallback) this.select(fallback.id, "view");
      return;
    }
    this.render();
  }

  /** Selects the same stable ID for tree, scene picking and audit automation. */
  select(id: string, origin: AnatomySelectionOrigin = "api"): AnatomicalCatalogEntry {
    const entry = anatomicalEntryById(id);
    if (!entry) throw new Error(`unknown anatomical selection: ${id}`);
    this.selectedId = entry.id;
    this.render();
    this.onSelection(entry, origin);
    return entry;
  }

  /** Returns the selected stable semantic ID. */
  selectionId(): string {
    return this.selectedId;
  }

  /** Returns catalog and DOM-state evidence for automated audits. */
  audit(): AnatomyExplorerAudit {
    return {
      catalog: auditAnatomicalCatalog(),
      activeView: this.activeView,
      selectedId: this.selectedId,
      query: this.elements.search.value,
      visibleResultIds: this.visibleEntries.map((entry) => entry.id),
    };
  }

  /** Removes every DOM listener owned by this controller. */
  dispose(): void {
    this.elements.search.removeEventListener("input", this.handleSearch);
    this.elements.reset.removeEventListener("click", this.handleReset);
    this.elements.results.removeEventListener("keydown", this.handleResultsKeydown);
  }

  private render(): void {
    const query = this.elements.search.value.trim();
    this.visibleEntries = query ? searchAnatomy(query) : entriesForView(this.activeView);
    this.elements.resultCount.textContent = `${this.visibleEntries.length} estruturas`;
    this.elements.results.replaceChildren();
    for (const entry of this.visibleEntries) {
      const item = document.createElement("li");
      item.setAttribute("role", "none");
      const button = document.createElement("button");
      button.type = "button";
      button.role = "treeitem";
      button.dataset.anatomyId = entry.id;
      button.dataset.depth = String(anatomicalDepth(entry.id));
      button.setAttribute("aria-level", String(anatomicalDepth(entry.id) + 1));
      button.setAttribute("aria-selected", String(entry.id === this.selectedId));
      button.textContent = entry.label;
      button.addEventListener("click", () => this.select(entry.id, "tree"), { once: true });
      item.appendChild(button);
      this.elements.results.appendChild(item);
    }
    this.renderDetails();
  }

  private renderDetails(): void {
    const entry = anatomicalEntryById(this.selectedId);
    if (!entry) return;
    const source = anatomicalSourceOf(entry);
    const transform = anatomicalTransformOf(entry);
    const breadcrumb = anatomicalBreadcrumbs(entry.id).map((item) => item.label).join(" › ");
    this.elements.breadcrumb.textContent = breadcrumb;
    this.elements.title.textContent = entry.label;
    this.elements.stableId.textContent = entry.id;
    this.elements.laterality.textContent = lateralityLabel(entry.laterality);
    this.elements.evidence.textContent = `${entry.evidence.level} · ${entry.evidence.claim}`;
    this.elements.source.textContent = `${source.locator} · versão ${source.version}`;
    this.elements.license.textContent =
      `${ANATOMICAL_CATALOG.license.expression} · asset externo: ${source.externalAsset ? "sim" : "não"}`;
    this.elements.transform.textContent =
      `${transform.coordinateSystem} · ${transform.scale} · ${transform.orientation}`;
    this.elements.limitation.textContent = entry.evidence.limitations.join(" ");
    this.elements.status.textContent = `${entry.label} selecionado; evidência ${entry.evidence.level}.`;
  }
}
