# Referências técnicas primárias · Unrail Motor

**Consulta:** 21 de agosto de 2026

**Escopo:** premissas de workspace, geração de código, `unsafe`, ABI e backend GPU

Estas fontes validam a arquitetura antes de selecionar dependências. Uma página
“latest” não fixa versão: pacote, release, features e licença só entram no
registro quando `UM0-ENTRY` produzir lockfile e SBOM.

| Tema | Fonte primária | Consequência arquitetural |
| :-- | :-- | :-- |
| workspaces Cargo | [Cargo Reference · Workspaces](https://doc.rust-lang.org/cargo/reference/workspaces.html) | `engine/` pode ser workspace aninhado se a raiz o excluir; terá lockfile, target e CI próprios |
| macros procedurais | [Rust Reference · Procedural macros](https://doc.rust-lang.org/stable/reference/procedural-macros.html) | macros operam em token streams, executam na compilação e são não higiênicas; não são uma camada “gratuita” nem automaticamente segura |
| `unsafe` | [Rust Reference · The unsafe keyword](https://doc.rust-lang.org/stable/reference/unsafe-keyword.html) | cada operação descarrega obrigações que precisam ser documentadas e testadas; orçamento por locais/linhas é mais honesto que contar blocos |
| ABI | [Rust Reference · ABI](https://doc.rust-lang.org/reference/abi.html) | fronteira dinâmica exige convenção explícita e contrato C controlado; tipos Rust como `Vec`, `String` e trait objects não atravessam a FFI proposta |
| camada gráfica candidata | [wgpu crate documentation](https://docs.rs/wgpu/latest/wgpu/) | a versão ainda não foi escolhida; fachada só nasce após spike e lock explícito |
| vida de janela/superfície | [wgpu · Surface](https://docs.rs/wgpu/latest/wgpu/struct.Surface.html) | `Surface` carrega lifetime associado à janela; a arquitetura deve garantir ordem `Window > Surface > Device` sem vazar tipos externos |
| estado de WebGPU/WGSL | [wgpu README](https://docs.rs/crate/wgpu/latest/source/README.md) | implementação e padrões evoluem; atualizar backend é corte medido, não upgrade automático |

Não foram usadas fontes secundárias para afirmar comportamento de Cargo, Rust ou
wgpu. Referências científicas e visuais do BRAIN PRO permanecem no
[catálogo geral](../REFERENCES.md).
