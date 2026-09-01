# Catálogo de bibliotecas · o inventário real

**Estado documental:** reescrito em 22 de agosto de 2026
**Substitui:** a versão de 21 de agosto de 2026, que planejava 84 crates com prefixo `um_*`
**Motivo da reescrita:** o programa já existe e tem código. O catálogo anterior descrevia um motor imaginário e violava a convenção de nomes vigente. Ver [reconciliação](RECONCILIACAO.md).
**Pré-requisitos de leitura:** [léxico](UNRAIL_GLOSSARY.md) e [arquitetura](UNRAIL_ARCHITECTURE.md)

Este documento não planeja bibliotecas. Ele inventaria as que existem, nomeia as
que faltam para o simulador anatômico e separa uma coisa da outra com clareza.

## 1 · A arquitetura em duas camadas de autoria

A convenção vigente (`NOME-001`) separa dois tipos de biblioteca, e a separação
é estrutural, não estética:

| Tipo | Nome | Sabe o que é uma entidade do motor? | Publicável sozinha? |
| :-- | :-- | :-- | :-- |
| **frente** | nome próprio feminino minúsculo (`agnesi`, `susanna`) | não | sim — serve a qualquer motor, ferramenta ou pesquisador |
| **crate do motor** | prefixo `unrail_` | sim | não — é cola de integração |
| **produto** | prefixo do domínio (`neuro_`) | sim, e também sabe o que é um córtex | não |

Uma frente que conhece o `unrail_ecs` só serve ao motor. Uma que recebe malhas e
devolve um DAG serve a todo mundo — e é revisada por todo mundo.

## 2 · O motor · 54 crates em cinco camadas

Inventário verificado no workspace do motor em 22 de agosto de 2026.

| Camada | Papel | Crates |
| :-- | :-- | :-- |
| **L0** núcleo sem dependências | erro, matemática, memória, derivação | `unrail_error`, `unrail_math`, `unrail_alloc`, `unrail_reflect_derive` |
| **L1** substrato de dados e concorrência | entidades, tarefas, reflexão, entrada, câmera | `unrail_ecs`, `unrail_jobs`, `unrail_reflect`, `unrail_input`, `unrail_camera` |
| **L2** simulação e recursos | GPU, física, ativos, áudio, animação, rede, colisão, serialização, navegação, síntese, texturas | `unrail_wgpu`, `unrail_physics`, `unrail_assets`, `unrail_textures`, `unrail_audio`, `unrail_animation`, `unrail_network`, `unrail_collision`, `unrail_serialization`, `unrail_nav`, `unrail_synth` |
| **L3** sistemas de apresentação e mundo | iluminação, sombras, pós, VFX, terreno, água, céu, UI, partição | `unrail_lighting`, `unrail_gi`, `unrail_shadows_csm`, `unrail_ssao`, `unrail_ssr`, `unrail_bloom`, `unrail_bloom_blur`, `unrail_godrays`, `unrail_motion_blur`, `unrail_postprocess`, `unrail_atmosphere`, `unrail_sky`, `unrail_ocean`, `unrail_water`, `unrail_terrain`, `unrail_foliage`, `unrail_foliage_editor`, `unrail_decals`, `unrail_visibility`, `unrail_world_partition`, `unrail_vfx`, `unrail_vfx_compiler`, `unrail_vfx_vector`, `unrail_ui`, `unrail_ui_layout`, `unrail_anim_blend`, `unrail_anim_graph`, `unrail_ragdoll`, `unrail_audio_occlusion`, `unrail_audio_reverb`, `unrail_bridge` |
| **L4** fachada e ferramentas | fachada pública versionada, bancada, forno privado | `unrail_core`, `unrail_testkit`, `unrail_bakery` (privada) |

Aplicações: `unrail_runtime`, `unrail_editor`, `unrail_gameplay`. Ferramenta de
orquestração: `tools/xtask`.

**Regra que atravessa tudo:** `unrail_core` é a única fachada pública
versionada; um consumidor externo importa `unrail_core` e nada mais.

## 3 · As frentes do laboratório

| Frente | Sigla | O que resolve | Estado |
| :-- | :-- | :-- | :-- |
| `agnesi` | CLU | DAG de clusters, LOD contínuo, simplificação por quádricas | protótipo: passos 1–2 prontos |
| `susanna` | RG | grafo de renderização com handle afim e alocação transitória | rascunho, bloqueado em marcos |
| `elisa` | WEC | fronteira host↔WASM por coluna | adiada |
| `amelia` | STR | contêiner mapeável e descompressão em GPU | falta especificação |
| `sonja` | GI | iluminação global de dois níveis | falta bloco |
| `emmy` | — | cinemática em grupos de Lie, skinning poliafim | frente nova |
| `maryam` | — | solucionador Monte Carlo de EDP sem malha | rascunho pronto |
| a nomear | PSO | chave, cache e pré-compilação de pipeline | — |
| a nomear | VSM | sombras virtualizadas por tabela de páginas | — |
| a nomear | — | arnês de verificação de alocação e bancada | infraestrutura |

