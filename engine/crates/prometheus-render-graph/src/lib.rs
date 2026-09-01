//! Deterministic render-graph planner for PROMETHEUS.
//!
//! This is the production promotion of the portable core proven by the
//! `susanna` prototype in `unraillibs`. Handles encode write/read transitions,
//! while compilation performs pass culling, abstract barriers, cross-queue
//! synchronization and conservative logical resource pooling. The planner does
//! not create `wgpu` resources and can therefore be tested independently.

#![forbid(unsafe_code)]

use std::cmp::Reverse;
use std::collections::BinaryHeap;
use std::fmt;
use std::marker::PhantomData;

const NO_INDEX: u16 = u16::MAX;

/// Identificador estável de um passe dentro de um quadro.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct PassId(u16);

impl PassId {
    /// Índice zero-based usado pelos arrays internos.
    #[must_use]
    pub const fn index(self) -> usize {
        self.0 as usize
    }
}

/// Identificador estável de um recurso virtual dentro de um quadro.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ResourceId(u16);

impl ResourceId {
    /// Índice zero-based usado pelos arrays internos.
    #[must_use]
    pub const fn index(self) -> usize {
        self.0 as usize
    }
}

/// Identificador estável de um acesso declarado durante o setup.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct AccessId(u16);

/// Rótulo numérico estável de um passe.
///
/// Numeric labels avoid formatting or allocating a `String` during frame setup.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct PassLabel(pub u32);

/// Rótulo numérico estável de um recurso.
///
/// The GPU executor translates this stable value to its `VramLedger` label.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ResourceLabel(pub u32);

/// Fila que executa um passe.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[repr(u8)]
pub enum Queue {
    /// Fila gráfica.
    Graphics = 0,
    /// Fila de compute.
    Compute = 1,
}

impl Queue {
    const fn bit(self) -> u8 {
        1 << self as u8
    }
}

/// Domínio de fila usado para separar pools lógicos.
///
/// `Shared` nunca compartilha slot com outro recurso durante o quadro. Isso é
/// a política conservadora do RFC para duas filas potencialmente concorrentes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[repr(u8)]
pub enum QueueDomain {
    /// Recurso usado exclusivamente na fila gráfica.
    Graphics,
    /// Recurso usado exclusivamente na fila de compute.
    Compute,
    /// Recurso usado por ambas as filas; slot exclusivo.
    Shared,
}

impl QueueDomain {
    fn from_mask(mask: u8) -> Self {
        match mask {
            1 => Self::Graphics,
            2 => Self::Compute,
            _ => Self::Shared,
        }
    }
}

/// Texture formats currently supported by the logical planner.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[repr(u8)]
pub enum TextureFormat {
    /// Quatro canais normalizados de oito bits.
    Rgba8Unorm,
}

/// Máscara compacta de usos; igualdade é parte da chave exata de pool.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct TextureUsages(u8);

impl TextureUsages {
    /// Textura usada como attachment de renderização.
    pub const RENDER_ATTACHMENT: Self = Self(1 << 0);
    /// Textura lida por shader.
    pub const TEXTURE_BINDING: Self = Self(1 << 1);
    /// Textura escrita por shader de compute.
    pub const STORAGE_BINDING: Self = Self(1 << 2);
    /// Combined usages for a transient texture written and sampled by the frame.
    pub const TRANSIENT: Self = Self(Self::RENDER_ATTACHMENT.0 | Self::TEXTURE_BINDING.0 | Self::STORAGE_BINDING.0);

    /// Combines two usage masks.
    #[must_use]
    pub const fn union(self, other: Self) -> Self {
        Self(self.0 | other.0)
    }

    /// Bits crus, úteis para auditoria e checksum externo.
    #[must_use]
    pub const fn bits(self) -> u8 {
        self.0
    }
}

/// Descritor lógico de textura. A igualdade é deliberadamente exata.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct TextureDesc {
    /// Largura em texels.
    pub width: u32,
    /// Altura em texels.
    pub height: u32,
    /// Formato.
    pub format: TextureFormat,
    /// Máscara de usos.
    pub usages: TextureUsages,
}

impl TextureDesc {
    /// Creates an exact logical texture description used as a pool key.
    #[must_use]
    pub const fn new(width: u32, height: u32, format: TextureFormat, usages: TextureUsages) -> Self {
        Self {
            width,
            height,
            format,
            usages,
        }
    }
}

/// Estado de uso abstrato usado exclusivamente no plano de compilação.
///
/// Não corresponde a uma barreira `wgpu` específica e não deve ser vendido
/// como controle físico de sincronização de Vulkan/D3D12.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[repr(u8)]
pub enum BarrierState {
    /// Recurso transitório sem conteúdo inicial.
    Undefined,
    /// Recurso legível por shader.
    SampledRead,
    /// Recurso escrito como attachment de cor.
    ColorWrite,
    /// Recurso escrito por compute.
    StorageWrite,
    /// Estado externo do alvo de apresentação.
    Present,
}

impl BarrierState {
    const fn is_write(self) -> bool {
        matches!(self, Self::ColorWrite | Self::StorageWrite)
    }
}

/// Tipo de acesso declarado por um passe.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[repr(u8)]
pub enum AccessKind {
    /// Leitura por shader.
    SampledRead,
    /// Escrita de attachment de cor.
    ColorWrite,
    /// Escrita de storage por compute.
    StorageWrite,
}

