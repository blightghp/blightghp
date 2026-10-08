# Auditoria 0.10 · R10-E · luz e materialidade

**Data:** 28 de agosto de 2026

**Commit técnico medido:** `df85e290229e05dc89483baed142863972ef92c9`

**Branch de trabalho:** `blightghp/r10-e-light-materiality`
**Resultado:** gate de evidência física fechado; etapa ainda não promovida

## Resultado

R10-E substitui a aparência ciano uniforme das quatro shells overview por
albedos quentes/neutros estritamente de apresentação e acrescenta GTAO de meia
resolução apenas para a Visão Geral realista em `cinema`. A mistura é
limitada às quatro shells R10-D aprovadas e permanece após a sincronização
dinâmica; a codificação científica dessas shells continua sendo somente opacidade.
Vasos, estado científico, geometria, Worker, ABI e hashes não mudam.

O artefato físico é
[`../../../artifacts/light-materiality/light-materiality.json`](../../../artifacts/light-materiality/light-materiality.json).
Ele foi gerado na Intel UHD via ANGLE/D3D11, não em SwiftShader.

| Contrato | Evidência | Resultado |
| :-- | :-- | :-- |
| GFX-R10E-01 | 37 materiais físicos, transmissão zero, quatro shaders de superfície assada e quatro albedos regionais | aceito |
| GFX-R10E-02 | 12 materiais vasculares preservados; zero `semanticGeometryChanges` | aceito |
| GFX-R10E-03 | AgX ativo fora do fallback; alto contraste força ACES + esquema e restaura AgX | aceito |
| GFX-R10E-04 | 16 capturas físicas: referência esquemática, matriz de seis ângulos, seis vistas e três modos acessíveis | aceito |
| GFX-R10E-05 | cinco hashes científicos invariantes; corte coronal com uma tampa shader/um plano | aceito |
| GFX-R10E-06 | GTAO 0,5× ativo em `overview` `cinema`; `baseline`, `enhanced`, corte e alto contraste removem o passe | aceito |

## Implementação e limites

`src/render/material-profile.ts` copia a cor de origem sem alocar no caminho de
`sync()` e aplica a mistura regional somente quando `r10EOverviewShellRegion()`
aprova a shell. Córtex, cerebelo e tronco ganham albedo quente/neutro; a região
vascular não recebe essa mistura. A emissão da shell acompanha a albedo de
apresentação, enquanto a atividade continua modulando apenas opacidade e
intensidade já declaradas.

O shader assado mantém a chave `r10-e-baked-surface-v1:<região>` e não adiciona
draw, passe, textura externa ou recompilação por quadro. A API de auditoria
expõe apenas o reset de câmera de corte já existente para tornar superior,
oblíqua e coronal determinísticos; não muda controles do produto.

`HalfResolutionGtaoPass` força a dimensão física do G-buffer para 0,5× mesmo
quando o `EffectComposer` redimensiona o pipeline. Ele entra entre o render-base
e a composição de bloom, para que a emissão não seja escurecida. Durante o
G-buffer, objetos de emissão ou decoração ficam invisíveis só até o fim do passe;
o estado é restaurado em `finally`. GTAO é destruído, não apenas desabilitado,
em `baseline`, `enhanced`, fora de `overview`, com clipping, alto contraste ou
fallback WebGL. Isso preserva zero alvo GTAO residente fora de `cinema` e evita a
incompatibilidade do override normal com clipping local.

Isso não cria atlas, segmentação, sulcos nomeados, validade clínica nem uma nova
topologia vascular. As capturas continuam mostrando vasos desconectados do
envelope em alguns ângulos e relevo de baixa frequência; esses limites são
registrados na [revisão visual](../../reviews/VISUAL_REVIEW_R10_E.md).

## Medição física

| Perfil overview | Amostras | p50 | p95 | draws medidos | triângulos medidos | texturas estimadas | Teto p95 |
| :-- | --: | --: | --: | --: | --: | --: | --: |
| `baseline` | 24 | 1,8 ms | 3,5 ms | 24 | 14.520 | 55.239.648 B | 33,4 ms |
| `enhanced` | 24 | 1,8 ms | 3,7 ms | 56 | 35.595 | 55.239.648 B | 20 ms |
| `cinema` | 24 | 2,6 ms | 8,7 ms | 67 | 46.179 | 64.949.216 B | 50 ms |

O custo de textura residente do perfil material é 1.392.640 bytes (ambiente
PMREM + três normais procedurais). GTAO acrescenta aproximadamente 9,3 MiB em
`cinema`, com G-buffer de 720 × 480, mas não existe em `baseline` nem `enhanced`.
A matriz
frontal amostrou pixels quentes em maioria; isso é uma sentinela de dominância de
paleta, não uma alegação de cor anatômica.

O corte coronal conservou quatro fontes de tampa, uma tampa shader, 9 draws
adicionais estimados (teto 18) e sonda de `field.waveActivity` disponível com
91 amostras. As cinco hashes científico-computacionais mantiveram os valores de
R10-D; o hash geométrico de apresentação continua `7dfdd64207190121`.

## Acessibilidade e reversão

- monocromia foi capturada com `visualAudit().colorMode === "monochrome"`;
- móvel foi capturado em 390 × 844;
- uma segunda página com `prefers-reduced-motion: reduce` iniciou rotação em `0`
  e ainda ativou o perfil realista;
- alto contraste reverteu para material esquemático e ACES, depois restaurou AgX;
- nenhum erro de página/console foi registrado na matriz física.

## Gates executados

- TypeScript sem emissão, Vitest (31 arquivos / 163 testes) e build Vite;
- `npm run audit:light-materiality` em GPU física;
- `npm run verify:light-materiality`, incluindo fonte de evidência imutável e
  rejeição de mudanças posteriores de implementação;
- `npm run audit:material`, Worker/Wasm, runtime e orçamento de apresentação
  em diretórios de evidência separados durante o corte.

## Veredito

O corte de cor-base, GTAO contido e a matriz R10-E são aceitos como evidência de
apresentação reversível. A inspeção confirma mais sombra de contato sob a massa e
nas cavidades amplas, mas não cria sulcos anatômicos nem corrige vasos flutuantes.
O GIF, o manifesto schema 3 e a referência do README foram sincronizados com o
estado versionado `df85e290`; o GIF tem 60 quadros, seis vistas e 2,449 MiB. R10-E
**não é promoção**: ainda requer a auditoria agregada e decisão final de promoção.
Não há base para merge nesta etapa.
