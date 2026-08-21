# Plano candidato UM0 · primeira fatia nativa do Unrail Motor

**Estado documental:** candidato; bloqueado até `UM0-ENTRY`, 21 de agosto de 2026
**Cortes cobertos:** `UM0-A0` a `UM0-F`, subordinados ao [roadmap canônico](ROADMAP.md)
**Entrega final candidata:** runner científico headless provado antes de janela, GPU e superfície encefálica
**Pré-requisitos de leitura:** [arquitetura](../specifications/unrail/ARCHITECTURE.md) e [política de dependências](../specifications/unrail/DEPENDENCY_POLICY.md)

Este documento preserva a intenção da proposta, mas não autoriza implementação.
O gate `UM0-ENTRY` precisa escolher runner versus Tauri, fixar toolchain,
resolver dependências cronológicas, registrar licenças e reduzir a fatia ao
menor grafo compilável. A sequência corrigida começa headless: ciência e hashes
antes de janela, geometria ou backend gráfico.

## 1 · Mapa da proposta para os cortes

| Passo proposto | Posição | Por que não cabe antes |
| :-- | :-- | :-- |
| 0 · contrato científico nativo | `UM0-A0` | primeira prova; não usa janela, GPU, `unsafe` ou dependência gráfica |
| 1 · fundações (janela + dispositivo) | `UM0-A1` | depende da promoção de A0 e da seleção auditada de DEP-001/002/009 |
| 2 · geometria e câmera | `UM0-B` | precisa de buffers e layout de vértice |
| 3 · sombreamento fisicamente baseado | `UM0-C` base; horizonte candidato `U2-B` completo | luz de área, IBL e sondas exigem capacidades posteriores |
| 3.2 · aspecto úmido | horizonte candidato `U3-A` | precisa de mapa de umidade derivado de curvatura assada |
| 3.3 · difusão subsuperficial | horizonte candidato `U3-B` | precisa de pós-processo e máscara de material |
| 4 · clipagem e tampa | horizonte candidato `U4-A` | precisa de stencil no grafo de quadro |
| 4.2 · transparência por camadas | horizonte candidato `U4-B` | precisa de alvos múltiplos e ordenação |
| 5 · reflexo de espaço de tela | horizonte candidato `U4-C` | precisa de buffer de profundidade hierárquico |
| 5.2 · sangue e LCR | horizonte candidato `U4-D` | precisa de `um_fluid` e da face cortada do horizonte U4-A |

## 2 · Capacidades candidatas, não scaffolds

A proposta original lista 13 nomes. Eles não formam hoje um DAG compilável e
não serão criados antecipadamente. `UM0-A0` autoriza no máximo um pacote binário
`neuro_sim` sobre `brain-engine`; extrações `um_*` entram uma a uma quando o gate
seguinte provar sua fronteira.

| Crate | O que entrega na fatia 0 | O que **não** entrega |
| :-- | :-- | :-- |
| `um_core` | erro, resultado, IDs, tempo, versão de contrato | qualquer coisa gráfica |
| `um_math` | `Vec2/3/4`, `Mat3/4`, `Quat`, `Transform`, `Plane`, `Aabb`, `Frustum`, projeção reversa infinita | curvas, ruído e SIMD |
| `um_bytes` | `Pod` derivado com verificação de tamanho e alinhamento | serialização |
| `um_hash` | FNV-1a de 64 bits sobre geometria e descrições de pipeline | cache derivado |
| `um_log` | categorias e sinks | trace com linha do tempo |
| `um_platform` | janela, redimensionamento, DPI, teclado, mouse e roda | gamepad, arquivo, clipboard |
| `um_rhi` | dispositivo, fila, superfície, buffer, textura, pipeline, bind group, passe | descritores sem vínculo, compute, multi-fila |
| `um_rhi_wgpu` | backend emprestado (`DEP-001`) | qualquer backend próprio |
| `um_shader` | módulo WGSL com permutação por constante e hash | IR própria, reflexão completa |
| `um_mesh` | vértice canônico, índice, tangente, limites e fixture geométrica canônica | OBJ/glTF, LOD, meshlet |
| `um_render` | câmera, lista de desenho, submissão, prepass de profundidade | culling hierárquico, instanciamento em massa |
| `neuro_render` | camada anatômica, visibilidade, opacidade e material de tecido | corte, descascar, fluido |
| `neuro_sim` | binário, laço, entrada, ligação com `brain-engine` | interface completa |

