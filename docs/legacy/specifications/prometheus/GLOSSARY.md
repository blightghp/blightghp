# Léxico, atribuição e transparência · Unrail Motor

**Estado documental:** vigente desde 21 de agosto de 2026
**Escopo:** vocabulário preferencial e regras públicas de atribuição do programa
**Precedência:** dependências, licenças, advisories e padrões técnicos nunca são ocultados por esta convenção

Este documento fixa linguagem técnica própria sem sacrificar transparência.
Comparações devem partir de problemas e fontes públicas; nomes de pacotes,
licenças, padrões, drivers e APIs permanecem explícitos onde forem necessários
para reproduzir, auditar ou atribuir uma decisão.

## 1 · Regras de linguagem e atribuição

| ID | Regra |
| :-- | :-- |
| SIG-001 | Nomes internos não devem imitar nomes comerciais nem sugerir equivalência com produtos de terceiros. |
| SIG-002 | **MERIDIANO** pode resumir uma classe de motores somente em comparações conceituais; fontes concretas continuam atribuídas nas referências. |
| SIG-003 | Capacidades públicas preferem o termo interno da §3; manifests, lockfiles, SBOM, `LICENSES`, CVEs, pesquisas e commits de atualização usam o nome técnico real. |
| SIG-004 | Qualquer verificador de vocabulário deve usar configuração versionada e reproduzível. Arquivo local secreto ou ausente nunca pode ser requisito de CI. |
| SIG-005 | Nenhum código, asset, shader ou layout protegido é copiado. Implementação clean-room exige origem pública registrada e distinção clara entre ideia, padrão e expressão protegida. |
| SIG-006 | Disciplina terminológica não autoriza omissão de licença. Toda dependência selecionada aparece na [política de dependências](DEPENDENCY_POLICY.md) com identidade, versão e licença explícitas. |

Não há verificador de vocabulário nesta etapa. Se ele vier a existir, limitar-se-á
a nomes internos e alegações de marketing; atribuição, licença e dados de supply
chain são sempre exceções obrigatórias e públicas.

## 2 · Nomes do programa

| Nome | Significado | Uso |
| :-- | :-- | :-- |
| **Unrail Motor** | o motor de simulação em tempo real escrito em Rust, de autoria própria | nome público do programa dentro do repositório |
| **UM** | abreviação usada em prefixos de crate (`um_core`) e IDs normativos (`UM-001`) | código e contratos |
| **MERIDIANO** | codinome de uma classe abstrata de motores estudados | apenas em síntese comparativa; fontes concretas são citadas |
| **BRAIN PRO** | o produto científico já existente neste repositório | permanece com nome e contratos próprios |
| **NEURO** | a camada de produto construída sobre o Unrail Motor (`neuro_sim`, `neuro_render`) | aplicação, não motor |
| **Anel** | domínio arquitetural por distância do núcleo (Anel 0 a Anel 6) | arquitetura; sete domínios no total |
| **Corte** | unidade mínima de entrega com contrato, prova e rollback — mesma semântica do [ROADMAP](../../planning/ROADMAP.md) | planejamento |

## 3 · Vocabulário neutro obrigatório

A coluna da esquerda é a capacidade de engenharia. A coluna do meio é o **único**
termo autorizado nos documentos. A coluna da direita aponta o crate responsável
no [catálogo de capacidades](CAPABILITY_CATALOG.md).

| Capacidade | Termo interno obrigatório | Crate |
| :-- | :-- | :-- |
| tipo raiz com metadados em tempo de execução | Registro Vivo de Tipos | `um_reflect` |
| gerador de código a partir de anotações no cabeçalho | Derivação de Reflexão | `um_reflect_derive` |
| coleta de lixo do grafo de objetos | Propriedade Explícita por Handle Geracional | `um_handle` |
| abstração sobre APIs gráficas | Interface de Hardware de Renderização (IHR) | `um_rhi` |
| grafo de passes com recursos transitórios | Grafo de Quadro | `um_rg` |
| geometria virtualizada em clusters com LOD contínuo | Virtualização de Geometria | `um_geo_virt` |
| iluminação global dinâmica com cache de superfície | Iluminação Global por Cache de Superfície | `um_gi` |
| mapas de sombra esparsos paginados | Sombras Virtualizadas | `um_shadow` |
| streaming de textura por tile com feedback | Texturas Virtualizadas | `um_tex_virt` |
| reconstrução/upscaling temporal | Reconstrução Temporal | `um_temporal` |
| sistema de partículas por grafo | Grafo de Efeitos | `um_vfx` |
| solver de corpos rígidos e fratura | Solver de Corpos e Fratura | `um_physics`, `um_fracture` |
| sistema de habilidades, atributos e tags | Sistema de Procedimentos e Efeitos | `um_ability` |
| camada de widgets declarativa | Camada de Interface Retida | `um_ui` |
| linha do tempo de cenas e trilhas | Trilha Temporal | `um_sequence` |
| grafo de áudio processado por nós | Grafo de Áudio | `um_audio` |
| particionamento e streaming de mundo | Particionamento de Mundo | `um_world` |
| orquestrador de build em linguagem gerenciada | Orquestrador de Build | `um_build` |
| cache de artefatos derivados compartilhado | Cache Derivado | `um_ddc` |
| script visual compilado para bytecode | Grafo de Fluxo | `um_flow` |
| linguagem de script com VM própria | Linguagem de Roteiro | `um_script` |
| replicação de propriedades e RPC | Replicação Autoritativa | `um_net` |
| ferramenta de trace e análise offline | Observatório | `um_insights` |
| framework de testes automatizados com captura | Bancada | `um_test` |
| módulos carregados dinamicamente | Módulos Externos | `um_plugin`, `um_abi` |
| empacotamento e assinatura de conteúdo | Empacotamento | `um_pack` |

## 4 · Termos que descrevem o produto, não o motor

| Termo | Definição operacional |
| :-- | :-- |
| **Camada anatômica** | conjunto renderizável com opacidade, isolamento e entrada no catálogo anatômico existente |
| **Descascar** | reduzir opacidade ou ocultar camadas superiores preservando picking e equivalente textual |
| **Corte** (cirúrgico) | plano de clipagem com tampa fechada por stencil — não confundir com **corte** de planejamento |
| **Umidade** | lobo especular secundário parametrizado, sem afirmação fisiológica |
| **Translucidez** | aproximação de espalhamento subsuperficial, declarada como `DECORATION` |
| **Selo de proveniência** | rótulo obrigatório de classe epistemológica herdado de [GRAPHICS_SPEC](../GRAPHICS_SPEC.md) |

Quando “corte” for ambíguo no texto, escreva **corte de planejamento** ou
**corte geométrico**.

## 5 · O que o programa nunca afirma

| ID | Proibição de discurso |
| :-- | :-- |
| SIG-010 | O Unrail Motor não é descrito como equivalente, clone, port, alternativa ou substituto de qualquer produto existente. |
| SIG-011 | Nenhum documento afirma paridade de funcionalidade com MERIDIANO. A comparação serve para escolher problemas, nunca para prometer resultado. |
| SIG-012 | Nenhum artefato do simulador é descrito como dispositivo médico, treinamento clínico validado, apoio a diagnóstico ou reprodução de paciente real. |
| SIG-013 | Realismo visual continua sem valor probatório, exatamente como em [AST-001](../GRAPHICS_SPEC.md). |

Ver também: [índice do programa](README.md) ·
[arquitetura](ARCHITECTURE.md) ·
[horizontes não agendados](../../planning/backlog/UNRAIL_HORIZONS.md).
