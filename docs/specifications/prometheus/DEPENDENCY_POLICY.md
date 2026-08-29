# Política de dependências e supply chain · Unrail Motor

**Estado documental:** adotada; registro ainda sem pacote selecionado, 21 de agosto de 2026
**Regra-mãe:** UM-001 — autoria própria exige valor; segurança, licença e manutenção prevalecem sobre orgulho de reimplementação
**Pré-requisito de leitura:** [arquitetura](ARCHITECTURE.md)

O objetivo do programa é um motor **de autoria própria**. O caminho para chegar
lá não é começar do zero absoluto e nunca renderizar nada: é começar com poucos
empréstimos declarados, isolá-los por fachada quando cruzarem uma API pública ou
uma fronteira substituível, e devolvê-los em cortes medidos.

Este documento existe para que ninguém — inclusive o autor daqui a dois anos —
confunda “usamos por enquanto” com “é nosso”.

## 1 · Política

| ID | Regra |
| :-- | :-- |
| DEPP-001 | Tipo externo não atravessa API pública de `um_*` sem decisão explícita. Fronteiras substituíveis usam fachada; dependências internas de dev/build não ganham wrapper artificial. `UM0-ENTRY` escolhe checker de API (rustdoc JSON/lint equivalente + fixture), pois um teste Rust comum não detecta esse vazamento. |
| DEPP-002 | Toda dependência tem ID `DEP-xxx`, pacote exato, versão/lock, SPDX, escopo (`runtime`, `build` ou `dev`), owner, features mínimas, advisory policy e uma frase dizendo **o que aconteceria se ela desaparecesse amanhã**. |
| DEPP-003 | Toda dependência selecionada tem gate de aposentadoria nomeado no [roadmap canônico](../../planning/ROADMAP.md), ou é declarada **permanente** com justificativa. |
| DEPP-004 | Vendorização não ocorre por conveniência. `cargo vendor` controlado é permitido para build offline/reproduzível quando preservar origem, licença, SBOM, hash e atualização rastreável. |
| DEPP-005 | Substituir um empréstimo exige paridade medida — funcional, visual e de custo — antes de remover o caminho antigo. Rollback por feature permanece por um ciclo. |
| DEPP-006 | Dependência nova exige revisão explícita no corte que precisa dela, com ameaça, alternativas, features mínimas e rollback; adição “de passagem” é proibida. |
| DEPP-007 | A auditoria da escada roda a cada ciclo: dependências, versões, licenças e prazos vencidos viram achados. |
| DEPP-008 | O workspace mantém `Cargo.lock`, SBOM/atribuições e gates equivalentes a `cargo audit` e `cargo deny`; advisory aceito exige owner, prazo e mitigação. |
| DEPP-009 | Nomes de pacotes, APIs, drivers, padrões e licenças são explícitos em manifests, auditorias e referências; vocabulário interno nunca reduz transparência. |

## 2 · Registro de categorias candidatas

Nenhuma linha abaixo representa dependência ativa. Identidade, versão e licença
ficam bloqueantes — e não são inventadas — até a pesquisa reproduzível de
`UM0-ENTRY`.

| ID | Capacidade | Fachada | Pacote/versão | SPDX | Escopo | Estado / revisão |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| DEP-001 | API gráfica portátil | `um_rhi` | não selecionado | pendente | runtime | candidato; validar lifetime de janela/surface e backend headless em `UM0-ENTRY` |
| DEP-002 | janela e entrada multiplataforma | `um_platform` | não selecionado | pendente | runtime | candidato; só entra depois do runner headless |
| DEP-003 | compilação/reflexão de shader | `um_shader` | não selecionado | pendente | build/runtime | candidato; linguagem e alvo serão decididos com o backend |
| DEP-004 | leitura de glTF | `um_mesh` | não selecionado | pendente | build | horizonte posterior |
| DEP-005 | leitura de OBJ | `um_mesh` | não selecionado | pendente | build/dev | reavaliar se um parser mínimo próprio agrega valor |
| DEP-006 | codecs de imagem | `um_image` | não selecionado | pendente | build/runtime | implementação auditada é padrão; exige fuzzing |
| DEP-007 | UI provisória | `um_ui` | não selecionado | pendente | runtime | candidato; acessibilidade integra o gate de seleção |
| DEP-008 | conversão POD/bytes | `um_bytes` | não selecionado | pendente | runtime | candidato; layout e Miri são bloqueantes |
| DEP-009 | interoperação de handle de janela | `um_platform` | não selecionado | pendente | runtime | provável infraestrutura permanente; justificar após DEP-001/002 |

### Toolchain

| ID | Capacidade | Identidade | Política |
| :-- | :-- | :-- | :-- |
| TOOL-001 | macros procedurais | `proc_macro` da toolchain Rust | não é dependência Cargo; release/licenças da toolchain entram no SBOM. `syn`/`quote` recebem novos IDs `DEP-*` se forem selecionados |

## 3 · Áreas com presunção de autoria

Estas áreas podem justificar autoria própria por definirem contratos do motor.
A presunção cai quando uma reimplementação elevar risco de segurança,
correção, acessibilidade ou manutenção sem benefício mensurável.