## 3 · UM0-A0 · runner científico headless

| Campo | Conteúdo |
| :-- | :-- |
| problema | o host nativo atual publica apenas o schema e não executa a simulação |
| valor | provar integração direta com `brain-engine` antes de assumir risco de GPU |
| escopo | workspace `engine/`, um runner, fixture versionada de `SimulationConfig`, entradas, seed, passos e cinco hashes |
| fora de escopo | janela, RHI, geometria, shader, `unsafe` e dependência externa nova |
| prova | artefato canônico normalizado, com schema, preset, seed, passos, target/toolchain e os cinco hashes iguais à fixture; formato é escolhido em `UM0-ENTRY` |
| segurança | `#![forbid(unsafe_code)]`, zero rede e zero parser não limitado; se JSON exigir pacote novo, ele entra no registro/lock/SPDX antes do código |
| desempenho | tempo de build, inicialização, simulação e RSS medidos; sem orçamento gráfico |
| rollback | remover o workspace, workflow e `exclude` adicionados pelo mesmo corte |

O gate não fecha C-09 sozinho. Ele cria a prova mínima; C-09 só fecha em
`UM0-F`, quando o runner integrado, a bancada e a decisão de host estiverem
promovidos.

## 4 · UM0-A1 · ciclo de vida, dispositivo e superfície

### Contrato

| Campo | Conteúdo |
| :-- | :-- |
| problema | não existe nenhum alvo nativo; toda apresentação depende do navegador |
| valor | primeiro spike gráfico nativo após a prova científica; C-09 permanece aberto até UM0-F |
| escopo | janela, dispositivo, fila, superfície, profundidade, laço e desligamento limpo |
| fora de escopo | qualquer geometria, material, UI ou física |
| prova | a janela abre, redimensiona, minimiza, restaura e fecha; contadores de recursos voltam a zero; três execuções produzem o mesmo trace normalizado |
| rollback | remover `engine/`; nada no repositório atual depende dele |

### Decisões técnicas fixadas neste corte

As linhas abaixo são hipóteses a confirmar no spike. Backend, pacote, versão,
features, SPDX, adaptador, driver e lifetime `Window > Surface > Device` entram
no artefato; nenhuma API “latest” é escolhida por este documento.

| Decisão | Escolha | Motivo |
| :-- | :-- | :-- |
| profundidade | `Depth32Float` com **Z reverso** (`near` no 1.0, comparação `Greater`) | distribuição de precisão de ponto flutuante muito melhor a longa distância; evita cintilação em geometria fina como vasos |
| projeção | perspectiva reversa com plano distante infinito | elimina o ajuste manual de `far` e melhora estabilidade de profundidade |
| espaço de cor | alvo da superfície em sRGB, cadeia interna linear em `Rgba16Float` | mapeamento tonal e difusão subsuperficial exigem linearidade |
| apresentação | fila `Fifo` por padrão, `Mailbox` opcional | previsibilidade de tempo é requisito de medição |
| redimensionamento | reconfiguração explícita da superfície e recriação da textura de profundidade | evita o comportamento indefinido de superfície desatualizada |
| DPI | fator de escala tratado como estado da janela, nunca embutido no layout | acessibilidade herdada de UM-014 |
| suspensão | dispositivo sobrevive; superfície é recriada | comportamento correto em janela minimizada no Windows |

O laço tem duas cadências separadas desde o primeiro dia, porque essa separação
é a mesma disciplina já provada no relógio de passo fixo do BRAIN PRO:

```text
laço de apresentação    → variável, dirigido pelo tempo de parede
laço de simulação       → passo fixo, dirigido por contagem de passos
interpolação            → apenas na apresentação, nunca de volta ao estado
```

## 5 · UM0-B · geometria, vértice e câmera

### Vértice canônico

O layout é fixado agora porque tudo depois depende dele. Ele já reserva o que a
umidade e a difusão subsuperficial exigirão.

| Atributo | Formato | Offset | Uso |
| :-- | --: | --: | :-- |
| `position` | `f32x3` | 0 | posição no espaço do objeto |
| `normal` | `f32x3` | 12 | sombreamento |
| `tangent` | `f32x4` | 24 | mapa de normal; `w` guarda a orientação da bitangente |
| `uv0` | `f32x2` | 40 | textura de material |
| `baked` | `f32x4` | 48 | oclusão, curvatura, espessura e umidade assadas |

Total: **64 bytes por vértice**, alinhado a 16. O campo `baked` é a ponte direta
com o que a pilha web já produz em
[`src/render/procedural-surface.ts`](../../src/render/procedural-surface.ts):
oclusão, curvatura e espessura já são atributos assados e cobertos por hash no
corte R10-D. O motor nativo consome o mesmo conceito. Igualdade exige fixture
quantizada, ordem e endianness, serialização canônica e versão de algoritmo; não
se infere “mesmo hash” apenas porque os atributos têm os mesmos nomes.

Índices são `u32`. Malhas declaram `Aabb` e hash FNV-1a de 64 bits sobre
posições, índices e versão do algoritmo, exatamente como AST-035 já exige.

### Câmera orbital

| Parâmetro | Semântica |
| :-- | :-- |
| `target` | ponto de interesse anatômico, deslocável |
| `distance` | raio, com limites mínimo e máximo por escala |
| `yaw`, `pitch` | ângulos, com `pitch` travado antes do polo para evitar inversão |
| `fov_y` | campo vertical, fixo em 40° por padrão para reduzir distorção clínica |
| `exposure` | exposição fotográfica, separada do material |

Regras: a câmera nunca escolhe qualidade, LOD ou equação — herdado direto de
[GFX-001](../specifications/GRAPHICS_SPEC.md). Rotação usa quatérnios; nenhum
ângulo de Euler é acumulado entre quadros.

## 6 · UM0-C · sombreamento de tecido, versão mínima

### Modelo

Especular por microfacetas, com as três funções escritas à mão em WGSL e
testadas contra tabelas de referência em CPU:

| Termo | Escolha | Motivo |
| :-- | :-- | :-- |
| distribuição `D` | GGX/Trowbridge-Reitz com `α = rugosidade²` | padrão da literatura, cauda longa correta para tecido úmido |
| visibilidade `V` | Smith com correlação de altura | conserva energia melhor que a forma separável |
| Fresnel `F` | aproximação de Schlick com `F0` versionado | o valor e o domínio precisam de fonte primária e tabela CPU antes da implementação |
| difuso | Lambert com fator de energia | difuso complexo não é perceptível sob luz cirúrgica; economia vai para a difusão subsuperficial |

### Luz cirúrgica

O foco cirúrgico não é uma luz pontual e tratar como tal é a origem do aspecto
de plástico. A fatia 0 já implementa **luz de área por ponto representativo**:

| Propriedade | Valor |
| :-- | :-- |
| forma | disco, com raio e distância configuráveis |
| intensidade | em lux, com exposição fotográfica separada |
| temperatura de cor | em kelvin; a conversão começa local ao corte e só vira `um_color` quando a fronteira for provada |
| penumbra | derivada do raio, não de um parâmetro arbitrário |
| brilho coaxial | segunda fonte pequena alinhada com a câmera, responsável pelo reflexo úmido característico |

### Fragmento com clipagem (preparo do passo 4)

A camada gráfica emprestada não expõe planos de recorte de hardware. A solução é
descartar fragmentos, e ela já entra aqui — desligada — para que o passo 4 não
mude o sombreador inteiro depois:

```wgsl
struct ClipState {
    planes: array<vec4<f32>, 4>,
    count: u32,
    _pad: vec3<u32>,
};

fn clipped(world_pos: vec3<f32>, clip: ClipState) -> bool {
    for (var i: u32 = 0u; i < clip.count; i = i + 1u) {
        let p = clip.planes[i];
        if (dot(p.xyz, world_pos) + p.w < 0.0) {
            return true;
        }
    }
    return false;
}
```

Custo declarado: `discard` desabilita o descarte precoce de profundidade em
várias GPUs. Por isso `U4-A` mede o passe com e sem clipagem ativa e o
orçamento registra os dois números, em vez de assumir que é grátis.

## 7 · UM0-D a UM0-F · fundação dura, interface provisória e bancada

| Corte | Entrega | Prova |
| :-- | :-- | :-- |
| `UM0-D` | arena por quadro, alocador etiquetado, `Name` internado e decisão auditada sobre `DEP-008` | contador de alocações no quadro igual a zero após aquecimento |
| `UM0-E` | interface provisória atrás de fachada, gizmos e sonda de estado | teclado, foco, equivalente textual, contraste e movimento reduzido |
| `UM0-F` | bancada: imagem de referência, orçamento, replay e decisão final de host | CI falha por regressão real; C-09 só fecha aqui com runner integrado |

`UM0-F` é o corte que impede o programa de virar demonstração. Sem bancada, todo
corte seguinte vira opinião.

## 8 · A API que pode sair da fatia

A proposta original descreve a estrutura assim:

```rust
pub struct BrainLayer {
    pub mesh: wgpu::Buffer,
    pub texture: wgpu::TextureView,
    pub opacity: f32,
    pub is_visible: bool,
}
```

O contrato do motor exige três correções, e cada uma tem um motivo executável:

| Correção | Motivo |
| :-- | :-- |
| nenhum tipo emprestado na API pública | DEPP-001: `wgpu::Buffer` na assinatura amarra o produto ao backend e impede a devolução de `DEP-001` |
| malha e material são **handles**, não recursos | recarga a quente, streaming e orçamento exigem indireção; handle geracional detecta uso após liberação |
| opacidade e visibilidade são **estado de apresentação**, não do asset | duas vistas da mesma camada precisam de opacidades diferentes sem duplicar o recurso |

Forma proposta:

```rust
// engine/products/neuro/crates/neuro_render/src/layer.rs
use um_core::Name;
use um_render::{MaterialHandle, MeshHandle, Provenance};

/// Uma camada anatômica renderizável.
/// `provenance` é obrigatória: herda GFX-002 do contrato gráfico existente.
pub struct AnatomicalLayer {
    pub id: Name,
    pub mesh: MeshHandle,
    pub material: MaterialHandle,
    pub provenance: Provenance,
    pub catalog_entry: Option<Name>,
}

/// Estado de apresentação por vista. Não pertence ao asset.
#[derive(Clone, Copy)]
pub struct LayerView {
    pub opacity: f32,
    pub visible: bool,
    pub isolated: bool,
}
```

E o simulador compõe, sem conhecer a camada gráfica:

```rust
// engine/products/neuro/apps/neuro_sim/src/app.rs
use brain_engine::NeuralSimulation;      // ciência: consumida, nunca modificada
use neuro_render::{AnatomicalLayer, LayerView, TissueRenderer};
use um_math::Vec4;

pub struct NeuroSimulator {
    science: NeuralSimulation,           // passo fixo, replay, cinco hashes
    layers: Vec<AnatomicalLayer>,
    views: Vec<LayerView>,
    clip_planes: Vec<Vec4>,              // Ax + By + Cz + D = 0
    renderer: TissueRenderer,
}

impl NeuroSimulator {
    /// Corte coronal: plano com normal +Y passando pela origem anatômica.
    /// Apresentação pura — não toca em `science`, não altera hash algum.
    pub fn add_coronal_cut(&mut self, offset: f32) {
        self.clip_planes.push(Vec4::new(0.0, 1.0, 0.0, -offset));
    }
}
```