## 4 · O que o simulador anatômico precisa e já existe

Mapa da proposta gráfica (janela → geometria → sombreamento → corte → fluidos)
contra o inventário real.

| Necessidade | Já existe | Observação |
| :-- | :-- | :-- |
| janela, dispositivo, superfície, laço | `unrail_wgpu`, `unrail_runtime` | `draw_indirect` é exigência de contrato, não opção |
| matemática e câmera orbital | `unrail_math`, `unrail_camera` | ver a restrição de fachada em [reconciliação](RECONCILIACAO.md) |
| malha, atributos assados, LOD | `unrail_assets`, `unrail_visibility`, `agnesi` | o LOD contínuo vem da frente, não do motor |
| material e iluminação | `unrail_lighting`, `unrail_gi`, `unrail_shadows_csm` | luz de área cirúrgica precisa ser verificada, não presumida |
| pós-processamento e reflexo | `unrail_postprocess`, `unrail_ssr`, `unrail_ssao`, `unrail_bloom` | reflexo do sangue sob o foco: `unrail_ssr` cobre o caminho |
| névoa e atmosfera | `unrail_atmosphere`, `unrail_godrays` | névoa cirúrgica é caso de uso, não recurso novo |
| interface e layout | `unrail_ui`, `unrail_ui_layout` | os controles de opacidade por camada cabem aqui |
| física rígida e colisão | `unrail_physics`, `unrail_collision` | instrumento contra crânio |
| partição e streaming | `unrail_world_partition` | uma cabeça não é mundo aberto; provavelmente ocioso |

## 5 · O que o simulador precisa e **não** existe

Esta é a lista honesta. Nenhum destes itens está no inventário de 54 crates nem
nas frentes atuais.

| Falta | Onde entraria | Por que é difícil |
| :-- | :-- | :-- |
| **tecido mole deformável** (XPBD/FEM tetraédrico) | frente nova + crate L2 | é o coração de um simulador cirúrgico e não tem nada equivalente hoje |
| **corte topológico** (remalhamento sob a lâmina) | mesma frente | mudar a topologia com o solver rodando é o problema mais duro da lista |
| **fluido de superfície** (sangue, líquido sobre a face cortada) | frente nova + `unrail_vfx` | conservação e aparência têm requisitos diferentes |
| **difusão subsuperficial** de tecido | `unrail_lighting` + `unrail_postprocess` | exige máscara de material e passe próprio |
| **transparência por camadas** (descascar) | `unrail_postprocess` | ordenação independente precisa de alvos extras |
| **planos de corte com tampa** por stencil | `unrail_wgpu` + `unrail_postprocess` | interage com `draw_indirect`; medir com e sem |
| **renderização volumétrica direta** | frente nova | necessária se algum dia entrar volume sintético |
| **laço háptico** de alta frequência | crate L2 nova | 1 kHz desacoplado do quadro |
| **tecido fino** (campos cirúrgicos) | depende do tecido mole | — |

Regra de nomeação a respeitar: cada item acima que for genérico nasce como
**frente** com nome próprio; só a cola entra como `unrail_*`.

## 6 · A camada de produto

| Crate | Responsabilidade | Depende de |
| :-- | :-- | :-- |
| `neuro_anatomy` | camadas anatômicas, catálogo com proveniência, conformidade com o schema existente | `unrail_assets` |
| `neuro_vascular` | grafo vascular, classes, ordens, anastomoses | `neuro_anatomy` |
| `neuro_render` | passes de tecido: umidade, difusão, camadas, corte e tampa | `unrail_wgpu`, `unrail_lighting`, `unrail_postprocess` |
| `neuro_surgical` | instrumento, plano de corte, protocolo, passo e métrica | tecido mole (a criar) |
| `neuro_capture` | captura determinística, manifesto e selo de proveniência | `unrail_testkit` |
| `neuro_sim` | binário: composição, estado de aplicação e ligação com `brain-engine` | todos acima |

`brain-engine` continua sendo a única fonte científica, consumida e nunca
modificada. Essa fronteira não muda.

## 7 · Contagem honesta

| Métrica | Valor |
| :-- | --: |
| crates do motor existentes | 54 |
| aplicações existentes | 3 |
| frentes nomeadas | 7 |
| frentes por nomear | 3 |
| frentes com protótipo iniciado | 1 |
| capacidades ausentes para o simulador | 9 |
| crates de produto `neuro_*` existentes | 0 |

A ordem de ataque, o esforço e o critério de parada estão no
[roadmap](UNRAIL_ROADMAP.md), que também precisa de uma passagem de
reconciliação — ver [RECONCILIACAO.md](RECONCILIACAO.md).
