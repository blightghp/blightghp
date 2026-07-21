<div align="center">

<samp>TO THE TRAINED EYE, THERE ARE NO COINCIDENCES.</samp>

# Gabriel Pinheiro · blightghp

**Sistemas nativos, interfaces precisas e modelos que transformam dados em percepção.**

[![Validar ecossistema](https://github.com/blightghp/blightghp/actions/workflows/ci.yml/badge.svg)](https://github.com/blightghp/blightghp/actions/workflows/ci.yml)
[![GitHub Pages](https://github.com/blightghp/blightghp/actions/workflows/deploy.yml/badge.svg)](https://github.com/blightghp/blightghp/actions/workflows/deploy.yml)

<a href="https://blightghp.github.io/blightghp/">
  <img src="assets/brain.gif?v=3" width="760" alt="Cérebro neural 3D girando lentamente enquanto impulsos sinápticos percorrem conexões azuis" />
</a>

<sub>▲ Clique no cérebro para explorar o motor neural 3D — órbita, camadas anatômicas, bloom e inferência Bayesiana em tempo real.</sub>

</div>

---

### Um ecossistema, duas camadas, uma topologia

O experimento acima não é um vídeo decorativo. O mesmo grafo procedural alimenta a experiência web, o GIF reproduzível do perfil e o aplicativo desktop. A interface TypeScript conversa com um runtime Rust via Tauri; entradas são validadas por schema e invariantes visuais são protegidos por Vitest.

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

### O que está vivo aqui

- **Cérebro procedural determinístico:** hemisférios, cerebelo, tronco e corpo caloso emergem de funções matemáticas com seed estável.
- **Sinais que seguem a rede:** cada luz percorre arestas reais e carrega uma trilha sináptica, sem partículas soltas fingindo conectividade.
- **Mesmo motor, múltiplas superfícies:** navegador no GitHub Pages, WebView do Tauri e captura automatizada do hero do perfil.
- **Fundo adaptativo:** o hero usa transparência indexada e preserva contraste nos temas claro e escuro do GitHub.

<div align="center">
  <img src="assets/activity_flow.svg?v=3" width="850" alt="Fluxo longitudinal de contribuições no GitHub" />
</div>

<div align="center">

[![Email](https://img.shields.io/badge/Email-D14836?style=flat-square&logo=gmail&logoColor=white)](mailto:ghpgois@gmail.com)
[![Léxikognos](https://img.shields.io/badge/Léxikognos-246BCE?style=flat-square&logo=google-scholar&logoColor=white)](http://lexikognos.com.br)
[![Instagram](https://img.shields.io/badge/Instagram-E4405F?style=flat-square&logo=instagram&logoColor=white)](https://instagram.com/ppgabrielpinheiro)

<sub><code>fn perceive(signal: &Evidence) -&gt; Result&lt;Knowledge, Entropy&gt;</code></sub>

</div>