O campo `science` está ali de propósito: ele mostra, no tipo, que a simulação
neural continua sendo dona da ciência e que o motor só apresenta.

## 9 · Orçamento candidato da fatia 0

Os números abaixo são alvos iniciais, não baselines promovidas. `UM0-ENTRY`
define o ambiente; cada medição registra SO, target, toolchain, backend,
adaptador, driver, resolução, perfil de energia, warm-up, amostras e método de
timestamp. CPU, GPU e intervalo de apresentação são separados; `Fifo`/vsync não
mede custo de GPU por si só.

| Métrica | Teto |
| :-- | --: |
| GPU p95 em 1080p, por timestamp quando suportado | alvo 8,0 ms; promover somente após baseline |
| CPU p95 de submissão | a declarar em `UM0-A1` |
| chamadas de desenho | 32 |
| triângulos | 250.000 |
| memória de GPU | 128 MiB |
| tempo até o primeiro quadro | 900 ms |
| alocações por quadro após aquecimento | 0 |
| tamanho do binário em release | 24 MiB |

Ultrapassar um teto não reprova a ideia: exige nova medida, nova justificativa e
nova versão do orçamento — nunca silêncio.

## 10 · Provas da fatia 0

| ID | Prova |
| :-- | :-- |
| UQ-001 | janela abre, redimensiona, minimiza, restaura e fecha sem recurso vazado |
| UQ-002 | hash de malha usa fixture quantizada, serialização canônica, versão e ambiente; paridade entre plataformas só é afirmada após matriz real |
| UQ-003 | imagem de referência bate dentro do envelope por backend, incluindo backend de software |
| UQ-004 | a especular por microfacetas bate com tabela CPU versionada, fonte e domínio numérico explícitos; tolerância deriva da análise |
| UQ-005 | o orçamento é medido e publicado como artefato versionado |
| UQ-006 | nenhum símbolo público de `um_*` referencia crate externo |
| UQ-007 | nenhum crate `um_*` contém vocabulário anatômico |
| UQ-008 | `brain-engine` compila e passa todos os testes existentes sem alteração |
| UQ-009 | preset, `SimulationConfig`, seed, entradas, passos, schema e formato canônico fixos produzem os cinco hashes da fixture promovida |

`UQ-009` é o gate mais importante do programa: ele prova que o motor nativo e a
pilha web estão calculando a **mesma** ciência.

## 11 · Riscos da fatia

| ID | Risco | Mitigação |
| :-- | :-- | :-- |
| SRSK-01 | a fatia vira brinquedo e nunca vira motor | `UM0-A0` prova ciência primeiro; `UM0-F` obriga bancada e orçamento |
| SRSK-02 | tipo emprestado vaza e trava a arquitetura | `UQ-006` como gate de compilação |
| SRSK-03 | divergência entre nativo e web confunde o leitor | selo de proveniência e `UQ-009` em toda captura |
| SRSK-04 | tempo de compilação torna o ciclo insuportável | workspace separado, crates pequenos, `cargo check` como gate rápido |
| SRSK-05 | realismo precoce sem catálogo vira alegação | nenhuma estrutura recebe nome antes de `neuro_anatomy` existir (`U1-D`) |

## 12 · Definição de pronto

A fatia 0 está pronta quando um único comando abre uma janela nativa com uma
superfície encefálica sombreada, orbitável a 60 quadros por segundo dentro do
orçamento; quando os cinco hashes científicos batem com a pilha web; quando a
bancada roda no CI; e quando a documentação do corte registra ambiente,
comandos e números reais.

Nada além disso conta como pronto — e nada disso pode ser afirmado antes de
existir.

Ver também: [roadmap canônico](ROADMAP.md) ·
[catálogo de capacidades](../specifications/unrail/CAPABILITY_CATALOG.md) ·
[horizontes não agendados](backlog/UNRAIL_HORIZONS.md).
