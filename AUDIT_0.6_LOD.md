# Custo de apresentação · BRAIN PRO 0.6-d

Data: 2026-07-26.

A aba Lâminas lê sempre o mesmo snapshot de 17 valores: doze atividades E/I,
relé, TRN, rebote, drive relé→L4 e retorno L6. Trocar LOD não muda equações,
passo, hash, buffers ou quantidade de estado lido.

| LOD | Draw calls fixos | Vias visíveis | Total da cena |
| :-- | --: | --: | --: |
| baixo | 14 | 6 curvas + 6 pulsos | 26 |
| médio | 14 | 11 curvas + 11 pulsos | 36 |
| alto | 14 | 15 curvas + 15 pulsos | 44 |

Os 14 draws fixos são seis cilindros E, seis anéis I, relé e TRN. Cada via usa
uma curva e um pulso axonal com ciclo próprio. O LOD atual reduz submissão de draws ao ocultar vias; todas as
geometrias continuam residentes. Uma reconstrução dinâmica só será justificada
se um perfil mostrar pressão de memória, pois recriar buffers durante interação
também tem custo e risco de fragmentação.

Esses totais descrevem a cena laminar. O perfil vivo acumula também os passes
do compositor e, por isso, reporta um total de GPU maior sem contradizer o LOD.

O gate automático valida:

- orçamento monotônico 6 < 11 < 15;
- domínio fechado de LOD;
- treze buffers transferíveis independentes;
- aba e métricas no navegador real;
- renderer sem escrita no snapshot.