impl AccessKind {
    const fn state(self) -> BarrierState {
        match self {
            Self::SampledRead => BarrierState::SampledRead,
            Self::ColorWrite => BarrierState::ColorWrite,
            Self::StorageWrite => BarrierState::StorageWrite,
        }
    }

    const fn is_read(self) -> bool {
        matches!(self, Self::SampledRead)
    }
}

mod state_seal {
    pub trait Sealed {}
}

/// Estado de tipo associado a um [`TexHandle`].
///
/// O trait é selado: código externo pode nomear os estados, mas não fabricar um
/// estado gravável alternativo que contorne a transição afim.
pub trait TextureState: state_seal::Sealed {}

/// Recurso alocado virtualmente, ainda sem produtor.
pub struct Undefined;
/// Recurso escrito pelo passe corrente, mas ainda não publicado.
pub struct Written;
/// Recurso publicado e que pode ser lido por qualquer número de passes.
pub struct Readable;

impl state_seal::Sealed for Undefined {}
impl state_seal::Sealed for Written {}
impl state_seal::Sealed for Readable {}
impl TextureState for Undefined {}
impl TextureState for Written {}
impl TextureState for Readable {}

/// Estados que podem ser consumidos por uma escrita.
///
/// Escrever um [`Undefined`] preenche a mesma versão virtual. Escrever um
/// [`Readable`] cria uma versão nova (renaming SSA) e consome a anterior.
pub trait WritableTextureState: TextureState {
    #[doc(hidden)]
    fn prepare_write(graph: &mut RenderGraph, resource: ResourceId) -> Result<ResourceId, GraphError>;
}

impl WritableTextureState for Undefined {
    fn prepare_write(graph: &mut RenderGraph, resource: ResourceId) -> Result<ResourceId, GraphError> {
        graph.claim_undefined_for_write(resource)
    }
}

impl WritableTextureState for Readable {
    fn prepare_write(graph: &mut RenderGraph, resource: ResourceId) -> Result<ResourceId, GraphError> {
        graph.rename_for_write(resource)
    }
}

/// Handle afim de textura virtual.
///
/// Ele propositalmente não implementa `Copy` nem `Clone`. O campo de geração
/// impede que um handle sobrevivente a `RenderGraph::reset` seja reutilizado
/// acidentalmente em outro quadro.
#[must_use = "um handle não usado normalmente indica recurso sem produtor ou sem consumidor"]
pub struct TexHandle<S: TextureState> {
    resource: ResourceId,
    generation: u32,
    _state: PhantomData<fn() -> S>,
}

impl<S: TextureState> fmt::Debug for TexHandle<S> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("TexHandle")
            .field("resource", &self.resource)
            .field("generation", &self.generation)
            .finish_non_exhaustive()
    }
}

impl<S: TextureState> TexHandle<S> {
    fn new(resource: ResourceId, generation: u32) -> Self {
        Self {
            resource,
            generation,
            _state: PhantomData,
        }
    }

    /// Identificador apenas para diagnóstico; ele não permite construir outro
    /// handle, portanto não enfraquece a propriedade afim.
    #[must_use]
    pub const fn resource_id(&self) -> ResourceId {
        self.resource
    }
}

/// Referência leve a uma textura que um callback de execução consumiria.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct TextureRef(ResourceId);

impl TextureRef {
    /// Recurso virtual apontado pela referência.
    #[must_use]
    pub const fn resource_id(self) -> ResourceId {
        self.0
    }
}

/// Capacidades fixadas antes de iniciar o caminho de quadro.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct GraphCapacity {
    /// Máximo de passes.
    pub passes: usize,
    /// Máximo de recursos virtuais.
    pub resources: usize,
    /// Máximo de acessos declarados.
    pub accesses: usize,
    /// Máximo de barreiras abstratas no plano.
    pub barriers: usize,
    /// Máximo de tokens entre filas no plano.
    pub tokens: usize,
}

impl GraphCapacity {
    /// Balanced default for a desktop frame.
    ///
    /// Applications with larger workloads should construct an explicit
    /// capacity so exhaustion remains visible instead of allocating mid-frame.
    #[must_use]
    pub const fn desktop_default() -> Self {
        Self {
            passes: 256,
            resources: 512,
            accesses: 2_048,
            barriers: 2_560,
            tokens: 1_024,
        }
    }
}

/// Classe de limite que esgotou durante setup ou compile.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CapacityKind {
    /// Vetor de passes.
    Passes,
    /// Vetor de recursos.
    Resources,
    /// Vetor de acessos.
    Accesses,
    /// Vetor de barreiras.
    Barriers,
    /// Vetor de tokens entre filas.
    Tokens,
}

/// Explicit graph errors. No case allocates a `String` on the frame path.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GraphError {
    /// Uma capacidade pré-alocada não comporta a declaração.
    Capacity {
        /// Vetor que excedeu o teto.
        kind: CapacityKind,
        /// Número de elementos que seriam necessários.
        requested: usize,
        /// Teto configurado.
        capacity: usize,
    },
    /// Um handle pertence a outro quadro ou já foi invalidado por `reset`.
    StaleHandle,
    /// Uma escrita tentou produzir a mesma versão indefinida duas vezes.
    AlreadyProduced(ResourceId),
    /// `finish` recebeu saída criada por outro passe.
    OutputFromDifferentPass {
        /// Passe que tentou finalizar.
        finishing: PassId,
        /// Passe que registrou a escrita.
        writer: PassId,
    },
    /// `finish` recebeu um recurso que não tem produtor.
    OutputWithoutProducer(ResourceId),
    /// Invariante interna quebrada; este erro torna a falha visível sem
    /// introduzir uma alocação para mensagem no caminho de quadro.
    InternalInvariant,
}

