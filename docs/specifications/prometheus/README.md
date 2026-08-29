# PROMETHEUS (Motor Nativo)

A arquitetura do motor PROMETHEUS é a implementação nativa (em WGPU/Rust) de renderização ultra-realista baseada na infraestrutura de experimentação gráfica do laboratório Unrail. O objetivo desta trilha não é substituir o _fallback_ em WebGL2 para a Web, mas oferecer uma experiência rica e acelerada (Desktop nativo) do simulador BRAIN PRO, explorando *Geometry Virtualization*, GI, *Subsurface Scattering*, e *Wave Function Collapse* aplicados à neuroanatomia.

## A Regra de Isolamento Científico (GFX-001)

A condição absoluta de existência do motor gráfico do PROMETHEUS é que a ciência contida em `brain-engine` (equações neurais, *hashes* de estado, química celular) seja inteiramente determinística e inviolável pela pipeline de renderização.

- O Workspace PROMETHEUS (`d:\Projects\blightghp\engine\`) integra uma interface L0-L4 independente.
- A comunicação com a ciência ocorre pela `RenderExtractable`, uma trait de interface puramente *read-only*. O PROMETHEUS consome fatias de memória flat contendo posições, voltagens e campos contínuos, e lê o Hash Científico BLAKE3 para se certificar de que nenhum pixel corrompeu um volt.

## Cronograma de Execução: Fases do PROMETHEUS (Φ)

A implementação trará 13 bibliotecas teóricas do laboratório para formar o Motor PROMETHEUS através das seguintes 6 fases iterativas:

### Φ-0: Genesis (COMPLETA)
Estabelecimento do workspace nativo. L0-L4 instanciado com zero-unsafe e ECS em estilo columnar arquetipal, protegido por um provador VramLedger e isolamento científico estabelecido.
- Crates principais: `prometheus-error`, `prometheus-math`, `prometheus-alloc`, `prometheus-ecs`, `prometheus-window`, `prometheus-gpu`, `prometheus-core`.

### Φ-1: First Light
Iluminação e Pipeline PBR inicial. A geometria simples e estática da ciência ganhará materialidade fotométrica autêntica.
- Implementações: Render Graph dinâmico (`susanna`) e materialização de texturas procedurais base.

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
