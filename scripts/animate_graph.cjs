const https = require('https');
const fs = require('fs');
const path = require('path');

const url = 'https://github-readme-activity-graph.vercel.app/graph?username=blightghp&bg_color=0d1117&color=58a6ff&line=58a6ff&point=e6edf3&area=true&hide_border=true&custom_title=Going%20with%20the%20flow....';
const outPath = path.resolve(__dirname, '../assets/activity_flow.svg');

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    // Filtro de distorção líquida: desloca a linha/área continuamente com ruído fractal,
    // simulando flutuações reais de fluxo (não só um traço "correndo" por cima).
    const filterBlock = `
    <defs>
      <filter id="flowRipple" x="-20%" y="-30%" width="140%" height="160%">
        <feTurbulence type="fractalNoise" numOctaves="2" seed="7" stitchTiles="stitch" result="noise">
          <animate attributeName="baseFrequency" dur="9s" values="0.010 0.045;0.017 0.07;0.010 0.045" repeatCount="indefinite" />
        </feTurbulence>
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="7" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </defs>
    `;

    // Reescreve as animações mirando as classes reais que o Chartist gera (.ct-line,
    // .ct-area, .ct-point) -- os seletores antigos (path[stroke=...], circle) nunca
    // batiam em nada, então o gráfico ficava estático depois do load. Usa !important e é
    // injetado por último pra vencer o <style> nativo do Chartist (animação de "desenhar
    // uma vez e parar") que vem antes no documento.
    const styleBlock = `
    <style>
      @keyframes dashFlow {
        from { stroke-dashoffset: 1000; }
        to { stroke-dashoffset: 0; }
      }
      @keyframes breathe {
        0%, 100% { opacity: 0.65; transform: translateY(0px); }
        50% { opacity: 0.95; transform: translateY(-4px); }
      }
      @keyframes pointPulse {
        0%, 100% { stroke-width: 7px; opacity: 0.55; }
        50% { stroke-width: 13px; opacity: 1; }
      }

      .ct-line {
        stroke-dasharray: 22 12 !important;
        animation: dashFlow 2.6s linear infinite !important;
      }

      .ct-area {
        animation: breathe 4.5s ease-in-out infinite !important;
        transform-origin: bottom !important;
      }

      .ct-point {
        animation: pointPulse 2.2s ease-in-out infinite !important;
      }
      .ct-point:nth-of-type(3n) { animation-delay: 0.4s !important; }
      .ct-point:nth-of-type(4n) { animation-delay: 0.9s !important; }
    </style>
    `;

    // Injeta o <defs>+filtro logo após a abertura do <svg>
    if (data.includes('<defs>')) {
      data = data.replace('</defs>', filterBlock + '</defs>');
    } else {
      data = data.replace('>', '>' + filterBlock);
    }

    // Envolve a área + linha (nessa ordem, adjacentes) com o filtro de fluxo contínuo
    const areaLineRe = /(<path[^>]*class="ct-area"[^>]*><\/path><path[^>]*class="ct-line"[^>]*><\/path>)/;
    if (areaLineRe.test(data)) {
      data = data.replace(areaLineRe, '<g filter="url(#flowRipple)">$1</g>');
    } else {
      console.warn('Aviso: não encontrei o par ct-area/ct-line pra aplicar o filtro de fluxo (formato da API pode ter mudado).');
    }

    // Injeta o <style> de animação por último, logo antes de fechar o SVG,
    // pra garantir precedência no cascade sobre o <style> nativo do Chartist
    data = data.replace(/<\/svg>\s*$/, styleBlock + '</svg>');

    fs.writeFileSync(outPath, data);
    console.log(`Animated graph saved to ${outPath}`);
  });
}).on('error', (err) => {
  console.error(err);
  process.exit(1);
});
