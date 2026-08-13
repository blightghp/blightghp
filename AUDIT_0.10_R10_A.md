# Auditoria 0.10 · R10-A · catálogo anatômico com proveniência

**Data:** 13 de agosto de 2026  
**Estado:** implementado e validado no envelope declarado  
**Branch de trabalho:** `blightghp/r10-a-anatomical-catalog`  
**Baseline científico:** produto 0.9.0 · protocolo/ABI/snapshot v8 · 37 buffers · cinco hashes

## Escopo e fronteira

R10-A introduz um catálogo de metadados sobre estruturas que o BRAIN PRO já
apresentava. Ele não importa atlas, malha, textura, parcelamento, medida clínica
ou novo estado científico. O corte também não modifica Rust, Wasm, protocolo,
Worker, `dt`, topologia simulada ou snapshot.

O catálogo serve para responder, de forma auditável: qual é o ID estável do
objeto, onde ele está na hierarquia, qual lado e escala declara, de onde veio,
qual licença e transformação se aplicam, qual afirmação o projeto permite e
qual limite precisa permanecer visível.

| ID | Entregável | Resultado |
| :-- | :-- | :-- |
| AST-030 | ID, hierarquia, nome, sinônimos, lado, escala e vistas | 32 entradas schema 1; raiz única; zero ciclo/lacuna |
| AST-031 | fonte, licença, versão e integridade de asset | cinco fontes internas; zero asset externo; SHA-256 obrigatório quando externo |
| AST-032 | coordenadas, unidade, escala, orientação e transformação | cinco contratos de transformação; nenhuma escala procedural promovida a calibração |
| AST-033 | evidência, afirmação e limites | 32/32 entradas com classe, claim e ao menos uma limitação |
| AST-034 | cobertura direta por objeto | 98 objetos: 58 bindings e 40 exclusões não anatômicas justificadas |
| UI-030 | busca, árvore, breadcrumbs, picking, ficha e live region | navegador validou convergência no mesmo ID e viewport móvel |
| SEC-020 | import estrito e limitado | JSON/unknown fields/256 KiB/referências/SHA-256 cobertos por teste |
| QA-110 | contrato, acessibilidade, custo, navegador e hashes | Vitest + Chromium/SwiftShader + relatório versionado aprovados |

## Contrato implementado

`src/anatomy/catalog-v1.json` tem 23.249 bytes e usa o namespace
`brain-pro:anatomy/`. A implementação TypeScript:

- valida schema fechado com Zod, inclusive enums, comprimentos e campos extras;
- limita um futuro import textual a 256 KiB antes do parse;
- exige IDs únicos, pais existentes, hierarquia acíclica e referências fechadas;
- exige SHA-256 para qualquer fonte marcada como asset externo;
- congela o catálogo embutido e calcula fingerprint FNV-1a canônico;
- busca sem depender de acentos ou caixa, limitada a 64 resultados;
- resolve breadcrumbs, profundidade, fonte e transformação por ID;
- nunca interpreta metadados como parâmetro científico.

Distribuição epistemológica:

| Evidência | Entradas |
| :-- | --: |
| PROCEDURAL | 6 |
| ILLUSTRATIVE | 6 |
| DIDACTIC | 12 |
| FENOMENOLOGICAL | 2 |
| MODEL_BOUND | 6 |
| REFERENCE_GROUNDED | 0 |
| CALIBRATED | 0 |

Fingerprint auditado do catálogo: `c7ae661e5b2570cb`. Esse valor é metadado de
apresentação; não é um sexto hash científico.

## Cobertura das cenas

`declareAnatomicalBinding()` vincula estruturas existentes ao catálogo.
`declareNonAnatomical()` exige justificativa para correntes, eventos, grades,
medidores e overlays que não representam anatomia. Não existe herança implícita
capaz de mascarar uma lacuna.

| Vista | Renderizáveis | Ligados | Não anatômicos explícitos | IDs distintos | Lacunas |
| :-- | --: | --: | --: | --: | --: |
| Visão Geral | 17 | 16 | 1 | 5 | 0 |
| Lâminas | 44 | 29 | 15 | 9 | 0 |
| Célula | 5 | 2 | 3 | 2 | 0 |
| Neurônio | 10 | 4 | 6 | 4 | 0 |
| Eletricidade | 11 | 2 | 9 | 1 | 0 |
| Sinapse | 11 | 5 | 6 | 5 | 0 |
| **Total** | **98** | **58** | **40** | — | **0** |

Picking usa raycast sobre o scene graph ativo, ignora hits não anatômicos e
entrega a mesma entrada usada pela árvore. Na vista Célula, o picking celular
continua prioritário e preserva seu contrato R09-D.

