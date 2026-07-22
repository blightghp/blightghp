<div align="center">

<samp>TO THE TRAINED EYE, THERE ARE NO COINCIDENCES...</samp>

[![Validar ecossistema](https://github.com/blightghp/blightghp/actions/workflows/ci.yml/badge.svg)](https://github.com/blightghp/blightghp/actions/workflows/ci.yml)
[![GitHub Pages](https://github.com/blightghp/blightghp/actions/workflows/deploy.yml/badge.svg)](https://github.com/blightghp/blightghp/actions/workflows/deploy.yml)

<a href="https://blightghp.github.io/blightghp/">
  <img src="assets/brain.gif?v=4" width="760" alt="Rede neural tridimensional com atividade excitatória e inibitória" />
</a>

<sub>▲ Abra o experimento para orbitar o modelo, isolar regiões e alterar estímulo, plasticidade e escala temporal.</sub>

</div>

---

## Sinapse Formalista

Este experimento combina uma topologia cerebral procedural com uma simulação neural determinística. Os sinais visíveis não percorrem trajetórias decorativas: cada pulso nasce de um disparo, atravessa uma sinapse do grafo e chega ao neurônio de destino depois do atraso calculado para aquela conexão.

O modelo foi desenhado para ser compreensível e visualmente expressivo. Ele não pretende reproduzir toda a fisiologia do cérebro humano; trabalha com uma aproximação *leaky integrate-and-fire*, plasticidade temporal e uma atualização Bayesiana de duas hipóteses.

### O que está sendo simulado

- **1.890 neurônios procedurais:** hemisférios, cerebelo e tronco usam uma semente estável.
- **Sinapses direcionadas:** cada conexão possui peso, atraso, origem e destino.
- **Excitação e inibição:** a natureza do neurônio define o sinal das suas conexões de saída.
- **Dinâmica de membrana:** potenciais decaem com o tempo, respeitam limiar e período refratário.
- **Plasticidade STDP:** disparos próximos no tempo fortalecem ou enfraquecem sinapses excitatórias.
- **Evidência Bayesiana:** cada mudança de estímulo atualiza a crença antes de modular a entrada da rede.
- **Renderização orientada pelo estado:** brilho dos nós, cor das conexões, pulsos e gráfico de atividade refletem a simulação atual.

```text
observação → atualização Bayesiana → corrente de entrada
                                         ↓
topologia → potenciais → disparos → sinapses com atraso
                ↑                         ↓
                └──────── STDP ───────────┘
                                         ↓
                         Three.js · WebGL · HUD
```

### Arquitetura

| Camada | Tecnologia | Responsabilidade atual |
| :-- | :-- | :-- |
| Núcleo neural | TypeScript | Integração temporal, disparos, atrasos e plasticidade |
| Topologia | Three.js · TypeScript | Anatomia procedural, conectividade e seed determinística |
| Inferência | TypeScript | Atualização Bayesiana normalizada entre duas hipóteses |
| Visualização | Three.js · WebGL | Instâncias, bloom, envoltórios anatômicos e atividade por vértice |
| Contrato | Zod | Validação dos parâmetros recebidos pela interface e pela URL |
| Desktop | Tauri 2 · Rust | Empacotamento nativo e ponte segura com a interface |
| Qualidade | Vitest · Cargo | Invariantes do grafo, inferência, simulação e runtime nativo |

O núcleo permanece em TypeScript nesta versão para manter paridade imediata entre GitHub Pages e desktop. A migração para um crate compartilhado entre Rust nativo e WebAssembly está planejada para quando os perfis de desempenho justificarem a troca.

### Executar localmente

```bash
npm install
npm run dev
```

Para validar o projeto inteiro:

```bash
npm run check
cargo test --manifest-path src-tauri/Cargo.toml
```

O GIF do perfil é reproduzível e usa o mesmo renderer da aplicação:

```bash
npm run generate:brain-gif
```

## Evolução do experimento

Cada versão combina uma melhoria do modelo com um novo patamar gráfico. O plano completo, os critérios de conclusão e os limites científicos estão em [ROADMAP.md](ROADMAP.md).

## Sobre mim

> *"Interesso-me pelas regiões de fronteira em que a lógica encontra a linguagem, a computação encontra a biologia e o rigor formal precisa aprender a conviver com a ambiguidade, a historicidade e a complexidade dos fenômenos humanos."*

Atuo entre pesquisa e desenvolvimento, articulando linguística, cognição, aprendizagem, ciência de dados e engenharia de software. Busco transformar perguntas complexas em modelos, sistemas e experimentos sem reduzir os fenômenos àquilo que pode ser facilmente mensurado, preservando, sempre que possível, o equilíbrio entre precisão formal, sensibilidade interpretativa e abertura interdisciplinar.

---

> **Áreas de interesse**
>
> - Lógica formal e filosofia da lógica
> - Linguística teórica e gramática gerativa
> - Psicometria, neuropsicologia e aprendizagem
> - Ciência de dados e modelagem estatística
> - Engenharia de software e arquitetura de sistemas
> - Inteligência Artificial e sistemas complexos
> - Matemática aplicada e teoria da computação
> - Neurociências cognitivas e biologia da cognição

<div align="center">
  <img src="assets/activity_flow.svg?v=3" width="850" alt="Fluxo longitudinal de contribuições no GitHub" />
</div>

<div align="center">

[![Email](https://img.shields.io/badge/Email-D14836?style=flat-square&logo=gmail&logoColor=white)](mailto:ghpgois@gmail.com)
[![Léxikognos](https://img.shields.io/badge/Léxikognos-246BCE?style=flat-square&logo=google-scholar&logoColor=white)](http://lexikognos.com.br)
[![Instagram](https://img.shields.io/badge/Instagram-E4405F?style=flat-square&logo=instagram&logoColor=white)](https://instagram.com/ppgabrielpinheiro)

<sub><code>fn perceive(signal: &Evidence) -&gt; Result&lt;Knowledge, Entropy&gt;</code></sub>

</div>
