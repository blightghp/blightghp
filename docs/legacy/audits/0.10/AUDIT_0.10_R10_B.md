# Auditoria 0.10 · R10-B · vascular topológico

**Data:** 13 de agosto de 2026

**Estado:** implementado e validado no envelope declarado

**Branch de trabalho:** `blightghp/r10-b-vascular-topology`

**Baseline científico:** produto 0.9.0 · protocolo/ABI/snapshot v8 · 37 buffers · cinco hashes

## Escopo e fronteira

R10-B introduz nomenclatura, grafo e geometria vascular de apresentação nas seis
vistas existentes. O corte não importa atlas ou asset, não cria uma sétima vista
e não modifica Rust, Wasm, Worker, ABI, `dt`, parâmetros, topologia científica,
snapshot ou hashes.

Artérias, capilares e veias são `TOPOLOGY · ILLUSTRATIVE`. Direção significa
somente relação montante/jusante e é codificada estaticamente. Não há fluxo,
perfusão, pulso, velocidade, oxigenação ou acoplamento neurovascular calculado.

| ID | Entregável | Resultado |
| :-- | :-- | :-- |
| AST-036 | separar nomenclatura/conectividade de geometria | 44 entradas `ILLUSTRATIVE`; zero `REFERENCE_GROUNDED`/`CALIBRATED` e limitações explícitas |
| VAS-002 | identidade por segmento | 42/42 resolvem classe, ordem, lado, vistas e catálogo |
| VAS-003 | grafo vascular próprio | referências simétricas, alcance até capilar/sumidouro e um ciclo de anastomose validados |
| VAS-004 | direção sem fluxo inventado | taper/chevrons/posição/rótulo estáticos; zero animação vascular |
| VAS-005 | redundância sem depender de cor | arterial circular/chevron, venoso achatado/duplo, capilar fino/pontilhado |
| VAS-006 | esqueleto vascular | contexto residual de 12%; tecla `V`, checkbox e API preservam hashes |
| VAS-007 | orçamento por vista | 12/17 draws, 6.600 triângulos e 172.780 bytes de geometria |
| VAS-008 | nenhuma entrada vascular é `STATE` | 12/12 objetos de cena são `matter` + `TOPOLOGY`; zero estado/objeto animado |
| SEC-021 | import estrito e limitado | JSON/unknown fields/128 KiB/referência quebrada/ID duplicado cobertos |
| QA-111 | prova integrada | Vitest, Rust, Chromium/SwiftShader, acessibilidade, custo e hashes aprovados |

## Catálogo e contrato do grafo

O catálogo anatômico 1.1.0 fecha com 76 entradas, seis fontes, seis
transformações e fingerprint FNV-1a `8ff191139a59e518`. As 44 entradas novas
usam `src/vascular/vascular-layer.ts#VascularTopologyModule` como fonte interna,
licença interna e transformação procedural orientativa. Zero asset externo é
distribuído.

`../../../src/vascular/vascular-topology-v1.json` possui 20.627 bytes. O parser Zod limita
importações a 128 KiB, rejeita campos desconhecidos e valida referências contra
o catálogo. O objeto embutido é congelado e seu JSON canônico produz o hash de
geometria/apresentação `46b9ddf9cd6510d4`, que não integra os cinco domínios
científicos.

| Classe | Segmentos |
| :-- | --: |
| arterial | 21 |
| capillary | 2 |
| venous | 19 |
| **Total** | **42** |

O grafo contém quatro segmentos marcados para a anastomose e dois sumidouros
jugulares de fronteira. A auditoria exige transições somente
`arterial → capillary → venous`, simetria entre relações, ordem de ramo válida,
alcance arterial/capilar/venoso e ausência de órfãos.

## Cena, materiais e ownership

`VascularTopologyModule` constrói a geometria uma única vez e monta subgrupos
nas raízes de Visão Geral, Lâminas, Célula, Neurônio e Sinapse. Ele não monta
vasos na Prancha Elétrica. Geometrias mescladas resolvem seleção por grupo e
`faceIndex`; instâncias resolvem por `instanceId`.

| Vista | Draws | Teto | Triângulos | Geometria (bytes) | Animados |
| :-- | --: | --: | --: | --: | --: |
| Visão Geral | 3 | 6 | 4.800 | 125.100 | 0 |
| Lâminas | 2 | 3 | 112 | 3.280 | 0 |
| Célula | 2 | 2 | 620 | 16.200 | 0 |
| Neurônio | 1 | 1 | 300 | 7.944 | 0 |
| Eletricidade | 0 | 0 | 0 | 0 | 0 |
| Sinapse | 4 | 5 | 768 | 20.256 | 0 |
| **Total** | **12** | **17** | **6.600** | **172.780** | **0** |