impl fmt::Display for GraphError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Capacity {
                kind,
                requested,
                capacity,
            } => write!(f, "capacidade {kind:?} excedida: {requested} > {capacity}"),
            Self::StaleHandle => f.write_str("handle pertence a outro quadro ou outro grafo"),
            Self::AlreadyProduced(resource) => write!(f, "recurso {resource:?} já possui produtor"),
            Self::OutputFromDifferentPass { finishing, writer } => {
                write!(f, "saída de {writer:?} não pode finalizar o passe {finishing:?}")
            }
            Self::OutputWithoutProducer(resource) => write!(f, "recurso {resource:?} não possui produtor"),
            Self::InternalInvariant => f.write_str("invariante interna do render graph violada"),
        }
    }
}

impl std::error::Error for GraphError {}

#[derive(Debug, Clone, Copy)]
struct PassRecord {
    id: PassId,
    label: PassLabel,
    queue: Queue,
    side_effect: bool,
    first_access: usize,
    access_count: usize,
}

#[derive(Debug, Clone, Copy)]
struct ResourceRecord {
    desc: TextureDesc,
    label: ResourceLabel,
    producer: Option<PassId>,
    imported: bool,
    exported: bool,
    present_target: bool,
    initial_state: BarrierState,
}

#[derive(Debug, Clone, Copy)]
struct AccessRecord {
    id: AccessId,
    pass: PassId,
    resource: ResourceId,
    kind: AccessKind,
}

/// Uma barreira abstrata em ordem canônica `(pass_id, access_id)`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct Barrier {
    /// Passe que precisa da transição.
    pub pass: PassId,
    /// Acesso que ocasionou a transição; `None` é a volta final para `Present`.
    pub access: Option<AccessId>,
    /// Recurso transicionado.
    pub resource: ResourceId,
    /// Estado anterior conhecido pelo grafo lógico.
    pub from: BarrierState,
    /// Estado pedido pelo acesso seguinte.
    pub to: BarrierState,
}

/// Par `signal/wait` abstrato entre duas filas.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct SyncToken {
    /// Passe produtor que sinaliza.
    pub producer: PassId,
    /// Passe consumidor que espera.
    pub consumer: PassId,
}

/// Atribuição de recurso virtual a um slot do pool lógico.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct SlotAssignment {
    /// Recurso virtual.
    pub resource: ResourceId,
    /// Descritor exato da classe de pool.
    pub desc: TextureDesc,
    /// Domínio de fila da classe de pool.
    pub domain: QueueDomain,
    /// Slot lógico global no plano deste quadro.
    pub slot: u16,
}

/// Contagens estruturais e custo lógico obtidos pela compilação.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct GraphStats {
    /// Passes declarados no setup.
    pub passes: usize,
    /// Recursos virtuais declarados no setup.
    pub resources: usize,
    /// Acessos declarados no setup.
    pub accesses: usize,
    /// Dependências produtor→consumidor de recursos transitórios antes do culling.
    pub dependency_edges: usize,
    /// Passes preservados após o culling.
    pub active_passes: usize,
    /// Passes removidos pelo culling.
    pub culled_passes: usize,
    /// Pares ativos entre filas, já deduplicados.
    pub cross_queue_tokens: usize,
    /// Barreiras abstratas do plano.
    pub barriers: usize,
    /// Texturas físicas lógicas necessárias pelo plano conservador.
    pub logical_pool_slots: usize,
}

/// Plano compilado que empresta as saídas pré-alocadas do [`RenderGraph`].
pub struct CompiledGraph<'graph> {
    active_passes: &'graph [PassId],
    barriers: &'graph [Barrier],
    tokens: &'graph [SyncToken],
    slots: &'graph [SlotAssignment],
    imported_resources: &'graph [ResourceId],
    first_use: &'graph [u16],
    last_use: &'graph [u16],
    stats: GraphStats,
    checksum: u64,
}

impl CompiledGraph<'_> {
    /// Passes ativos em ordem de declaração.
    #[must_use]
    pub fn active_passes(&self) -> &[PassId] {
        self.active_passes
    }

    /// Barreiras abstratas em ordem determinística.
    #[must_use]
    pub fn barriers(&self) -> &[Barrier] {
        self.barriers
    }

    /// Tokens entre filas em ordem lexicográfica.
    #[must_use]
    pub fn tokens(&self) -> &[SyncToken] {
        self.tokens
    }

    /// Atribuições do pool lógico em ordem de `resource_id`.
    #[must_use]
    pub fn slots(&self) -> &[SlotAssignment] {
        self.slots
    }

    /// Imported textures referenced by at least one active pass.
    ///
    /// An execution backend must bind exactly one external view for every ID in
    /// this list before recording the frame.
    #[must_use]
    pub fn imported_resources(&self) -> &[ResourceId] {
        self.imported_resources
    }

    /// Intervalo inclusivo de uso de um recurso ativo, na ordem de declaração.
    #[must_use]
    pub fn lifetime(&self, resource: ResourceId) -> Option<(PassId, PassId)> {
        let index = resource.index();
        let first = *self.first_use.get(index)?;
        let last = *self.last_use.get(index)?;
        (first != NO_INDEX && last != NO_INDEX).then_some((PassId(first), PassId(last)))
    }

    /// Estatísticas estruturais calculadas durante `compile`.
    #[must_use]
    pub const fn stats(&self) -> GraphStats {
        self.stats
    }

    /// Checksum FNV-1a 64-bit do plano plano.
    #[must_use]
    pub const fn checksum(&self) -> u64 {
        self.checksum
    }
}

