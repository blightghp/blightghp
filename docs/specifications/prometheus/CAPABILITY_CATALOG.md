# Catálogo superior de capacidades · Unrail Motor

**Estado documental:** inventário provisório, revisado em 21 de agosto de 2026
**Limite superior:** 84 capacidades candidatas — 78 de motor (`um_*`) e 6 de produto (`neuro_*`)
**Situação:** nenhum crate existe e nenhuma fronteira de pacote está congelada
**Pré-requisitos de leitura:** [léxico](GLOSSARY.md) e [arquitetura](ARCHITECTURE.md)

Cada linha representa uma capacidade candidata, não uma ordem para criar um
diretório. UM-002 exige uma fronteira coesa e verificável; capacidades podem
começar como módulos e só viram crates por isolamento comprovado. A coluna
**entra em** registra a hipótese original do
[inventário subordinado](../../planning/backlog/UNRAIL_HORIZONS.md), não um
grafo executável. `UM0-ENTRY` deve recalcular dependências e cortes antes do
primeiro scaffold. A coluna **empréstimo**
aponta a dependência externa inicial, registrada com ID na
[política de dependências](DEPENDENCY_POLICY.md); `—` significa autoria
própria desde a primeira linha.

## Anel 0 · Fundação (15 crates)

| Crate | Responsabilidade | Dono do estado | Depende de | Empréstimo | Entra em |
| :-- | :-- | :-- | :-- | :-- | :-- |
| `um_core` | tipos base, erro, resultado, IDs estáveis, tempo, versão de contrato | — | — | — | U0-A |
| `um_bytes` | reinterpretar estruturas POD como bytes para a GPU com prova de layout | — | `um_core` | `DEP-008` | U0-A |
| `um_hash` | fingerprint determinístico de regressão e identidade de conteúdo; digest criptográfico usa implementação auditada | — | `um_core` | — | U0-A |
| `um_math` | vetores, matrizes, quatérnios, transformações, planos, volumes, curvas, ruído e SIMD | — | `um_core` | — | U0-A |
| `um_alloc` | arena, pool, alocador etiquetado e teto por subsistema | orçamento de memória | `um_core` | — | U0-D |
| `um_container` | SoA, slotmap, anel, vetor pequeno e internamento de `Name` | — | `um_core`, `um_alloc` | — | U0-D |
| `um_handle` | handle geracional, tabela de objetos e propriedade explícita | tabelas de objetos | `um_core`, `um_container` | — | U1-A |
| `um_thread` | grafo de tarefas, `parallel-for` determinístico e redução por ID | pool de trabalho | `um_core` | — | U1-C |
| `um_platform` | fachada de janela, entrada, tempo, arquivo, DPI e ciclo de vida | janela e fila de eventos | `um_core`, `um_math` | `DEP-002`, `DEP-009` | U0-A |
| `um_log` | categorias, níveis, sinks e formatação sem alocação no caminho quente | — | `um_core` | — | U0-A |
| `um_trace` | escopos instrumentados, contadores e linha do tempo exportável | buffer de trace | `um_core`, `um_thread` | — | U1-C |
| `um_config` | variáveis de console, camadas de configuração e recarga em memória | árvore de configuração | `um_core`; persistência pertence a adaptador do anel de dados | — | U2-D |
| `um_event` | barramento tipado, assinatura e despacho ordenado | filas de evento | `um_core`, `um_container` | — | U2-D |
| `um_reflect` | Registro Vivo de Tipos: propriedades, metadados, acesso genérico e diff | registro global de tipos | `um_core`, `um_container` | — | U5-A |
| `um_reflect_derive` | Derivação de Reflexão por macro procedural | — | — | `TOOL-001`; `syn`/`quote` só entram como `DEP-*` se selecionados | U5-A |

## Anel 1 · Dados e assets (11 crates)

