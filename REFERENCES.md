# Referências de estudo e modelagem

Esta lista acompanha meu estudo de Rust, do Kandel e dos modelos matemáticos.
Nenhuma referência funciona como argumento automático de autoridade: cada
preset precisa registrar a fonte específica dos valores que utilizar.

## Regra de proveniência científica e visual

Uma referência bibliográfica sustenta somente a afirmação explicitamente ligada
a ela. Presets registram parâmetro, unidade, preparação/regime e transformação;
assets registram origem, licença, versão, hash, escala, orientação e pipeline.
Atlas ou malha detalhada não promovem um modelo matemático. Nenhum asset
anatômico ou vascular externo está aprovado pelo simples fato de aparecer nesta
lista; sua entrada exige manifesto próprio definido em
[GRAPHICS_SPEC.md](GRAPHICS_SPEC.md).

R10-A aplica essa regra sem adicionar fonte externa: seu catálogo schema 1
registra somente geradores e contratos internos já existentes, com licença,
versão, transformação, nível de evidência e limitações por entrada. O catálogo
não transforma as referências de estudo abaixo em atlas aprovado. Uma futura
fonte anatômica externa ainda exigirá manifesto, licença compatível, versão,
SHA-256 e pipeline reproduzível próprios.

R10-B usa as referências abaixo somente para nomenclatura e conectividade
vascular. A geometria continua procedural e `ILLUSTRATIVE`; nenhuma citação
calibra raio, posição, escala, perfusão ou dinâmica:

- Purves, D. et al. (2001). [The Blood Supply of the Brain and Spinal Cord](https://www.ncbi.nlm.nih.gov/books/NBK11042/). Referência para carótidas internas, vertebrais/basilar, artérias cerebrais e círculo de Willis.
- Cipolla, M. J. (2009). [Anatomy and Ultrastructure](https://www.ncbi.nlm.nih.gov/books/NBK53086/), em *The Cerebral Circulation*. Referência para arquitetura pial/penetrante, drenagem venosa, seios e unidade neurovascular.
- [TeachMeAnatomy · arterial supply](https://teachmeanatomy.info/neuroanatomy/vessels/arterial-supply/), [venous drainage](https://teachmeanatomy.info/neuroanatomy/vessels/venous-drainage/) e [dural venous sinuses](https://teachmeanatomy.info/neuroanatomy/vessels/dural-venous-sinuses/). Apoio didático de nomenclatura; não é fonte de geometria distribuída.
- Kadry, H. et al. (2023). [Cells of the Blood-Brain Barrier](https://pmc.ncbi.nlm.nih.gov/articles/PMC9987262/). Referência de revisão para endoteliais, pericitos, astrócitos e barreira.
- Hartmann, D. A. et al. (2023). [Pericyte Control of Blood Flow across Microvascular Zones](https://pmc.ncbi.nlm.nih.gov/articles/PMC10480047/). Referência de revisão para nomenclatura microvascular; R10-B não implementa seu conteúdo hemodinâmico.

## Percurso de aprendizagem desde 2025

- Kandel, E. R.; Koester, J. D.; Mack, S. H.; Siegelbaum, S. A. (2021). [*Principles of Neural Science*, 6ª ed.](https://books.google.com/books/about/Principles_of_Neural_Science_Sixth_Editi.html?id=8yGq0QEACAAJ). O “Kandel” é meu projeto de leitura; enquanto o estudo, uso o BRAIN PRO para consolidar conceitos sem tratar o livro como calibração automática.
- [The Rust Programming Language](https://doc.rust-lang.org/book/). Referência principal para ownership, tipos, erros, traits, testes e concorrência.
- [MDN · WebAssembly](https://developer.mozilla.org/en-US/docs/WebAssembly). Apoio para entender o runtime do navegador e a fronteira JavaScript/Wasm.
- [Allen Institute · Education Resources](https://alleninstitute.org/education/resources). Material de apoio para anatomia, dados e leitura neurocientífica.

## Unidades e sinapses

- Naud, R.; Marcille, N.; Clopath, C.; Gerstner, W. (2008). [Firing patterns in the adaptive exponential integrate-and-fire model](https://pmc.ncbi.nlm.nih.gov/articles/PMC2798047/). Base para o AdEx e para a distinção entre padrões de disparo e forma completa do potencial de ação.
- Destexhe, A.; Mainen, Z. F.; Sejnowski, T. J. (1994). [An efficient method for computing synaptic conductances based on a kinetic model of receptor binding](https://pubmed.ncbi.nlm.nih.gov/8792231/). Referência para estados cinéticos de receptores.
- McDonnell, M. D.; Mohan, A.; Stricker, C. (2013). [Mathematical analysis and algorithms for efficiently and accurately implementing stochastic simulations of short-term synaptic depression and facilitation](https://pmc.ncbi.nlm.nih.gov/articles/PMC3650633/). Apoia a separação entre modelo conceitual de liberação e algoritmo estocástico.
- Ecker, A. et al. (2020). [Data-driven integration of hippocampal CA1 synaptic physiology in silico](https://pmc.ncbi.nlm.nih.gov/articles/PMC7687201/). Exemplo de integração explícita entre probabilidade de liberação, cinética, plasticidade de curto prazo e anatomia sináptica.
- [IUPHAR/BPS Guide to Pharmacology](https://www.guidetopharmacology.org/). Nomenclatura e famílias de receptores; os parâmetros de circuito ainda exigem fontes experimentais próprias.

## Campos, inferência e observação

- Aqil, M. et al. (2021). [Graph neural fields: A framework for spatiotemporal dynamical models on the human connectome](https://pmc.ncbi.nlm.nih.gov/articles/PMC7872285/). Referência para campos definidos em grafos e para a distinção entre conectividade, Laplaciano e dinâmica de campo.
- Bastos, A. M. et al. (2012). [Canonical microcircuits for predictive coding](https://pmc.ncbi.nlm.nih.gov/articles/PMC3777738/). Base para experimentos de código preditivo, sem implicar uma lei biofísica universal.
- Mazzoni, A. et al. (2015). [Computing the Local Field Potential (LFP) from Integrate-and-Fire Network Models](https://journals.plos.org/ploscompbiol/article?id=10.1371/journal.pcbi.1004584). Fundamenta o uso cuidadoso do termo pseudo-LFP em modelos pontuais e o papel de correntes E/I, morfologia e posição.

## Camadas corticais, tálamo e TRN

- Douglas, R. J.; Martin, K. A. C. (2004). [Neuronal circuits of the neocortex](https://doi.org/10.1146/annurev.neuro.27.070203.144152). Referência conceitual para circuitos corticais recorrentes; não fornece, por si só, os ganhos deste preset.
- Haeusler, S.; Maass, W. (2007). [A statistical analysis of information-processing properties of lamina-specific cortical microcircuit models](https://doi.org/10.1093/cercor/bhl152). Apoia o estudo explícito de conectividade por lâmina e a necessidade de declarar a arquitetura usada.
- Iavarone, E. et al. (2023). [A computational model of thalamocortical dysrhythmia](https://pmc.ncbi.nlm.nih.gov/articles/PMC10066598/). Exemplo de modelagem computacional que separa populações talâmicas e corticais.
- Vien, C. et al. (2022). [A thalamocortical neural mass model of the EEG during NREM sleep and propofol general anaesthesia](https://pmc.ncbi.nlm.nih.gov/articles/PMC9120371/). Referência para distinguir relé e TRN em modelos de massa neural e para não confundir um ritmo abstrato com um mecanismo celular completo.

## Topologia e dinâmica coletiva

- Dabaghian, Y.; Mémoli, F.; Frank, L.; Carlsson, G. (2012). [A topological paradigm for hippocampal spatial map formation using persistent homology](https://pmc.ncbi.nlm.nih.gov/articles/PMC3415417/). Referência para homologia persistente aplicada a padrões de coatividade, não para cálculo indiscriminado em todo frame.
- Chung, S.; Abbott, L. F. (2021). [Neural population geometry: An approach for understanding biological and artificial neural networks](https://doi.org/10.1016/j.conb.2021.10.010). Contexto para geometria de populações e dimensionalidade; a interpretação depende da tarefa e da amostragem.
- Townsend, R. G. et al. (2015). [Emergence of complex wave patterns in primate cerebral cortex](https://pubmed.ncbi.nlm.nih.gov/25788682/). Referência para ondas complexas e singularidades de fase extraídas de sinais espaciais.
- Touboul, J.; Destexhe, A. (2010). [Can power-law scaling and neuronal avalanches arise from stochastic dynamics?](https://pmc.ncbi.nlm.nih.gov/articles/PMC2820096/). Fundamenta os controles contra leis de potência aparentes produzidas por limiarização e processos estocásticos.
- Levina, A.; Priesemann, V. (2017). [Subsampling scaling](https://pmc.ncbi.nlm.nih.gov/articles/PMC5418619/). Referência para o efeito da subamostragem na inferência de regimes críticos.

## Infraestrutura científica

- [Rust `wasm32-unknown-unknown`](https://doc.rust-lang.org/stable/rustc/platform-support/wasm32-unknown-unknown.html). Contrato e limitações do alvo genérico de WebAssembly.
- [`wasm-bindgen`: implantação na web](https://wasm-bindgen.github.io/wasm-bindgen/reference/deployment.html) e [execução em Web Worker](https://wasm-bindgen.github.io/wasm-bindgen/examples/wasm-in-web-worker.html). Referências para a ponte estreita entre o motor Rust e o shell do navegador.
- [Requisitos de segurança de `SharedArrayBuffer`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer#security_requirements). Fundamenta o baseline serial: paralelismo Wasm com memória compartilhada só entra após teste de isolamento cross-origin no host real.
- [Comportamento do `GITHUB_TOKEN` em workflows](https://docs.github.com/en/actions/concepts/security/github_token). Fundamenta a atualização do GIF e do README em um único workflow, sem depender de um segundo workflow disparado pelo commit automatizado.
- [README de perfil no GitHub](https://docs.github.com/en/account-and-profile/concepts/personal-profile). O GIF é um artefato versionado do perfil; atualização “ao vivo” significa consistência eventual depois da captura, do commit e da invalidação de cache.
- [ASP.NET Core Blazor](https://learn.microsoft.com/en-us/aspnet/core/blazor/). Referência de plataforma para avaliar um eventual serviço ou cliente .NET; não justifica incluir outro runtime no laço web sem benchmark.

## Regra de uso

Ao implementar um modelo, o código referencia o preset e a documentação do preset referencia a fonte. Comentários não carregam revisões bibliográficas extensas. Quando duas fontes usam convenções incompatíveis, seus parâmetros não são combinados sem conversão e justificativa explícitas.

Para novas fontes, usar forma bibliográfica consistente, preferencialmente
compatível com ABNT, e registrar DOI/URL verificável quando disponível. Uma
fonte ausente permanece lacuna; não deve ser reconstruída por memória.