## UI, acessibilidade e segurança

O painel `R10-A · explorador local` oferece busca, árvore filtrada por vista,
breadcrumbs e ficha com ID, lado, evidência, fonte, licença, transformação e
limitação. Resultados são botões `treeitem`; setas, `Home` e `End` percorrem o
foco, e a live region anuncia a seleção. Conteúdo entra por `textContent`, não
por HTML interpretado.

O navegador confirmou:

- `talamo` → `brain-pro:anatomy/thalamus`;
- `NÓ DE RANVIER` → `brain-pro:anatomy/ranvier-node`;
- `cell body` → `brain-pro:anatomy/soma`;
- árvore/API alternando Visão Geral, Lâminas, Neurônio e Sinapse;
- busca e árvore visíveis em `390×844`, sem overflow horizontal;
- zero erro de página/console durante a auditoria formal.

## Custo e ownership

O catálogo não possui `Object3D`, geometria, material, textura, render target ou
buffer GPU. Seus bindings usam apenas `userData` já associado aos objetos. A
auditoria compara `drawCalls`, triângulos, geometrias e texturas antes/depois de
busca/seleção e exige delta zero em todos os contadores.

| Recurso próprio | Medição |
| :-- | --: |
| JSON embutido | 23.249 bytes |
| entradas/fontes/transformações | 32 / 5 / 5 |
| draws/triângulos/geometrias/texturas adicionais | 0 / 0 / 0 / 0 |
| capturas + relatório da auditoria | 2.887.490 bytes |

O controller remove seus listeners em `dispose()`. As cenas continuam
responsáveis por seus próprios recursos conforme os contratos anteriores.

## Invariância científica

O relógio foi congelado por `setCaptureMode(true)` antes de toda operação de
busca, árvore, API, troca de vista e captura. Os cinco hashes permaneceram
idênticos:

| Domínio | Antes | Depois |
| :-- | :-- | :-- |
| `stateHash` | `b342793f3d23c6ae` | `b342793f3d23c6ae` |
| `corticothalamicHash` | `28cb2c021f56dbf7` | `28cb2c021f56dbf7` |
| `cellPatchHash` | `cff663ed3fc20880` | `cff663ed3fc20880` |
| `chemicalHash` | `d6f6b8dd06975c24` | `d6f6b8dd06975c24` |
| `cellSpikeEventHash` | `602d9181b8d246dc` | `602d9181b8d246dc` |

ABI/snapshot continuam v8 e nenhum comando/protocolo novo foi criado.

## Comandos e evidência

| Comando | Resultado |
| :-- | :-- |
| `npm run typecheck` | passou |
| `npm run test -- --reporter=dot` | passou; 24 arquivos, 121 testes |
| `npm run build` | passou |
| `cargo test --workspace` | passou; 83 testes Rust, zero falha |
| `npm run audit:anatomy` | passou; 32 entradas e cinco capturas |
| `npm run audit:runtime` | passou; 95 amostras, gate gráfico/runtime preservado |
| `npm run audit:material` | passou; 18 capturas e 25 objetos PBR elegíveis |
| `git diff --check` | passou |

Artefatos:

- `artifacts/anatomy-audit/anatomy-audit.json`;
- `01-overview-left-hemisphere.png`;
- `02-laminar-thalamus.png`;
- `03-neuron-axon.png`;
- `04-synapse-receptors.png`;
- `05-mobile-catalog.png`.

SwiftShader prova o fluxo funcional e a compatibilidade WebGL headless. A
medição de custo adicional zero decorre da ausência estrutural de novos objetos
e dos contadores comparados; não substitui uma futura baseline de interação em
GPU física.

## Riscos, rollback e veredito

Risco residual: um catálogo procedural pode parecer mais autoritativo que a
evidência disponível. Mitigações: classes visíveis, limitações obrigatórias,
zero `CALIBRATED`, escala explicitamente não calibrada e ausência de atlas
externo. IDs schema 1 tornam mudanças futuras deliberadas e migráveis.

Rollback: remover o explorador e os bindings anatômicos restaura exatamente as
seis cenas procedurais anteriores; Rust/Wasm/Worker/ABI não precisam ser
revertidos. Uma importação externa rejeitada mantém o catálogo embutido.

**Veredito:** R10-A está implementada e validada no escopo declarado. O próximo
gate pode usar esses IDs para R10-B vascular topológico, mas fluxo, perfusão,
oxigenação e aparência clínica continuam proibidos sem estado/modelo próprios.