| Crate | Responsabilidade | Dono do estado | Depende de | Empréstimo | Entra em |
| :-- | :-- | :-- | :-- | :-- | :-- |
| `um_serialize` | formato binário e textual versionado, com migração explícita | — | `um_core`, `um_bytes` | — | U1-A |
| `um_compress` | fachada de compressão com formato, limites e fuzzing; implementação própria só após threat model | — | `um_core` | a selecionar | U5-E |
| `um_pack` | contêiner `.umpk`, indexação, mapeamento em memória e assinatura auditada | pacotes montados | `um_serialize`, `um_compress`, `um_hash` | a selecionar | U5-E |
| `um_ddc` | Cache Derivado local endereçado por hash de conteúdo e versão de algoritmo | cache em disco | `um_hash`, `um_serialize` | — | U1-B |
| `um_asset` | GUID, importação, dependências, recarga a quente e streaming | banco de assets | `um_serialize`, `um_ddc`, `um_handle` | — | U1-B |
| `um_image` | fachada de imagem, mipmaps e compressão de bloco; codecs entram por dependência auditada e fuzzing | — | `um_core`, `um_bytes` | `DEP-006` | U1-B |
| `um_mesh` | descrição de malha, leitura de glTF/OBJ, tangentes, simplificação, LOD e meshlets | — | `um_math`, `um_serialize` | `DEP-004`, `DEP-005` | U0-B |
| `um_geometry` | BVH, campo de distância, voxelização, marching cubes, booleanos e tetraedralização | — | `um_math`, `um_mesh` | — | U1-D |
| `um_color` | espaços de cor, funções de transferência, LUT e mapeamento tonal como dado | — | `um_math` | — | U2-C |
| `um_font` | leitura de TTF, atlas de campo de distância e composição de linha | atlas de glifos | `um_image`, `um_geometry` | — | U6-A |
| `um_localize` | tabelas de string, chaves estáveis e pluralização | tabelas ativas | `um_serialize` | — | U6-D |

## Anel 2 · Renderização (14 crates)

| Crate | Responsabilidade | Dono do estado | Depende de | Empréstimo | Entra em |
| :-- | :-- | :-- | :-- | :-- | :-- |
| `um_rhi` | Interface de Hardware de Renderização: dispositivo, fila, buffer, textura, pipeline e sincronização | recursos de GPU | `um_core`, `um_math` | — | U0-A |
| `um_rhi_wgpu` | backend emprestado da IHR | — | `um_rhi` | `DEP-001` | U0-A |
| `um_shader` | pré-processador, permutações declaradas, reflexão de binding e cache | módulos compilados | `um_rhi`, `um_ddc` | `DEP-003` | U0-C |
| `um_rg` | Grafo de Quadro: passes, recursos transitórios, barreiras e aliasing | grafo do quadro | `um_rhi`, `um_thread` | — | U2-A |
| `um_render` | culling, ordenação, instanciamento, buffer de visibilidade e submissão | listas de desenho | `um_rg`, `um_mesh`, `um_material` | — | U0-C |
| `um_material` | modelo de material, parâmetros, instâncias e compilação de permutação | instâncias de material | `um_shader`, `um_color` | — | U2-B |
| `um_light` | luzes analíticas, luz de área, sondas de irradiância e IBL | conjunto de luzes | `um_render` | — | U2-B |
| `um_shadow` | mapas em cascata, filtragem e, depois, paginação esparsa | atlas de sombra | `um_render` | — | U2-E |
| `um_post` | exposição, mapeamento tonal, brilho, profundidade de campo e gradação | alvos de pós-processo | `um_rg`, `um_color` | — | U2-C |
| `um_temporal` | reconstrução temporal, histórico e rejeição de amostra | histórico de quadro | `um_post` | — | U4-C |
| `um_ui` | Camada de Interface Retida e imediata, layout, texto, foco, teclado e contraste | árvore de widgets | `um_render`, `um_font` | `DEP-007` | U0-E |
| `um_debug_draw` | linhas, gizmos, rótulos e sobreposições de diagnóstico | fila de primitivas | `um_render` | — | U0-E |
| `um_vfx` | emissores dirigidos por dados, simulação de partículas em CPU e GPU | sistemas ativos | `um_render`, `um_thread` | — | U4-B |
| `um_volume` | renderização volumétrica direta, transferência de opacidade e névoa participativa | texturas de volume | `um_render`, `um_geometry` | — | U3-D |

## Anel 3 · Simulação (7 crates)

| Crate | Responsabilidade | Dono do estado | Depende de | Empréstimo | Entra em |
| :-- | :-- | :-- | :-- | :-- | :-- |
| `um_physics` | corpos rígidos, broadphase, contatos, juntas e consultas espaciais | mundo rígido | `um_math`, `um_geometry`, `um_thread` | — | U7-A |
| `um_softbody` | XPBD tetraédrico, elasticidade, plasticidade e corte topológico | malha deformável | `um_geometry`, `um_thread` | — | U7-B |
| `um_cloth` | tecido fino, colisão com corpo e restrição de flexão | malha de tecido | `um_softbody` | — | U7-C |
| `um_fluid` | SPH de superfície, água rasa e advecção sobre face cortada | partículas e grades | `um_math`, `um_thread` | — | U4-A |
| `um_fracture` | pré-fratura, propagação de trinca e agrupamento por conexão | fragmentos | `um_geometry`, `um_physics` | — | U7-D |
| `um_anim` | esqueleto, skinning, cinemática inversa e curvas | poses ativas | `um_math`, `um_mesh` | — | U7-E |
| `um_haptic` | laço de alta frequência desacoplado do quadro e interpolação de força | estado do dispositivo | `um_thread`, `um_physics` | — | U7-F |

