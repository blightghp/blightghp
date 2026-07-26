<div align="center">

<samp>TO THE TRAINED EYE, THERE ARE NO COINCIDENCES...</samp>

<a href="https://blightghp.github.io/blightghp/">
  <img src="assets/brain.gif?v=4" width="760" alt="Rede neural tridimensional com atividade excitatória e inibitória" />
</a>

<sub>▲ Abra o experimento para orbitar o modelo, isolar regiões e alterar estímulo, plasticidade e escala temporal.</sub>

</div>

---

## Sinapse Formalista

Este experimento combina uma topologia cerebral procedural com uma simulação neural determinística. Os sinais visíveis não percorrem trajetórias decorativas: cada pulso nasce de um disparo, atravessa uma sinapse do grafo e chega ao neurônio de destino depois do atraso calculado para aquela conexão.

O modelo foi desenhado para ser compreensível e visualmente expressivo. Ainda é cedo para dizer se é possível fazer aparecer toda a fisiologia do cérebro humano. Busquei trabalhar com uma aproximação tipo *leaky integrate-and-fire*, plasticidade temporal e uma atualização Bayesiana de duas hipóteses, por enquanto.

### O que está sendo simulado

- **1.890 nós procedurais:** hemisférios, cerebelo e tronco usam uma semente estável via PRNG determinístico (`random.ts`); eles não representam 1.890 neurônios biológicos identificados.
- **Estrutura de sinapses CSR (Compressed Sparse Row):** grafo sináptico comprimido (`network.ts`) para travessia e atualização eficiente de conexões.
- **Campo populacional macroscópico E/I (`field.ts`):** kernel de grafo cortical com populações excitatória ($E$) e inibitória ($I$), histórico temporal e atrasos de condução efetivos.
- **Acoplamento bidirecional Campo-Spikes:** disparos alimentam localmente o campo e a diferença de atividade E/I modula o estado sub-limiar da rede.
- **Cinética receptor-dependente AMPA e GABA-A:** condutâncias sinápticas rápidas (5ms para AMPA, 10ms para GABA-A) com integração temporal.
- **Plasticidade STDP:** disparos próximos no tempo fortalecem ou enfraquecem sinapses excitatórias.
- **Evidência Bayesiana:** cada mudança de estímulo atualiza a crença antes de modular a entrada da rede.
- **Execução desacoplada em Worker:** simulação em thread dedicada (`simulation.worker.ts` e `engine-host.ts`), sem avançar o núcleo no frame gráfico.
- **Atividade superficial & interpolação de snapshots:** a camada de renderização (`render-layers.ts`) apresenta o campo publicado e interpola snapshots consecutivos sem criar eventos.
- **Foco de circuito, zoom & HUD instrumentado:** isolamento visual por região, zoom orbital e instrumentos nomeados (`Hz/nó`, `spikes`, estado LIF em `u.a.`, peso médio e `FPS`).

```text
observação → atualização Bayesiana → corrente de entrada
                                         ↓
topologia CSR → campo populacional E/I ↔ acoplamento spikes → STDP
                                         ↓
                  Web Worker (EngineHost) ↔ Protocolo & Observáveis
                                         ↓
            Ondas Superficiais & Interpolação (render-layers.ts) · Zoom LOD
                                         ↓
                         Three.js · WebGL · HUD Instrumentado
```

### Arquitetura

| Camada | Tecnologia | Responsabilidade atual |
| :-- | :-- | :-- |
| Núcleo neural | TypeScript | Integração temporal LIF, condutâncias AMPA/GABA-A, plasticidade STDP, matriz CSR (`network.ts`) e PRNG determinístico (`random.ts`) |
| Campo populacional | TypeScript | Campo E/I por kernel de grafo cortical (`field.ts`), atraso espacial consumido pelo integrador e acoplamento bidirecional com spikes |
| Motor & Worker | TypeScript · Web Worker | Execução em worker thread (`simulation.worker.ts`), desacoplada da UI via `engine-host.ts` |
| Tempo & Protocolo | TypeScript | Relógio determinístico (`clock.ts`), protocolo de mensagens (`protocol.ts`) e observáveis (`observables.ts`) |
| Topologia & Render | Three.js · TypeScript | Anatomia procedural, atividade superficial (`render-layers.ts`), interpolação de snapshots e foco regional |
| Inferência | TypeScript | Atualização Bayesiana normalizada entre duas hipóteses |
| Visualização | Three.js · WebGL | Instâncias, bloom, envoltórios anatômicos, atividade por vértice e instrumentação de FPS |
| Contrato | Zod | Validação dos parâmetros recebidos pela interface e pela URL |
| Desktop | Tauri 2 · Rust | Empacotamento nativo e ponte segura com a interface |
| Qualidade | Vitest · Cargo | Campo populacional E/I, grafo CSR, relógio, observáveis, worker host, inferência e runtime nativo |

O núcleo permanece em TypeScript nesta versão para manter paridade imediata entre GitHub Pages e desktop. Ele roda em um Web Worker dedicado (`EngineHost`), enquanto o renderer (`render-layers.ts`) interpola snapshots sem integrar o modelo no frame gráfico. A migração para um crate compartilhado entre Rust nativo e WebAssembly está planejada para quando os perfis de desempenho justificarem a troca.

O gate técnico da 0.4 e as limitações aceitas antes da abertura da etapa 0.5
estão registrados em [AUDIT_0.4.md](AUDIT_0.4.md).

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

Cada versão combina uma melhoria do modelo com um novo patamar gráfico. O projeto separa o que pretende construir, o significado científico dos estados e a forma de validar cada avanço:

- [ROADMAP.md](ROADMAP.md) organiza versões, dependências e ganhos gráficos;
- [MODEL_SPEC.md](MODEL_SPEC.md) registra equações, unidades, hipóteses e limites;
- [ARCHITECTURE.md](ARCHITECTURE.md) traduz o modelo em módulos, tipos, laços e camadas de render;
- [VALIDATION.md](VALIDATION.md) define evidências exatas, numéricas, estatísticas e visuais;
- [REFERENCES.md](REFERENCES.md) reúne a base científica usada nas decisões.

## Sobre mim

> *"Interesso-me pelas regiões de fronteira em que a lógica encontra a linguagem, a computação encontra a biologia e o rigor formal precisa aprender a conviver com a ambiguidade, a historicidade e a complexidade dos fenômenos humanos."*

Atuo entre pesquisa e desenvolvimento, articulando estudos em linguística, cognição, aprendizagem, ciência de dados e projetos em engenharia de software. Busco transformar perguntas complexas em modelos, sistemas e experimentos sem reduzir os fenômenos àquilo que pode ser facilmente mensurado, preservando, sempre que possível, o equilíbrio entre precisão formal, sensibilidade interpretativa e abertura interdisciplinar. Meu Github é um portal de experimentos dos mais diversos. 
Resumindo, a minha zona de interesse envolve explorar e especular sobre as equivalências conceituais entre biologia e máquina, isto é, conceitos neurobiológicos e computacionais/formais.

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
[![Léxikognos](https://img.shields.io/badge/Léxikognos-246BCE?style=flat-square&logo=google-scholar&logoColor=white)](http://lexikognos.com.br) *domínio offline*
[![Instagram](https://img.shields.io/badge/Instagram-E4405F?style=flat-square&logo=instagram&logoColor=white)](https://instagram.com/ppgabrielpinheiro)

<sub><code>fn perceive(signal: &Evidence) -&gt; Result&lt;Knowledge, Entropy&gt;</code></sub>

</div>
