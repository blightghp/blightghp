<div align="center">

<samp>TO THE TRAINED EYE, THERE ARE NO COINCIDENCES...</samp>

[![Validar ecossistema](https://github.com/blightghp/blightghp/actions/workflows/ci.yml/badge.svg)](https://github.com/blightghp/blightghp/actions/workflows/ci.yml)
[![GitHub Pages](https://github.com/blightghp/blightghp/actions/workflows/deploy.yml/badge.svg)](https://github.com/blightghp/blightghp/actions/workflows/deploy.yml)

<a href="https://blightghp.github.io/blightghp/">
  <img src="assets/brain.gif?v=3" width="760" alt="Cérebro neural 3D girando lentamente enquanto impulsos sinápticos percorrem conexões azuis" />
</a>

<sub>▲ Clique no cérebro para explorar o motor neural 3D para ajustar a órbita, as camadas anatômicas, o bloom e fazer a inferência Bayesiana em tempo real para modulação sináptica...</sub>

</div>

---

### Um ecossistema, duas camadas, uma topologia

A "brincadeira" acima é a prova do potencial de uso do ecossistema Rust aliado à comunicação com sistemas web... O mesmo grafo procedural alimenta a experiência web, o GIF reproduzível do perfil e o aplicativo desktop. O que eu fiz? A interface TypeScript conversa com um runtime Rust via Tauri e as entradas são validadas por schema, enquanto invariantes visuais são protegidos por Vitest.

| Camada | Tecnologia | Papel no sistema |
| :-- | :-- | :-- |
| **Core nativo** | `Rust` · `Serde` | Runtime tipado e comandos seguros do desktop |
| **Desktop bridge** | `Tauri 2` | IPC mínimo entre o motor nativo e a interface |
| **Motor visual** | `TypeScript` · `Three.js` | Topologia 3D, órbita, bloom e impulsos instanciados |
| **Contrato** | `Zod Schema` | Configuração validada antes de alcançar o renderer |
| **Qualidade** | `Vitest` · `Cargo test` | Determinismo do grafo e contrato cross-stack |
| **Automação** | `JavaScript` · `GitHub Actions` | Captura do GIF, gráfico de atividade e deploy contínuo |

<div align="center">

[![Rust](https://img.shields.io/badge/Rust-101828?style=for-the-badge&logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![Tauri](https://img.shields.io/badge/Tauri_2-101828?style=for-the-badge&logo=tauri&logoColor=24C8DB)](https://tauri.app/)
[![TypeScript](https://img.shields.io/badge/TypeScript-101828?style=for-the-badge&logo=typescript&logoColor=4A9EFF)](https://www.typescriptlang.org/)
[![JavaScript](https://img.shields.io/badge/JavaScript-101828?style=for-the-badge&logo=javascript&logoColor=F7DF1E)](https://developer.mozilla.org/docs/Web/JavaScript)
[![Vitest](https://img.shields.io/badge/Vitest-101828?style=for-the-badge&logo=vitest&logoColor=6E9F18)](https://vitest.dev/)
[![Zod](https://img.shields.io/badge/Zod_Schema-101828?style=for-the-badge&logo=zod&logoColor=3E67B1)](https://zod.dev/)

</div>

```text
evidence → Zod schema → TypeScript state → Three.js graph
                                      ↕
                              Tauri IPC · Rust
                                      ↓
                       Vitest + Cargo + GitHub Pages
```

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
