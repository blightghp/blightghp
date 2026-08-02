# Evidência de consolidação · BRAIN PRO [v. 0.7.0]

Data: 2026-08-02. Estado: **apta para promoção**.

## Entrega verificada

- patch Rust com 12 células AdEx, compartimento dendrítico passivo e adaptação;
- AMPA/NMDA/GABA-A/GABA-B com correntes e constantes temporais separadas;
- `ResolutionMap` conservativo, contorno campo→patch e blend sem sobreposição;
- ABI/protocolo v5, nove arrays celulares, 22 buffers transferíveis e terceiro hash;
- abas Célula e Eletricidade com unidades, medidores e geometria derivada do snapshot;
- fallback diagnóstico celular zerado e baseline 0.6 preservado.

## Gates

| Gate | Resultado esperado |
| :-- | :-- |
| testes Rust | patch, replay, campo, circuito, filas e contratos passam |
| Clippy | workspace/all-targets com `-D warnings` |
| Wasm | release `wasm32-unknown-unknown` e bindings TypeScript regenerados |
| TypeScript/Vitest | typecheck e suíte completa passam |
| produção | Vite gera bundle sem erro |
| navegador | runtime `rust-wasm`, schema 5, três hashes hex e quatro abas válidas |
| visual | cinco capturas, teclado, contraste ≥ 4,5:1, mobile e perfil completos |

Os valores finais de contagem e desempenho são registrados pela execução de
release no commit de fechamento. O p95 do Worker é diagnóstico do ambiente de
CI/local, não um limiar fisiológico nem promessa universal de hardware.

## Limites aceitos

- o dendrito é um único compartimento passivo;
- parâmetros são presets didáticos, não calibração de tipo celular;
- a entrada externa é um processo endereçado por taxa, não uma população
  aferente anatomicamente modelada;
- o retorno patch→campo está desligado;
- não há vesículas, concentração, ocupação, cascatas ou reação–difusão.

## Prontidão da 0.8

A próxima fase pode começar sobre IDs de receptor, correntes SI, replay celular,
hash próprio e ABI v5 estável. Antes de implementar bioquímica, deve congelar:
estoques e unidades, invariantes de conservação/positividade, ordem de eventos
pré/pós-sinápticos, oráculo de plasticidade e critérios para solver rígido.

Veredito final: 0.7 completa seu escopo sem antecipar a dinâmica da 0.8.
