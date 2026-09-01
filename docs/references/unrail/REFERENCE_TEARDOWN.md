# Revisão de referências · problemas reutilizáveis e soluções a reavaliar

**Estado documental:** análise de engenharia, 21 de agosto de 2026
**Regra de leitura:** ler [o léxico](../../specifications/prometheus/GLOSSARY.md) antes deste arquivo
**Natureza:** síntese conceitual, não desmontagem de um produto específico; fontes técnicas concretas permanecem atribuídas

MERIDIANO é o codinome de uma classe de motores maduros de simulação em tempo
real. Não encobre dependências nem substitui fontes. Este
documento separa três coisas que costumam ser confundidas:

1. **o problema** que cada subsistema resolve — atemporal, vale para qualquer motor;
2. **a solução** que MERIDIANO escolheu — datada, presa a C++ e à sua história;
3. **o preço** que essa solução cobra — e se queremos pagá-lo em Rust.

O Unrail Motor herda os problemas. Recusa a maior parte das soluções.

## 0 · A tese central

MERIDIANO resolveu, há vinte anos, um problema que C++ não resolvia: **como ter
metadados de tipo em tempo de execução** para alimentar serialização, editor,
replicação de rede, script e coleta de lixo a partir de uma única anotação. A
resposta foi construir um compilador auxiliar próprio, escrito em linguagem
gerenciada, que lê cabeçalhos C++ anotados por macro e gera código. Quase tudo o
que existe no motor — o objeto raiz universal, o coletor de lixo, o sistema de
propriedades, o grafo de script, o editor genérico — é consequência dessa
decisão.

Rust oferece macros procedurais integradas à compilação e operando sobre fluxos
de tokens, mas elas são **não higiênicas** e carregam considerações de segurança
semelhantes às de scripts de build. Elas podem reduzir a necessidade de um
gerador externo, mas não eliminam por si só reflexão runtime, ownership ou
infraestrutura de editor. Essas fronteiras precisam ser provadas em cortes.

Composição, ownership explícito e geração em compile time são hipóteses úteis,
não vantagens gratuitas nem justificativa suficiente para o programa.

## 1 · Núcleo e tipos

