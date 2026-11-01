// 공개 사이트(GitHub Pages)에는 평가 서버가 없다. 서버 API(/api/…) 요청을 이 파일이 대신 받는다.
//  - 실험자: 응답을 모을 서버가 없으므로 「지금은 실험 접수를 받지 않는」 상태로 답한다.
//  - 관리자: 로그인을 받지 않는다. 관리는 평가 서버(seeon-eval-web)에서 한다.
//  - 일반객 체험은 서버를 쓰지 않는다(visitor.js 가 data/visitor/ 를 직접 읽는다).
// 돌려주는 값은 { status, data } 이고, common.js 의 api() 가 서버 응답과 똑같이 다룬다.

const ok = (data) => ({ status: 200, data });
const fail = (status, error, message) => ({ status, data: { error, message } });

export async function staticApi(path) {
  const [route] = path.split('?');

  if (route === '/api/exp/status') return ok({ open: false, ready: false, requireDesktop: false, visualOptions: [] });
  if (route === '/api/exp/abort') return ok({ ok: true });
  if (route.startsWith('/api/exp/')) return fail(403, 'closed', '지금은 실험 접수를 받지 않습니다.');

  if (route === '/api/admin/login') {
    return fail(403, 'static_site', '이 공개 사이트에서는 관리자 기능을 쓸 수 없습니다. 평가 서버에서 로그인해 주세요.');
  }
  if (route === '/api/admin/logout') return ok({ ok: true });
  if (route.startsWith('/api/admin/')) return fail(401, 'unauthorized', '로그인이 필요합니다.');

  return fail(404, 'not_found', '없는 주소입니다.');
}
