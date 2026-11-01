// SEEON 로고 (Logo 2-A를 벡터로 옮긴 것). 색은 currentColor라 CSS color로 바꾼다.
// 마크: 재생 버튼 모양의 C + 소리 막대 5개 / 글자: S ≡ ≡ O N

// C의 왼쪽은 굵기 40인 선, 두 팔은 끝으로 갈수록 가늘어지는 면(원본처럼)
const MARK_PATH = 'M74.7 26.7Q20 2 20 62V176Q20 236 74.7 211.3';
const ARMS = ['M65.96 44.69L128.44 69.49A15 15 0 0 0 141.56 42.56L83.44 8.71Z', 'M65.96 193.31L128.44 168.51A15 15 0 0 1 141.56 195.44L83.44 229.29Z'];
const BARS = [
  [103, 111, 35],
  [134, 92, 68],
  [168, 69, 116],
  [202, 87, 82],
  [234, 107, 44],
];
const WORD_PATHS = [
  'M42 4H11.25A7.25 7.25 0 0 0 11.25 18.5H34.75A7.25 7.25 0 0 1 34.75 33H4',
  'M62 4H100M62 18.5H100M62 33H100',
  'M119 4H158M119 18.5H158M119 33H158',
  'M187 4H208A10 10 0 0 1 218 14V23A10 10 0 0 1 208 33H187A10 10 0 0 1 177 23V14A10 10 0 0 1 187 4Z',
  'M234 33V4L276 33V4',
];

export function markSvg({ label = 'SEEON', className = '' } = {}) {
  return `<svg class="seeon-mark ${className}" viewBox="0 0 256 238" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'} xmlns="http://www.w3.org/2000/svg">
  <path class="mark-c" d="${MARK_PATH}" fill="none" stroke="currentColor" stroke-width="40" stroke-linecap="round" stroke-linejoin="round" pathLength="1"/>
  ${ARMS.map((d, i) => `<path class="mark-arm a${i + 1}" d="${d}" fill="currentColor"/>`).join('')}
  ${BARS.map(([x, y, hgt], i) => `<rect class="mark-bar b${i + 1}" x="${x}" y="${y}" width="22" height="${hgt}" rx="11" fill="currentColor"/>`).join('')}
</svg>`;
}

export function wordmarkSvg({ label = '', className = '' } = {}) {
  return `<svg class="seeon-word ${className}" viewBox="0 0 280 37" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'} xmlns="http://www.w3.org/2000/svg">
  <g fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
    ${WORD_PATHS.map((d, i) => `<path class="word-l l${i + 1}" d="${d}"/>`).join('')}
  </g>
</svg>`;
}

// 가로형 로고: 마크 + 글자
export function lockupHtml({ sub = '' } = {}) {
  return `<span class="lockup">${markSvg({ label: '' })}${wordmarkSvg({ label: 'SEEON' })}</span>${sub ? `<span class="brand-sub">${sub}</span>` : ''}`;
}

// <a data-logo="부제"> 자리에 로고를 채운다
export function mountLogos(root = document) {
  for (const el of root.querySelectorAll('[data-logo]')) {
    el.innerHTML = lockupHtml({ sub: el.dataset.logo });
  }
}
