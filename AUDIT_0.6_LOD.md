# Custo de apresentação · BRAIN PRO 0.6-d

Data: 2026-07-26.

A aba Lâminas lê sempre o mesmo snapshot de 17 valores: doze atividades E/I,
relé, TRN, rebote, drive relé→L4 e retorno L6. Trocar LOD não muda equações,
passo, hash, buffers ou quantidade de estado lido.

| LOD | Draw calls fixos | Vias visíveis | Total |
| :-- | --: | --: | --: |
| baixo | 14 | 3 | 17 |
| médio | 14 | 7 | 21 |
| alto | 14 | 9 | 23 |

Os 14 draws fixos são seis cilindros E, seis anéis I, relé e TRN. Cada via é
uma `THREE.Line`. O LOD atual reduz submissão de draws ao ocultar vias; todas as
geometrias continuam residentes. Uma reconstrução dinâmica só será justificada
se um perfil mostrar pressão de memória, pois recriar buffers durante interação
também tem custo e risco de fragmentação.

O gate automático valida:

- orçamento monotônico 3 < 7 < 9;
- domínio fechado de LOD;
- treze buffers transferíveis independentes;
- aba e métricas no navegador real;
- renderer sem escrita no snapshot.