| Área | Crate | Motivo |
| :-- | :-- | :-- |
| álgebra linear e geometria analítica | `um_math` | é a base de todo determinismo; delegar aqui é delegar a identidade numérica do motor |
| fingerprint de regressão e identidade de conteúdo | `um_hash` | o formato é contrato do programa; digest/assinatura de segurança usa implementação auditada |
| grafo de quadro | `um_rg` | é a espinha do orçamento gráfico |
| renderer de alto nível | `um_render` | é o produto |
| física, tecido mole e fluido | `um_physics`, `um_softbody`, `um_fluid` | é a tese do simulador |
| ECS, cena e mundo | `um_ecs`, `um_scene`, `um_world` | define a semântica de composição |
| reflexão, roteiro e grafo de fluxo | `um_reflect`, `um_script`, `um_flow` | define a autoria de conteúdo |
| serialização e formato de pacote | `um_serialize`, `um_pack` | o formato pode ser próprio; criptografia, assinatura e compressão não são reinventadas sem threat model e fuzzing |
| editor | `um_editor_*` | é a ferramenta do autor |

Em particular, `um_math` pode começar próprio quando o primeiro corte provar
que isso é necessário para o contrato numérico. Até lá, nenhuma biblioteca é
escolhida e nenhum pacote vazio é criado. Codecs, shaping Unicode, compressão,
criptografia e assinaturas seguem a regra oposta: implementação madura e
auditada é o padrão.

## 4 · Anatomia de uma fachada

Toda fachada segue a mesma forma, e a forma é auditável:

```text
um_rhi/
├── src/lib.rs           API pública: zero tipos externos
├── src/device.rs        Device, Queue, Surface — traits próprios
├── src/resource.rs      Buffer, Texture, Sampler — handles próprios
├── src/pipeline.rs      descrição declarativa, hash de PSO próprio
├── src/backend.rs       trait Backend + seleção por feature
└── policy/api-surface.toml  denylist consumida pelo checker escolhido em UM0-ENTRY
```

Regras:

1. a fachada define **o vocabulário que queremos**, não o do empréstimo;
2. a fachada é escrita antes do backend, e o backend se adapta a ela;
3. se a fachada estiver difícil de escrever sem espelhar o empréstimo, o corte
   está mal desenhado e deve parar;
4. a fachada carrega o teste de conformidade que o backend próprio precisará
   passar mais tarde — o teste nasce junto, não depois.

## 5 · Critério de aposentadoria

Um empréstimo só é devolvido quando **todas** as condições valem:

| # | Condição |
| :-- | :-- |
| 1 | o backend próprio passa a mesma suíte de conformidade da fachada |
| 2 | a imagem de referência bate dentro do envelope declarado por backend |
| 3 | o custo medido (quadro p50/p95, memória, tempo de inicialização) não regride além da tolerância versionada |
| 4 | existe fallback por feature para o caminho emprestado durante um ciclo inteiro |
| 5 | a auditoria do corte registra ambiente, comandos e números reais |
| 6 | o `DEP-xxx` correspondente é marcado como devolvido, com data e commit |

Aposentadoria sem os seis itens é troca de risco por orgulho, e não é aceita.

## 6 · Riscos específicos da escada

| ID | Risco | Indicador | Mitigação |
| :-- | :-- | :-- | :-- |
| DRSK-01 | empréstimo vira permanente por inércia | prazo vencido sem corte aberto | auditoria por ciclo; prazo vencido é achado bloqueante |
| DRSK-02 | churn de API quebra o motor a cada atualização | build quebrando por atualização menor | versão fixada; atualização é corte próprio com teste de conformidade |
| DRSK-03 | tipo emprestado vaza para a API pública | teste `no_leak` falhando | gate obrigatório em todo crate com empréstimo |
| DRSK-04 | fachada modelada como espelho do empréstimo | API própria só renomeia conceitos externos | revisão de desenho antes do backend; a fachada nasce do problema, não da biblioteca |
| DRSK-05 | licença incompatível descoberta tarde | ausência de linha na tabela §2 | licença é campo obrigatório na entrada, não na revisão |
| DRSK-06 | reimplementação prematura consome o programa | anéis 0–4 parados enquanto se escreve backend | anel 5 é o **último**; devolver empréstimo nunca precede ter produto |

## 7 · Sequência recomendada de devolução

```mermaid
flowchart LR
    D008["DEP-008 bytes"] --> D005["DEP-005 OBJ"]
    D005 --> D004["DEP-004 glTF"]
    D004 --> D007["DEP-007 UI provisória"]
    D007 --> D006["DEP-006 imagem"]
    D006 --> D003["DEP-003 sombreador"]
    D003 --> D002["DEP-002 janela"]
    D002 --> D001["DEP-001 camada gráfica"]
```

A ordem é do mais barato e menos arriscado para o mais caro. A camada gráfica é
a última porque é a única cuja substituição malfeita destrói o produto.

Ver também: [catálogo de capacidades](CAPABILITY_CATALOG.md) ·
[horizontes não agendados](../../planning/backlog/UNRAIL_HORIZONS.md).
