import { clear, h } from '../common.js';
import { section, viewHead } from './ui.js';

const item = (title, desc, href, label) =>
  h('div', { class: 'panel', style: { display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'center', flexWrap: 'wrap' } },
    h('div', null, h('b', null, title), h('p', { class: 'muted small', style: { margin: '4px 0 0' } }, desc)),
    h('a', { class: 'btn', href }, label));

export async function render(root) {
  clear(root,
    viewHead('내보내기·백업', '분석·보고에 쓸 파일을 받습니다. 개인정보가 든 파일은 팀 밖으로 보내지 마세요.'),
    section('결과',
      h('div', { style: { display: 'grid', gap: '10px' } },
        item('결과 엑셀 (개인정보 제외)', '요약·도메인×대분류×소분류·문항별·문항 단위 응답·참가자·조건 설명 시트. 참가자는 코드(P001)로만 나옵니다.', '/api/admin/export/results.xlsx', '받기 (.xlsx)'),
        item('문항 단위 응답 CSV (개인정보 제외)', '한 줄 = 응답 하나(participant·condition·question·correct…). 혼합효과 모형·부트스트랩 등 R/Python 분석의 입력입니다.', '/api/admin/export/responses.csv', '받기 (.csv)'),
        item('결과 엑셀 (개인정보 포함)', '이름·전화번호가 들어 있습니다. 사례 지급·연락용으로만 쓰세요.', '/api/admin/export/results.xlsx?pii=1', '받기 (.xlsx)'),
        item('문항 전체', '콘텐츠·문항·정답·근거를 엑셀로 받습니다. 고친 뒤 「엑셀 가져오기」로 다시 올릴 수 있습니다.', '/api/admin/questions/export.xlsx', '받기 (.xlsx)'))),
    section('백업',
      h('div', { style: { display: 'grid', gap: '10px' } },
        item('DB 백업 (.db)', '참가자·응답·문항·설정이 모두 든 SQLite 파일 하나입니다. 실험이 끝날 때마다 받아 두세요. 영상·오디오는 서버 컴퓨터의 data/uploads 폴더를 따로 복사해야 합니다.', '/api/admin/export/backup.db', '받기 (.db)'))),
  );
}