struct CompileScratch {
    remaining_outputs: Vec<u16>,
    pass_culled: Vec<bool>,
    reader_count: Vec<u16>,
    resource_dead: Vec<bool>,
    first_use: Vec<u16>,
    last_use: Vec<u16>,
    queue_mask: Vec<u8>,
    last_state: Vec<BarrierState>,
    seen: Vec<bool>,
    resource_stack: Vec<ResourceId>,
    active_passes: Vec<PassId>,
    active_resources: Vec<ResourceId>,
    slot_candidates: Vec<ResourceId>,
    barriers: Vec<Barrier>,
    tokens: Vec<SyncToken>,
    slots: Vec<SlotAssignment>,
    imported_resources: Vec<ResourceId>,
    active_slots: BinaryHeap<Reverse<(u16, u16)>>,
    free_slots: BinaryHeap<Reverse<u16>>,
}

impl CompileScratch {
    fn new(capacity: GraphCapacity) -> Self {
        Self {
            remaining_outputs: vec![0; capacity.passes],
            pass_culled: vec![false; capacity.passes],
            reader_count: vec![0; capacity.resources],
            resource_dead: vec![false; capacity.resources],
            first_use: vec![NO_INDEX; capacity.resources],
            last_use: vec![NO_INDEX; capacity.resources],
            queue_mask: vec![0; capacity.resources],
            last_state: vec![BarrierState::Undefined; capacity.resources],
            seen: vec![false; capacity.resources],
            resource_stack: Vec::with_capacity(capacity.resources),
            active_passes: Vec::with_capacity(capacity.passes),
            active_resources: Vec::with_capacity(capacity.resources),
            slot_candidates: Vec::with_capacity(capacity.resources),
            barriers: Vec::with_capacity(capacity.barriers),
            tokens: Vec::with_capacity(capacity.tokens),
            slots: Vec::with_capacity(capacity.resources),
            imported_resources: Vec::with_capacity(capacity.resources),
            active_slots: BinaryHeap::with_capacity(capacity.resources),
            free_slots: BinaryHeap::with_capacity(capacity.resources),
        }
    }

    fn reset(&mut self, pass_count: usize, resource_count: usize) {
        self.remaining_outputs[..pass_count].fill(0);
        self.pass_culled[..pass_count].fill(false);
        self.reader_count[..resource_count].fill(0);
        self.resource_dead[..resource_count].fill(false);
        self.first_use[..resource_count].fill(NO_INDEX);
        self.last_use[..resource_count].fill(NO_INDEX);
        self.queue_mask[..resource_count].fill(0);
        self.seen[..resource_count].fill(false);
        self.resource_stack.clear();
        self.active_passes.clear();
        self.active_resources.clear();
        self.slot_candidates.clear();
        self.barriers.clear();
        self.tokens.clear();
        self.slots.clear();
        self.imported_resources.clear();
        self.active_slots.clear();
        self.free_slots.clear();
    }
}

/// Grafo reconstruível por quadro, com todo armazenamento reservado no início.
pub struct RenderGraph {
    capacity: GraphCapacity,
    generation: u32,
    passes: Vec<PassRecord>,
    resources: Vec<ResourceRecord>,
    accesses: Vec<AccessRecord>,
    scratch: CompileScratch,
}

impl RenderGraph {
    /// Cria o grafo e todas as reservas do caminho de quadro.
    #[must_use]
    pub fn new(capacity: GraphCapacity) -> Self {
        assert!(capacity.passes < NO_INDEX as usize, "passes excedem identificador u16");
        assert!(
            capacity.resources < NO_INDEX as usize,
            "recursos excedem identificador u16"
        );
        assert!(
            capacity.accesses < NO_INDEX as usize,
            "acessos excedem identificador u16"
        );
        Self {
            capacity,
            generation: 0,
            passes: Vec::with_capacity(capacity.passes),
            resources: Vec::with_capacity(capacity.resources),
            accesses: Vec::with_capacity(capacity.accesses),
            scratch: CompileScratch::new(capacity),
        }
    }

    /// Limpa o setup anterior sem liberar capacidade e invalida seus handles.
    pub fn reset(&mut self) {
        self.generation = self.generation.wrapping_add(1);
        self.passes.clear();
        self.resources.clear();
        self.accesses.clear();
    }

    /// Importa uma textura inicialmente legível (por exemplo, `scene` ou
    /// `history`). Recursos importados não entram no pool lógico.
    pub fn import_texture(
        &mut self,
        desc: TextureDesc,
        label: ResourceLabel,
    ) -> Result<TexHandle<Readable>, GraphError> {
        let resource = self.push_resource(ResourceRecord {
            desc,
            label,
            producer: None,
            imported: true,
            exported: false,
            present_target: false,
            initial_state: BarrierState::SampledRead,
        })?;
        Ok(TexHandle::new(resource, self.generation))
    }

    /// Importa um alvo externo que começa em `Present` e deve ser escrito pelo
    /// passe de apresentação. O handle é indefinido no plano de conteúdo.
    pub fn import_render_target(
        &mut self,
        desc: TextureDesc,
        label: ResourceLabel,
    ) -> Result<TexHandle<Undefined>, GraphError> {
        let resource = self.push_resource(ResourceRecord {
            desc,
            label,
            producer: None,
            imported: true,
            exported: false,
            present_target: true,
            initial_state: BarrierState::Present,
        })?;
        Ok(TexHandle::new(resource, self.generation))
    }