Todo renderizável vascular declara passe `matter`, proveniência `TOPOLOGY`,
binding anatômico direto, participação em clipping, exclusão de bloom e
`matrixAutoUpdate = false`. O manifesto PBR vascular incremental possui 12
objetos. Ele se soma aos 25 objetos históricos do R09-F sem alterar aquele
manifesto basal: a cena completa possui 37 elegíveis.

`dispose()` remove os grupos montados e libera exatamente uma vez as 12
geometrias e seus materiais. O modo esqueleto reutiliza
`PresentationMaterialEffects`; `afterRender()` restaura opacidade/depthWrite sem
deixar estado residual.

## Cobertura, UI e acessibilidade

Com os vasos, a auditoria percorre 110 objetos renderizáveis: 70 possuem binding
anatômico e 40 são overlays/estado explicitamente não anatômicos. Não há lacuna,
ID desconhecido ou objeto sem limitação. Busca acento-insensível comprovou
“middle”, “sagittal” e “pericyte”.

O painel expõe legenda redundante, aviso permanente de ausência de hemodinâmica,
ficha com classe/lado/ordem/montante/jusante/vistas e modo esqueleto. A auditoria
formal selecionou artéria cerebral média esquerda, seio sagital superior,
arteríola penetrante e pericito. O viewport `390×844` manteve catálogo e bloco
vascular disponíveis sem overflow horizontal.

Uma inspeção interativa adicional no navegador da aplicação confirmou que a
busca “pericito” abre a vista Sinapse, atualiza breadcrumbs/live region e mostra
a ficha topológica; a tecla `V` alterna e restaura `data-vascular-skeleton`.
Zero erro foi registrado no console.

## Invariância científica

O relógio foi congelado antes de busca, seleção, troca de vista, perfil PBR,
monocromia, modo esqueleto e capturas. Os cinco hashes permaneceram idênticos:

| Domínio | Antes | Depois |
| :-- | :-- | :-- |
| `stateHash` | `b342793f3d23c6ae` | `b342793f3d23c6ae` |
| `corticothalamicHash` | `28cb2c021f56dbf7` | `28cb2c021f56dbf7` |
| `cellPatchHash` | `cff663ed3fc20880` | `cff663ed3fc20880` |
| `chemicalHash` | `d6f6b8dd06975c24` | `d6f6b8dd06975c24` |
| `cellSpikeEventHash` | `602d9181b8d246dc` | `602d9181b8d246dc` |

ABI/snapshot permanecem v8 e nenhum comando Worker foi criado.

## Comandos e evidência

| Comando | Resultado |
| :-- | :-- |
| `npm run test` | passou; 26 arquivos, 134 testes |
| `npm run typecheck` | passou |
| `npm run build` | passou; 133 módulos; aviso conhecido do chunk Three.js |
| `npm run check` | passou; replay, Worker/Wasm, promoção 0.8 e runtime incluídos |
| `cargo test --workspace` | passou; 83 testes Rust, zero falha |
| `cargo clippy --workspace --all-targets -- -D warnings` | passou |
| `npm run audit:vascular` | passou; 42 segmentos e seis capturas |
| `npm run audit:material` | passou em diretório temporário; 37 elegíveis e 18 capturas |
| `npm run audit:anatomy` | passou em diretório temporário; 76 entradas e cinco capturas |
| `git diff --check` | passou |

Artefatos versionados em `artifacts/vascular-audit/`:

- `vascular-audit.json` schema 1;
- `01-overview-arterial.png` e `02-overview-venous.png`;
- `03-laminar-penetrating.png` e `04-synapse-nvu.png`;
- `05-skeleton-mode.png` e `06-mobile.png`.

Capturas e relatório somam 3.833.060 bytes. Chromium 150/SwiftShader prova o
fluxo funcional e a compatibilidade WebGL headless; não substitui uma baseline
de GPU física. O `npm run audit:runtime` mediu frame p95 de 3.990,50 ms em
SwiftShader sem falhar seu contrato atual. Esse custo e o aviso de chunk ficam
explicitamente encaminhados ao R10-C, que criará o governador e o gate de
orçamento versionado.

## Riscos, rollback e veredito

Riscos residuais: a forma pode parecer clínica apesar de não ser atlas; posições
e calibres não representam sujeito; a unidade neurovascular usa escala didática
exagerada; SwiftShader não mede desempenho de GPU física. As mitigações são
classe/limite permanentes, zero animação, codificação redundante e orçamento
estrutural conservador.

Rollback: remover `src/vascular`, o bloco UI e as 44 entradas do catálogo
restaura as seis vistas R10-A. Também é possível manter o contrato/catalogação e
ocultar os subgrupos vasculares. Rust/Wasm/Worker/ABI não precisam de reversão.

**Veredito:** R10-B está implementada e validada no escopo declarado. Não há
achado bloqueante; a branch está apta para commit e publicação. O próximo gate é
R10-C, que deve transformar custo gráfico e reclamações de desperdício em
contrato versionado antes de qualquer aumento de fidelidade.