## Anel 4 · Mundo e framework (8 crates)

| Crate | Responsabilidade | Dono do estado | Depende de | Empréstimo | Entra em |
| :-- | :-- | :-- | :-- | :-- | :-- |
| `um_ecs` | arquétipos, consultas, detecção de mudança e agendamento determinístico | mundo de entidades | `um_container`, `um_thread` | — | U5-B |
| `um_scene` | hierarquia de transformação, limites e visibilidade | grafo de cena | `um_ecs`, `um_math` | — | U5-B |
| `um_world` | particionamento espacial, streaming de célula e origem em precisão dupla | células carregadas | `um_scene`, `um_asset` | — | U5-D |
| `um_gameplay` | entidades de alto nível, ticks, subsistemas e mapeamento de entrada | estado de aplicação | `um_ecs`, `um_event`, `um_platform` | — | U5-C |
| `um_ability` | Sistema de Procedimentos e Efeitos: atributos, tags, pré-condições e reversão | atributos e efeitos ativos | `um_gameplay`, `um_reflect` | — | U8-C |
| `um_state` | máquinas de estado hierárquicas e árvores de comportamento | estados ativos | `um_ecs` | — | U8-C |
| `um_script` | Linguagem de Roteiro: analisador, tipos, bytecode e VM com recarga | heap do roteiro | `um_reflect`, `um_serialize` | — | U8-A |
| `um_flow` | Grafo de Fluxo compilado para o mesmo bytecode do roteiro | grafos autorais | `um_script` | — | U8-B |

## Anel 5 · Escala e autonomia (16 crates)

Este anel existe para uma coisa só: **devolver os empréstimos**.

| Crate | Responsabilidade | Substitui | Depende de | Entra em |
| :-- | :-- | :-- | :-- | :-- |
| `um_rhi_vk` | backend Vulkan próprio com descritores sem vínculo | `DEP-001` | `um_rhi` | U9-A |
| `um_rhi_dx12` | backend Direct3D 12 próprio | `DEP-001` | `um_rhi` | U9-B |
| `um_rhi_mtl` | backend Metal próprio | `DEP-001` | `um_rhi` | U9-C |
| `um_rhi_webgpu` | backend WebGPU para o alvo navegador | `DEP-001` | `um_rhi` | U9-D |
| `um_shader_ir` | linguagem e IR próprias emitindo SPIR-V e DXIL | `DEP-003` | `um_shader` | U9-E |
| `um_platform_win32` | janela, entrada e tempo em Win32 | `DEP-002` | `um_platform` | U9-A |
| `um_platform_x11` | janela e entrada em X11 | `DEP-002` | `um_platform` | U9-F |
| `um_platform_cocoa` | janela e entrada em macOS | `DEP-002` | `um_platform` | U9-F |
| `um_geo_virt` | Virtualização de Geometria: clusters, DAG de erro e culling na GPU | — | `um_mesh`, `um_render` | U9-G |
| `um_gi` | Iluminação Global por Cache de Superfície e sondas dinâmicas | — | `um_light`, `um_geometry` | U9-H |
| `um_tex_virt` | Texturas Virtualizadas com buffer de retorno e streaming por tile | — | `um_image`, `um_render` | U9-I |
| `um_net` | Replicação Autoritativa, RPC, relevância e reconciliação | — | `um_ecs`, `um_serialize` | U9-J |
| `um_audio` | Grafo de Áudio, submixes e espacialização | — | `um_thread`, `um_math` | U9-K |
| `um_audio_dsp` | filtros, convolução e reverberação | — | `um_audio` | U9-K |
| `um_abi` | vtables `extern "C"`, handshake de versão e compatibilidade | — | `um_core` | U9-L |
| `um_plugin` | descoberta, carregamento e ciclo de vida de Módulos Externos | — | `um_abi`, `um_asset` | U9-L |

## Anel 6 · Ferramentas (7 crates)