    /// Cria um recurso virtual sem produtor. Para manter setup e acesso juntos,
    /// prefira [`PassBuilder::create_texture`] quando já estiver declarando um
    /// passe.
    pub fn create_texture(
        &mut self,
        desc: TextureDesc,
        label: ResourceLabel,
    ) -> Result<TexHandle<Undefined>, GraphError> {
        let resource = self.push_resource(ResourceRecord {
            desc,
            label,
            producer: None,
            imported: false,
            exported: false,
            present_target: false,
            initial_state: BarrierState::Undefined,
        })?;
        Ok(TexHandle::new(resource, self.generation))
    }

    /// Inicia a declaração de um passe. A ordem de chamadas define a ordem de
    /// execução; a compilação não faz reordenação topológica.
    pub fn begin_pass(
        &mut self,
        label: PassLabel,
        queue: Queue,
        side_effect: bool,
    ) -> Result<PassBuilder<'_>, GraphError> {
        if self.passes.len() == self.capacity.passes {
            return Err(self.capacity_error(CapacityKind::Passes, self.passes.len() + 1));
        }
        let id = PassId(u16::try_from(self.passes.len()).map_err(|_| GraphError::InternalInvariant)?);
        self.passes.push(PassRecord {
            id,
            label,
            queue,
            side_effect,
            first_access: self.accesses.len(),
            access_count: 0,
        });
        Ok(PassBuilder { graph: self, pass: id })
    }

    /// Mantém um resultado publicado como raiz da compilação, mesmo sem um
    /// consumidor no mesmo quadro. A API requer um handle legível.
    pub fn export(&mut self, texture: &TexHandle<Readable>) -> Result<(), GraphError> {
        self.validate_handle(texture.resource, texture.generation)?;
        self.resources[texture.resource.index()].exported = true;
        Ok(())
    }

    /// Compila o setup atual sem alocar: culling, usos, barreiras, tokens e
    /// atribuição de slots lógicos conservadores.
    #[allow(clippy::too_many_lines)]
    pub fn compile(&mut self) -> Result<CompiledGraph<'_>, GraphError> {
        let pass_count = self.passes.len();
        let resource_count = self.resources.len();
        self.scratch.reset(pass_count, resource_count);

        let mut dependency_edges = 0_usize;
        for access in &self.accesses {
            let resource = access.resource.index();
            if access.kind.is_read() {
                self.scratch.reader_count[resource] = self.scratch.reader_count[resource]
                    .checked_add(1)
                    .ok_or(GraphError::InternalInvariant)?;
                if self.resources[resource].producer.is_some() {
                    dependency_edges += 1;
                }
            }
        }
        for resource in &self.resources {
            if let Some(producer) = resource.producer {
                let remaining = &mut self.scratch.remaining_outputs[producer.index()];
                *remaining = remaining.checked_add(1).ok_or(GraphError::InternalInvariant)?;
            }
        }

        for resource_index in 0..resource_count {
            let resource = self.resources[resource_index];
            if resource.producer.is_some() && self.scratch.reader_count[resource_index] == 0 && !resource.exported {
                self.push_cull_resource(ResourceId(
                    u16::try_from(resource_index).map_err(|_| GraphError::InternalInvariant)?,
                ))?;
            }
        }
        for pass_index in 0..pass_count {
            if self.scratch.remaining_outputs[pass_index] == 0 && !self.passes[pass_index].side_effect {
                self.cull_pass(PassId(
                    u16::try_from(pass_index).map_err(|_| GraphError::InternalInvariant)?,
                ))?;
            }
        }
        while let Some(resource) = self.scratch.resource_stack.pop() {
            let resource_index = resource.index();
            if self.scratch.resource_dead[resource_index] {
                continue;
            }
            self.scratch.resource_dead[resource_index] = true;
            if let Some(producer) = self.resources[resource_index].producer {
                let remaining = &mut self.scratch.remaining_outputs[producer.index()];
                *remaining = remaining.checked_sub(1).ok_or(GraphError::InternalInvariant)?;
                if *remaining == 0 && !self.passes[producer.index()].side_effect {
                    self.cull_pass(producer)?;
                }
            }
        }

        for pass_index in 0..pass_count {
            if !self.scratch.pass_culled[pass_index] {
                self.scratch.active_passes.push(PassId(
                    u16::try_from(pass_index).map_err(|_| GraphError::InternalInvariant)?,
                ));
            }
        }

        for resource_index in 0..resource_count {
            self.scratch.last_state[resource_index] = self.resources[resource_index].initial_state;
        }

        for active_position in 0..self.scratch.active_passes.len() {
            let pass_id = self.scratch.active_passes[active_position];
            let pass = self.passes[pass_id.index()];
            if pass.id != pass_id {
                return Err(GraphError::InternalInvariant);
            }
            for access_index in pass.first_access..pass.first_access + pass.access_count {
                let access = self.accesses[access_index];
                if access.pass != pass_id {
                    return Err(GraphError::InternalInvariant);
                }
                let resource_index = access.resource.index();
                if self.scratch.first_use[resource_index] == NO_INDEX {
                    self.scratch.first_use[resource_index] = pass_id.0;
                    self.scratch.active_resources.push(access.resource);
                }
                self.scratch.last_use[resource_index] = pass_id.0;
                self.scratch.queue_mask[resource_index] |= pass.queue.bit();

                let before = self.scratch.last_state[resource_index];
                let after = access.kind.state();
                let needs_barrier = (!self.scratch.seen[resource_index] && before == BarrierState::Undefined)
                    || before != after
                    || (self.scratch.seen[resource_index] && (before.is_write() || after.is_write()));
                if needs_barrier {
                    self.push_barrier(Barrier {
                        pass: pass_id,
                        access: Some(access.id),
                        resource: access.resource,
                        from: before,
                        to: after,
                    })?;
                }
                self.scratch.last_state[resource_index] = after;
                self.scratch.seen[resource_index] = true;

                if access.kind.is_read() {
                    if let Some(producer) = self.resources[resource_index].producer {
                        if !self.scratch.pass_culled[producer.index()]
                            && self.passes[producer.index()].queue != pass.queue
                        {
                            self.push_token(SyncToken {
                                producer,
                                consumer: pass_id,
                            })?;
                        }
                    }
                }
            }
        }

        for resource_index in 0..resource_count {
            let resource = self.resources[resource_index];
            if resource.present_target && self.scratch.seen[resource_index] {
                let before = self.scratch.last_state[resource_index];
                if before != BarrierState::Present {
                    self.push_barrier(Barrier {
                        pass: PassId(self.scratch.last_use[resource_index]),
                        access: None,
                        resource: ResourceId(u16::try_from(resource_index).map_err(|_| GraphError::InternalInvariant)?),
                        from: before,
                        to: BarrierState::Present,
                    })?;
                }
            }
        }

        self.scratch.tokens.sort_unstable();
        self.assign_logical_slots()?;
        self.scratch
            .slots
            .sort_unstable_by_key(|assignment| assignment.resource);
        for resource_index in 0..resource_count {
            if self.resources[resource_index].imported && self.scratch.first_use[resource_index] != NO_INDEX {
                self.scratch.imported_resources.push(ResourceId(
                    u16::try_from(resource_index).map_err(|_| GraphError::InternalInvariant)?,
                ));
            }
        }

        let stats = GraphStats {
            passes: pass_count,
            resources: resource_count,
            accesses: self.accesses.len(),
            dependency_edges,
            active_passes: self.scratch.active_passes.len(),
            culled_passes: self.scratch.pass_culled[..pass_count]
                .iter()
                .filter(|culled| **culled)
                .count(),
            cross_queue_tokens: self.scratch.tokens.len(),
            barriers: self.scratch.barriers.len(),
            logical_pool_slots: self
                .scratch
                .slots
                .iter()
                .map(|assignment| usize::from(assignment.slot) + 1)
                .max()
                .unwrap_or(0),
        };
        let checksum = self.checksum();

        Ok(CompiledGraph {
            active_passes: &self.scratch.active_passes,
            barriers: &self.scratch.barriers,
            tokens: &self.scratch.tokens,
            slots: &self.scratch.slots,
            imported_resources: &self.scratch.imported_resources,
            first_use: &self.scratch.first_use[..resource_count],
            last_use: &self.scratch.last_use[..resource_count],
            stats,
            checksum,
        })
    }

    fn push_resource(&mut self, record: ResourceRecord) -> Result<ResourceId, GraphError> {
        if self.resources.len() == self.capacity.resources {
            return Err(self.capacity_error(CapacityKind::Resources, self.resources.len() + 1));
        }
        let id = ResourceId(u16::try_from(self.resources.len()).map_err(|_| GraphError::InternalInvariant)?);
        self.resources.push(record);
        Ok(id)
    }

    fn validate_handle(&self, resource: ResourceId, generation: u32) -> Result<(), GraphError> {
        if generation != self.generation || resource.index() >= self.resources.len() {
            return Err(GraphError::StaleHandle);
        }
        Ok(())
    }

    fn claim_undefined_for_write(&mut self, resource: ResourceId) -> Result<ResourceId, GraphError> {
        let record = self
            .resources
            .get_mut(resource.index())
            .ok_or(GraphError::StaleHandle)?;
        if record.producer.is_some() {
            return Err(GraphError::AlreadyProduced(resource));
        }
        Ok(resource)
    }

    fn rename_for_write(&mut self, resource: ResourceId) -> Result<ResourceId, GraphError> {
        let prior = *self.resources.get(resource.index()).ok_or(GraphError::StaleHandle)?;
        self.push_resource(ResourceRecord {
            desc: prior.desc,
            label: prior.label,
            producer: None,
            imported: false,
            exported: false,
            present_target: false,
            initial_state: BarrierState::Undefined,
        })
    }

    fn set_producer(&mut self, resource: ResourceId, pass: PassId) -> Result<(), GraphError> {
        let record = self
            .resources
            .get_mut(resource.index())
            .ok_or(GraphError::InternalInvariant)?;
        if record.producer.is_some() {
            return Err(GraphError::AlreadyProduced(resource));
        }
        record.producer = Some(pass);
        Ok(())
    }

    fn append_access(&mut self, pass: PassId, resource: ResourceId, kind: AccessKind) -> Result<(), GraphError> {
        if self.accesses.len() == self.capacity.accesses {
            return Err(self.capacity_error(CapacityKind::Accesses, self.accesses.len() + 1));
        }
        let id = AccessId(u16::try_from(self.accesses.len()).map_err(|_| GraphError::InternalInvariant)?);
        self.accesses.push(AccessRecord {
            id,
            pass,
            resource,
            kind,
        });
        let pass_record = self.passes.get_mut(pass.index()).ok_or(GraphError::InternalInvariant)?;
        pass_record.access_count = pass_record
            .access_count
            .checked_add(1)
            .ok_or(GraphError::InternalInvariant)?;
        Ok(())
    }

    fn push_cull_resource(&mut self, resource: ResourceId) -> Result<(), GraphError> {
        if self.scratch.resource_stack.len() == self.scratch.resource_stack.capacity() {
            return Err(self.capacity_error(CapacityKind::Resources, self.scratch.resource_stack.len() + 1));
        }
        self.scratch.resource_stack.push(resource);
        Ok(())
    }

    fn cull_pass(&mut self, pass: PassId) -> Result<(), GraphError> {
        if self.scratch.pass_culled[pass.index()] {
            return Ok(());
        }
        self.scratch.pass_culled[pass.index()] = true;
        let record = self.passes[pass.index()];
        for access_index in record.first_access..record.first_access + record.access_count {
            let access = self.accesses[access_index];
            if access.kind.is_read() {
                let resource_index = access.resource.index();
                let readers = &mut self.scratch.reader_count[resource_index];
                *readers = readers.checked_sub(1).ok_or(GraphError::InternalInvariant)?;
                if *readers == 0 {
                    let resource = self.resources[resource_index];
                    if resource.producer.is_some() && !resource.exported {
                        self.push_cull_resource(access.resource)?;
                    }
                }
            }
        }
        Ok(())
    }

    fn push_barrier(&mut self, barrier: Barrier) -> Result<(), GraphError> {
        if self.scratch.barriers.len() == self.capacity.barriers {
            return Err(self.capacity_error(CapacityKind::Barriers, self.scratch.barriers.len() + 1));
        }
        self.scratch.barriers.push(barrier);
        Ok(())
    }

    fn push_token(&mut self, token: SyncToken) -> Result<(), GraphError> {
        if self.scratch.tokens.contains(&token) {
            return Ok(());
        }
        if self.scratch.tokens.len() == self.capacity.tokens {
            return Err(self.capacity_error(CapacityKind::Tokens, self.scratch.tokens.len() + 1));
        }
        self.scratch.tokens.push(token);
        Ok(())
    }

    fn assign_logical_slots(&mut self) -> Result<(), GraphError> {
        for resource in self.scratch.active_resources.iter().copied() {
            let record = self.resources[resource.index()];
            if !record.imported {
                self.scratch.slot_candidates.push(resource);
            }
        }
        self.scratch.slot_candidates.sort_unstable_by(|left, right| {
            let left_record = self.resources[left.index()];
            let right_record = self.resources[right.index()];
            (
                left_record.desc,
                QueueDomain::from_mask(self.scratch.queue_mask[left.index()]),
                self.scratch.first_use[left.index()],
                *left,
            )
                .cmp(&(
                    right_record.desc,
                    QueueDomain::from_mask(self.scratch.queue_mask[right.index()]),
                    self.scratch.first_use[right.index()],
                    *right,
                ))
        });

        let mut cursor = 0;
        let mut slot_base = 0_u16;
        while cursor < self.scratch.slot_candidates.len() {
            let first = self.scratch.slot_candidates[cursor];
            let first_record = self.resources[first.index()];
            let desc = first_record.desc;
            let domain = QueueDomain::from_mask(self.scratch.queue_mask[first.index()]);
            let mut end = cursor + 1;
            while end < self.scratch.slot_candidates.len() {
                let candidate = self.scratch.slot_candidates[end];
                let candidate_record = self.resources[candidate.index()];
                if candidate_record.desc != desc
                    || QueueDomain::from_mask(self.scratch.queue_mask[candidate.index()]) != domain
                {
                    break;
                }
                end += 1;
            }

            self.scratch.active_slots.clear();
            self.scratch.free_slots.clear();
            let mut local_slot_count = 0_u16;
            for candidate_index in cursor..end {
                let resource = self.scratch.slot_candidates[candidate_index];
                let first_use = self.scratch.first_use[resource.index()];
                let last_use = self.scratch.last_use[resource.index()];
                let local_slot = if domain == QueueDomain::Shared {
                    let slot = local_slot_count;
                    local_slot_count = local_slot_count.checked_add(1).ok_or(GraphError::InternalInvariant)?;
                    slot
                } else {
                    while let Some(Reverse((last_active, _))) = self.scratch.active_slots.peek().copied() {
                        if last_active >= first_use {
                            break;
                        }
                        let Reverse((_, freed)) =
                            self.scratch.active_slots.pop().ok_or(GraphError::InternalInvariant)?;
                        self.scratch.free_slots.push(Reverse(freed));
                    }
                    let slot = if let Some(Reverse(free)) = self.scratch.free_slots.pop() {
                        free
                    } else {
                        let next = local_slot_count;
                        local_slot_count = local_slot_count.checked_add(1).ok_or(GraphError::InternalInvariant)?;
                        next
                    };
                    self.scratch.active_slots.push(Reverse((last_use, slot)));
                    slot
                };
                let slot = slot_base.checked_add(local_slot).ok_or(GraphError::InternalInvariant)?;
                self.scratch.slots.push(SlotAssignment {
                    resource,
                    desc,
                    domain,
                    slot,
                });
            }
            slot_base = slot_base
                .checked_add(local_slot_count)
                .ok_or(GraphError::InternalInvariant)?;
            cursor = end;
        }
        Ok(())
    }

    fn checksum(&self) -> u64 {
        let mut hash = 14_695_981_039_346_656_037_u64;
        hash = fnv_field(hash, 1);
        for pass in &self.scratch.active_passes {
            let record = self.passes[pass.index()];
            hash = fnv_field(hash, u64::from(record.id.0));
            hash = fnv_field(hash, u64::from(record.label.0));
            hash = fnv_field(hash, record.queue as u64);
            hash = fnv_field(hash, u64::from(record.side_effect));
        }
        hash = fnv_field(hash, 2);
        for barrier in &self.scratch.barriers {
            hash = fnv_field(hash, u64::from(barrier.pass.0));
            hash = fnv_field(hash, barrier.access.map_or(u64::MAX, |access| u64::from(access.0)));
            hash = fnv_field(hash, u64::from(barrier.resource.0));
            hash = fnv_field(hash, barrier.from as u64);
            hash = fnv_field(hash, barrier.to as u64);
        }
        hash = fnv_field(hash, 3);
        for token in &self.scratch.tokens {
            hash = fnv_field(hash, u64::from(token.producer.0));
            hash = fnv_field(hash, u64::from(token.consumer.0));
        }
        hash = fnv_field(hash, 4);
        for assignment in &self.scratch.slots {
            hash = fnv_field(hash, u64::from(assignment.resource.0));
            hash = fnv_field(hash, u64::from(assignment.slot));
            hash = fnv_field(hash, assignment.domain as u64);
        }
        hash
    }

    fn capacity_error(&self, kind: CapacityKind, requested: usize) -> GraphError {
        let capacity = match kind {
            CapacityKind::Passes => self.capacity.passes,
            CapacityKind::Resources => self.capacity.resources,
            CapacityKind::Accesses => self.capacity.accesses,
            CapacityKind::Barriers => self.capacity.barriers,
            CapacityKind::Tokens => self.capacity.tokens,
        };
        GraphError::Capacity {
            kind,
            requested,
            capacity,
        }
    }
}

