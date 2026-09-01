# PROMETHEUS (Motor Nativo)

A arquitetura do motor PROMETHEUS é a implementação nativa (em WGPU/Rust) de renderização ultra-realista baseada na infraestrutura de experimentação gráfica do laboratório Unrail. O objetivo desta trilha não é substituir o _fallback_ em WebGL2 para a Web, mas oferecer uma experiência rica e acelerada (Desktop nativo) do simulador BRAIN PRO, explorando *Geometry Virtualization*, GI, *Subsurface Scattering*, e *Wave Function Collapse* aplicados à neuroanatomia.

## A Regra de Isolamento Científico (GFX-001)

A condição absoluta de existência do motor gráfico do PROMETHEUS é que a ciência contida em `brain-engine` (equações neurais, *hashes* de estado, química celular) seja inteiramente determinística e inviolável pela pipeline de renderização.

- O Workspace PROMETHEUS (`engine/`) mantém uma interface L0-L4 independente.
- `RenderExtractable` é o contrato puramente *read-only* definido em `brain-engine`. A ponte de runtime ainda não foi ligada ao workspace nativo: o PROMETHEUS só poderá consumir fatias de posições, voltagens, campos contínuos e hash científico depois que o adaptador e o runner forem implementados e auditados.

## Cronograma de Execução: Fases do PROMETHEUS (Φ)

A implementação trará 13 bibliotecas teóricas do laboratório para formar o Motor PROMETHEUS através das seguintes 6 fases iterativas:

### Φ-0: Genesis (COMPLETA)
Estabelecimento do workspace nativo. L0-L4 instanciado com zero-unsafe e ECS em estilo columnar arquetipal, protegido por um provador VramLedger e isolamento científico estabelecido.
- Crates principais: `prometheus-error`, `prometheus-math`, `prometheus-alloc`, `prometheus-ecs`, `prometheus-window`, `prometheus-gpu`, `prometheus-render-graph`, `prometheus-core`.

### Φ-1: First Light (EM ANDAMENTO)
Iluminação e Pipeline PBR inicial. A geometria simples e estática da ciência ganhará materialidade fotométrica autêntica.
- Implementações: Render Graph dinâmico (`susanna`) e materialização de texturas procedurais base.
- Promoção concluída: `prometheus-render-graph`, núcleo portátil derivado do `susanna`, com handles de textura tipados, culling de passes, barreiras abstratas, sincronização entre filas, pooling lógico conservador e checksum determinístico.
- Executor concluído: `prometheus-gpu::RenderGraphExecutor` materializa slots transitórios em `wgpu 30`, valida views importadas e entrega um `CommandEncoder` ao callback de cada passe. O backend WebGPU possui uma única queue; portanto, os passes Graphics/Compute são gravados em ordem determinística e os tokens entre filas são preservados como metadados de dependência.
- Plataforma unificada: os crates `prometheus-gpu` e `prometheus-window` usam exclusivamente a dependência de workspace `wgpu 30.0.1`; a implementação anterior em `wgpu 0.20` foi removida.

### Φ-2: Nanite Brain
Injeção massiva da anatomia microscópica usando instanciamento infinito.
- Implementações: Geometry Virtualization (`agnesi`) possibilitando desenhar bilhões de micrômetros sem submissões de draw calls esgotantes.

### Φ-3: Deep Tissue
A luz se espalhando pelas lâminas corticais e tecidos biológicos.
- Implementações: Global Illumination (`sonja`) e Espalhamento Subsuperficial / SSS avançado (`maryam`), permitindo enxergar a atividade celular retro-iluminando capilares e massas de gordura do tecido cerebral.

### Φ-4: Living Brain
O ecossistema em mutação anatômica contínua sem quebrar restrições de estado.
- Implementações: Wave Function Collapse em 3D (`hipatia`) e Gaussian Splatting acoplado (`katherine`) para a geração espacial contínua e fotorrealista da substância cinzenta.

### Φ-5: Full Cortex
Sinergia das pipelines WebAssembly e interatividade vetorial completa no motor.
- Implementações: Comunicação bidirecional limpa via Wasm (`elisa`), Processamento de Áudio Espacial DSP (`germain`), e hierarquia de cinemática inversa (`emmy`).

---

**Nota Arquitetural**: Esta documentação substitui o programa conceitual conhecido antigamente como *Unrail Motor*, materializando essas teorias em um workspace funcional e implementado progressivamente no repositório.