| Crate | Responsabilidade | Dono do estado | Depende de | Entra em |
| :-- | :-- | :-- | :-- | :-- |
| `um_editor_core` | docking, seleção, grade de propriedades por reflexão, gizmos e desfazer por log | sessão do editor | `um_ui`, `um_reflect`, `um_scene` | U6-A |
| `um_editor_graph` | edição de grafos de material e de fluxo sobre a mesma tela | documentos de grafo | `um_editor_core`, `um_flow` | U8-B |
| `um_sequence` | Trilha Temporal: trilhas, seções, avaliação por tempo e captura determinística | trilhas | `um_scene`, `um_ecs` | U6-C |
| `um_insights` | Observatório: leitura de trace, agregação e visualização offline | sessões de trace | `um_trace`, `um_ui` | U6-B |
| `um_test` | Bancada: replay, imagem de referência, comparação perceptual, orçamento e fuzz | fixtures | `um_render`, `um_hash` | U0-F |
| `um_build` | Orquestrador de Build: matriz de alvos, permutação de shader, cozimento, staging e manifesto | artefatos de build | `um_asset`, `um_shader`, `um_pack` | U1-E |
| `um_contract` | gera os artefatos de contrato (IDs normativos, tetos, hashes) consumidos pelo CI | artefatos de contrato | `um_reflect`, `um_serialize` | U6-D |

## Produto · camada NEURO (6 crates)

Estes crates conhecem anatomia. Nenhum crate `um_*` conhece.

| Crate | Responsabilidade | Depende de | Entra em |
| :-- | :-- | :-- | :-- |
| `neuro_render` | passes específicos de tecido: umidade, difusão subsuperficial, camadas, clipagem e tampa | mínimo: `um_render`; material e pós entram por features posteriores | U0-C |
| `neuro_anatomy` | camadas anatômicas, catálogo com proveniência e conformidade com o schema já existente | `um_asset`, `um_mesh` | U1-D |
| `neuro_vascular` | grafo vascular, classes, ordens e anastomoses, espelhando o contrato atual | `neuro_anatomy` | U3-C |
| `neuro_surgical` | instrumento, plano de corte, protocolo, passo, erro e métrica de execução | `um_ability`, `um_softbody` | U7-B |
| `neuro_capture` | captura determinística de quadros, manifesto e selo de proveniência | `um_sequence`, `um_test` | U6-C |
| `neuro_sim` | binário do simulador: composição, estado de aplicação e integração com `brain-engine` | mínimo: `brain-engine`, runner e contrato; demais `neuro_*` entram por feature/corte | U0-A |

## A hipótese original da fatia vertical 0

A lista original contém **13 nomes**, não 12, e não fecha um grafo compilável
porque referencia capacidades previstas para horizontes posteriores:

`um_core` · `um_math` · `um_bytes` · `um_hash` · `um_log` · `um_platform` ·
`um_rhi` · `um_rhi_wgpu` · `um_shader` · `um_mesh` · `um_render` ·
`neuro_render` + `neuro_sim`

Ela permanece como material de projeto. O
[plano UM0](../../planning/PLAN_UNRAIL_UM0.md) agora começa por `UM0-A0`
headless e proíbe scaffolding antecipado; `UM0-ENTRY` precisa resolver todas as
inversões antes de promover janela ou GPU.

## Provas de entrada por anel

Nenhum crate é considerado existente sem estas provas. Elas herdam o modelo de
corte já usado no [ROADMAP](../../planning/ROADMAP.md) e os critérios de
[VALIDATION](../../quality/VALIDATION.md).

| Anel | Prova mínima obrigatória |
| :-- | :-- |
| 0 | teste unitário e de propriedade; nenhuma alocação no caminho quente medida por contador; `#![forbid(unsafe_code)]` salvo exceção orçada |
| 1 | round-trip de serialização; fixture de arquivo malformado rejeitado; hash de conteúdo estável entre plataformas |
| 2 | imagem de referência com envelope por backend; teto de draws/triângulos/bytes declarado; fallback exercitado |
| 3 | replay determinístico com semente; conservação ou invariante declarada; convergência sob refino de passo |
| 4 | agendamento determinístico provado com embaralhamento de ordem de execução; migração de schema testada |
| 5 | paridade medida contra o backend emprestado antes da troca; rollback por feature |
| 6 | o próprio gate roda no CI e falha por regressão real, não por nome de teste |

## Contagem e honestidade

| Métrica | Valor |
| :-- | :-- |
| capacidades candidatas no limite superior | 84 |
| fronteiras de crate confirmadas hoje | 0 |
| nomes na hipótese original da fatia 0 | 13 |
| scaffolds autorizados antes de prova | 0 |
| categorias de dependência externa previstas (`DEP-*`) | 9; nenhuma selecionada |
| itens de toolchain (`TOOL-*`) | 1; release ainda não fixada |
| locais de `unsafe` existentes no motor | 0; orçamento será definido por corte |

Um catálogo não é um cronograma. A ordem real, a duração estimada e o critério
de parada estão nos [horizontes subordinados](../../planning/backlog/UNRAIL_HORIZONS.md).