| Problema | Solução do MERIDIANO (C++/C#) | Preço | Decisão Unrail |
| :-- | :-- | :-- | :-- |
| metadados de tipo em runtime | ferramenta em C# lê cabeçalhos anotados e gera código de reflexão | segundo compilador, segundo build system, tempo de compilação alto, erro fora do compilador principal | `derive` de reflexão em macro procedural; registro montado na inicialização; erro vira erro de compilação normal (`um_reflect`) |
| ciclo de vida de objetos | objeto raiz universal + coletor mark-sweep sobre um array global | pausas de coleta, herança obrigatória, custo de despacho virtual em tudo | arenas por domínio + handles geracionais (`um_handle`); destruição determinística; sem coletor |
| identidade de string barata | string internada com comparação por índice, insensível a maiúsculas | tabela global com trava, semântica surpreendente de comparação | `Name` internado por arena, comparação por `u32`, sensível a maiúsculas (`um_container`) |
| containers previsíveis | biblioteca própria de arrays/mapas com alocador injetável | duplicação da biblioteca padrão, incompatibilidade com o ecossistema | biblioteca padrão + containers especializados só onde há medida: SoA, slotmap, ring, small vec (`um_container`) |
| alocação com orçamento | alocador global segmentado com etiquetas e rastreamento | complexidade alta, difícil de auditar | alocador global etiquetado + arena por quadro + teto por subsistema (`um_alloc`) |
| paralelismo | grafo de tarefas com threads nomeadas e pipeline de quadro | ordem não determinística por padrão | grafo de tarefas com **parallel-for determinístico** e redução por ID (`um_thread`), herdando a disciplina do [ENGINE_SPEC](../../specifications/ENGINE_SPEC.md) |

## 2 · Build, módulos e ferramentas

| Problema | Solução do MERIDIANO | Preço | Decisão Unrail |
| :-- | :-- | :-- | :-- |
| grafo de módulos, plataformas e configurações | orquestrador em C# lendo descritores por módulo | uma linguagem inteira só para compilar outra; fusão de unidades de tradução e cabeçalhos pré-compilados para esconder a lentidão do C++ | `cargo` já resolve o grafo; `um_build` cobre só o que falta: matriz de alvos, permutação de shader, cozimento de asset, staging e manifesto com hash |
| compilação de shaders em escala | processos auxiliares dedicados + cache de estado de pipeline | orquestração pesada, invalidação obscura | `um_shader` compila permutações declaradas; cache endereçado por hash em `um_ddc` |
| automação de teste e empacotamento | segunda ferramenta em C# | terceira linguagem no ciclo de vida | `um_build` é um binário Rust no padrão `xtask`; nada sai de Rust |
| cache derivado compartilhado | serviço com chave por versão de código | operação e invalidação difíceis | `um_ddc` local-first; chave = hash de conteúdo + versão de algoritmo; servidor é opcional, nunca requisito |

**Consequência prática:** o Unrail Motor elimina C# do ciclo de vida do produto.
Isso confirma — e não contraria — a decisão
[ARC-008](../../specifications/ARCHITECTURE.md) já registrada neste repositório.

## 3 · Renderização

| Problema | Solução do MERIDIANO | Preço | Decisão Unrail |
| :-- | :-- | :-- | :-- |
| múltiplas APIs gráficas | camada fina própria com listas de comando e descritores sem vínculo | superfície enorme, um backend por plataforma | `um_rhi` com **uma** fachada; backend inicial emprestado, backends próprios (Vulkan/D3D12) entram por gate medido |
| ordenar passes e alocar recursos temporários | grafo de quadro com barreiras automáticas e alocador transitório | invalidação difícil de depurar | `um_rg` com a mesma ideia, mais validação de ciclo e despejo textual do grafo por quadro |
| contagem de triângulos sem teto | clusters construídos offline em DAG com métrica de erro, culling na GPU e rasterizador por software para micro-triângulos | pipeline de build pesado, custo de memória, exige GPU moderna | `um_geo_virt` entra tarde (Anel 5). O simulador não precisa de bilhões de triângulos; precisa de **um** córtex correto |
| iluminação global dinâmica | campos de distância + cache de superfície + traçado por tela e por mundo + coleta final | custo alto, ruído temporal, difícil de auditar | `um_gi` começa por sondas de irradiância assadas e determinísticas; traçado dinâmico é corte próprio com orçamento |
| sombra de alta resolução | páginas esparsas em tabela virtual | complexidade e invalidação | `um_shadow` começa em cascatas clássicas; virtualizar só sob medição |
| ruído temporal e custo por pixel | reconstrução temporal com histórico e heurística | fantasma e artefato em movimento | `um_temporal` vale primeiro no perfil de captura, depois no interativo |
| streaming de textura | tiles virtuais com buffer de retorno | latência de página, complexidade | `um_tex_virt` fica fora de escopo até existir atlas real (depende do corte R10-H do roadmap científico) |
| efeitos e partículas | grafo de nós com simulação na GPU e interfaces de dados | uma linguagem visual inteira para manter | `um_vfx` nasce com emissores dirigidos por dados; o editor vem no Anel 6 |

## 4 · Simulação

| Problema | Solução do MERIDIANO | Preço | Decisão Unrail |
| :-- | :-- | :-- | :-- |
| corpos rígidos e contato | solver com ilhas, broadphase por varredura/BVH, colisão contínua | não determinístico entre plataformas por padrão | `um_physics` com ordem canônica e semente explícita; determinismo é requisito, não brinde |
| destruição | fratura pré-computada por Voronoi e agrupamento por conexão | assets pesados | `um_fracture` só se o produto pedir |
| tecido mole | resolvedores baseados em posição com restrições | precisão insuficiente para tecido real | `um_softbody` com **XPBD tetraédrico** e corte topológico — requisito de primeira classe do simulador, não extra |
| fluidos | partículas ou grade, majoritariamente cosméticos | pouca fidelidade | `um_fluid` com SPH de superfície e água rasa sobre a face cortada; sangue e LCR são requisito do produto |
| animação | grafo de mistura compilado, IK, retargeting | complexidade de autoria | `um_anim` entra tarde; instrumento cirúrgico precisa de cinemática, não de árvore de mistura |
| áudio | grafo de nós com submixes e espacialização | pouco relevante agora | `um_audio` no Anel 5 |
| rede | replicação de propriedades com relevância e predição | complexidade grande | `um_net` no Anel 6, e só para sessão instrutor/observador |

## 5 · Gameplay, roteiro e editor

| Problema | Solução do MERIDIANO | Preço | Decisão Unrail |
| :-- | :-- | :-- | :-- |
| lógica sem recompilar C++ | grafo visual compilado para bytecode em VM própria | desempenho fraco, difícil de versionar, diff ilegível | `um_script` primeiro (texto, tipado, versionável); `um_flow` **compila para o mesmo bytecode** e o grafo passa a ser apenas uma visão |
| composição de comportamento | ator com componentes e grupos de tick | herança profunda volta pela porta dos fundos | ECS com arquétipos e agendamento explícito (`um_ecs`); “ator” é um preset de componentes, não uma classe base |
| habilidade, efeito e atributo | sistema de tags, efeitos e predição | curva de aprendizado severa | `um_ability` mapeia direto para **passo de procedimento**, pré-condição, efeito e reversão |
| editor genérico | grade de propriedades gerada por reflexão + buffer de transações | acoplamento total com o objeto raiz | mesma ideia, fonte diferente: a grade nasce de `um_reflect`; o desfazer é log de comandos (`um_editor_core`) |
| cinemática e captura | trilhas com seções avaliadas por tempo | complexidade | `um_sequence` serve à captura determinística de GIF/vídeo, herdando o contrato de captura já existente |

## 6 · O que MERIDIANO faz e nós deliberadamente não faremos

| Recusa | Motivo |
| :-- | :-- |
| objeto raiz universal com herança profunda | composição + reflexão entregam o mesmo poder sem o custo |
| coletor de lixo | propriedade explícita é auditável e determinística |
| segunda linguagem no build | Rust cobre motor, ferramenta e teste |
| API pública gigante com compatibilidade eterna | um mantenedor não sustenta milhares de símbolos estáveis |
| suporte a consoles fechados | licenciamento e sigilo fora do alcance do programa |
| paridade de funcionalidade | a meta é um **motor de simulação realista de primeira classe**, não um motor de propósito geral |
| editor distribuído a terceiros | o editor serve ao autor; distribuição não é meta |

## 7 · O que herdamos deste repositório e MERIDIANO não tem

O BRAIN PRO já provou, em código, quatro disciplinas que motores comerciais não
oferecem e que se tornam vantagem estrutural do Unrail Motor.

| Disciplina existente | Onde já vive | Como vira requisito do motor |
| :-- | :-- | :-- |
| passo fixo, RNG endereçado, ordem canônica e replay | [`crates/brain-engine`](../../../crates/brain-engine/src/lib.rs) | `UM-004`: o laço de simulação do motor é determinístico e replayável dentro do domínio validado |
| classe epistemológica por objeto (`STATE`/`TOPOLOGY`/`DECORATION`) | [GRAPHICS_SPEC](../../specifications/GRAPHICS_SPEC.md) | `UM-010`: nenhum objeto renderizável existe sem proveniência declarada |
| orçamento gráfico versionado com gate de CI | [VALIDATION](../../quality/VALIDATION.md) | `UM-020`: todo pass, shader e asset entra com teto medido |
| geometria procedural assada com hash FNV-1a de 64 bits | [`src/render/procedural-surface.ts`](../../../src/render/procedural-surface.ts) | `UM-005`: todo artefato derivado carrega hash reproduzível; FNV-1a não é mecanismo de segurança |
| núcleo científico com uma única dependência (`libm`) | [`crates/brain-engine/Cargo.toml`](../../../crates/brain-engine/Cargo.toml) | `UM-001`: autoria própria é padrão quando reduz risco ou cria valor verificável |

Um motor comercial trata determinismo, proveniência e orçamento como recursos
opcionais de nicho. Aqui eles são a constituição. Por isso este programa não é
uma reimplementação: é um motor com outra tese sobre o que significa confiar no
que está na tela.

Fontes primárias usadas para validar as premissas Rust/Cargo/GPU:
[referências técnicas](PRIMARY_REFERENCES.md).

Próximo documento: [arquitetura do Unrail Motor](../../specifications/prometheus/ARCHITECTURE.md).