/// Builder de setup que registra acessos de um único passe.
#[must_use = "um PassBuilder deve ser finalizado por finish ou finish_without_output"]
pub struct PassBuilder<'graph> {
    graph: &'graph mut RenderGraph,
    pass: PassId,
}

impl PassBuilder<'_> {
    /// Cria uma textura virtual pertencente ao setup deste passe.
    pub fn create_texture(
        &mut self,
        desc: TextureDesc,
        label: ResourceLabel,
    ) -> Result<TexHandle<Undefined>, GraphError> {
        self.graph.create_texture(desc, label)
    }

    /// Declara leitura de uma versão publicada. `Undefined` e `Written` não
    /// satisfazem esta assinatura, logo ler antes de produzir não é expressável.
    pub fn read(&mut self, texture: &TexHandle<Readable>) -> Result<TextureRef, GraphError> {
        self.graph.validate_handle(texture.resource, texture.generation)?;
        self.graph
            .append_access(self.pass, texture.resource, AccessKind::SampledRead)?;
        Ok(TextureRef(texture.resource))
    }

    /// Declara escrita como attachment. O handle de entrada é consumido; uma
    /// escrita sobre `Readable` cria uma versão virtual nova.
    pub fn write_color<S: WritableTextureState>(
        &mut self,
        texture: TexHandle<S>,
    ) -> Result<TexHandle<Written>, GraphError> {
        self.write(texture, AccessKind::ColorWrite)
    }

    /// Declara escrita por compute. O tipo de saída continua `Written` até o
    /// [`Self::finish`] publicar a versão.
    pub fn write_storage<S: WritableTextureState>(
        &mut self,
        texture: TexHandle<S>,
    ) -> Result<TexHandle<Written>, GraphError> {
        self.write(texture, AccessKind::StorageWrite)
    }

    /// Publica a saída do passe, transformando-a em `Readable`.
    #[allow(clippy::needless_pass_by_value)]
    pub fn finish(self, output: TexHandle<Written>) -> Result<TexHandle<Readable>, GraphError> {
        self.graph.validate_handle(output.resource, output.generation)?;
        let producer = self.graph.resources[output.resource.index()]
            .producer
            .ok_or(GraphError::OutputWithoutProducer(output.resource))?;
        if producer != self.pass {
            return Err(GraphError::OutputFromDifferentPass {
                finishing: self.pass,
                writer: producer,
            });
        }
        Ok(TexHandle::new(output.resource, output.generation))
    }

    /// Fecha um passe sem saída tipada; somente é apropriado para efeito
    /// colateral explicitamente marcado no início do passe.
    pub fn finish_without_output(self) {}

    #[allow(clippy::needless_pass_by_value)]
    fn write<S: WritableTextureState>(
        &mut self,
        texture: TexHandle<S>,
        kind: AccessKind,
    ) -> Result<TexHandle<Written>, GraphError> {
        self.graph.validate_handle(texture.resource, texture.generation)?;
        if self.graph.accesses.len() == self.graph.capacity.accesses {
            return Err(self
                .graph
                .capacity_error(CapacityKind::Accesses, self.graph.accesses.len() + 1));
        }
        let resource = S::prepare_write(self.graph, texture.resource)?;
        self.graph.set_producer(resource, self.pass)?;
        self.graph.append_access(self.pass, resource, kind)?;
        Ok(TexHandle::new(resource, texture.generation))
    }
}

fn fnv_field(mut hash: u64, field: u64) -> u64 {
    for byte in field.to_le_bytes() {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(1_099_511_628_211);
    }
    hash
}
