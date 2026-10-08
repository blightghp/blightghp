<div align="center">
  <h1>BRAIN PRO</h1>
  <p><strong>Simulador Científico e Neuronal Ultrarrealista</strong></p>
  <img src="assets/brain.gif" alt="BRAIN PRO Simulation Rendering" width="800" />
</div>

> **Nota:** A renderização dinâmica acima é gerada autonomamente pelo simulador **PROMETHEUS** (Render-Graph Engine embarcado), executado na vitrine `.io` via WebAssembly (WebGL2/WebGPU) consumindo malhas sintéticas estáticas.

## O que é o BRAIN PRO?

BRAIN PRO é um projeto pessoal de simulação neurocientífica de ponta desenvolvido como vitrine tecnológica. O projeto tem dois componentes principais:
1. Um **núcleo de ciência e simulação**, escrito em Rust.
2. Um **Simulador Gráfico (PROMETHEUS)**, construído sobre `wgpu` 30, projetado para suportar DAG de clusters, Iluminação Global (GI) e *Zero-Allocation* no *runtime*. 

Para garantir performance e portabilidade, a fronteira gráfica (`PROMETHEUS`) consome tecnologia em **Blackbox WebAssembly**, protegendo os algoritmos matemáticos sob licenciamento estrito. A camada pública da arquitetura (API, ECS, ECS-Wasm boundary) utiliza a licença comercialmente permissiva **Apache 2.0**.

---

## 🚀 PROMETHEUS (Engine Gráfico)

A renderização visual é o coração do projeto. O PROMETHEUS foi **re-desenhado do zero** para rodar simulações ultrarrealistas do cérebro, neurônios, e fluidos em tempo real no navegador ou no desktop nativo.

O motor conta com as seguintes camadas:
- **`prometheus-core` e `prometheus-window`:** Abstração pura da janela e *Frame Timers*.
- **`prometheus-ecs`:** Archetypal ECS *data-oriented*, com suporte a *Wasm Scripting Boundary* de alta performance.
- **`prometheus-render-graph`:** Submissão preditiva e estruturada de passes de renderização sem mutabilidade oculta (Render Graph).
- **`prometheus-alloc`:** Gestão assíncrona da submissão direta para o barramento da VRAM.

### Meshes e Asset Pipeline
Malhas paramétricas (como as topologias densas em `assets/meshes/icosphere_subdiv4.obj` e `grid_128x128.obj`) são ingeridas e otimizadas estaticamente pelo backend de Clusters do PROMETHEUS. As malhas nunca requerem alocação direta na renderização a quente.

---

## 🛠️ Como Funciona e Compila (Arquitetura Vitrine)

Todo o ecossistema é baseado em **Rust**. A interface do usuário pode rodar na Web consumindo o código como `wasm32-unknown-unknown` de forma ofuscada, protegendo a "chave de patente" da tecnologia de simulação, enquanto o repositório público serve as fundações arquiteturais.

Para compilar o ECS e o Render-Graph de uso público:

```bash
# Compilar a fundação do motor gráfico
cargo build --manifest-path engine/Cargo.toml --release

# Executar a pipeline Web / Exposição .io (Via Scripts de Exportação)
npm run build:showcase
```

## 📖 Documentação

O passado acadêmico/antigo do projeto (arquitetura legada sem PROMETHEUS) foi encapsulado para fins de auditoria e preservação histórica na pasta `docs/legacy/archive_2026/`. O foco atual é de 100% no *backend* wgpu do Prometheus.

---
<a id="crypto-anarchist-note"></a>
<sub>* <strong><em>anti-fascist</em></strong> | Apache-2.0 License para a arquitetura de base.</sub>
