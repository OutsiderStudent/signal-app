# Signal Phase Investigation App

현장에서 교차로 위치, 접근 방향, 신호 현시 이동류, 현시 시간과 메모를 기록하는 React 웹앱입니다.

## 주요 기능

- Google 일반/위성지도와 방향 마커
- 기본 4방향 및 5지 이상 교차로용 대각선 방향
- 방향별 직진·좌회전·우회전 조합 현시
- 개별/연속 현시 시간 기록
- Firebase 익명 인증과 Firestore 저장
- 프로젝트별 CSV 내보내기
- 모바일 반응형 UI 및 다크 모드

## 로컬 실행

Node.js 22와 npm을 사용합니다.

```bash
npm ci
npm start
```

테스트와 프로덕션 빌드:

```bash
npm test -- --watchAll=false
npm run build
```

## 웹 배포

- 소스 저장소: GitHub `OutsiderStudent/signal-app`
- 호스팅: Netlify
- 운영 URL: <https://signal-app-nyh.netlify.app>
- 운영 브랜치: `main`
- 빌드 명령: `npm run build`
- 배포 폴더: `build`

`main` 브랜치에 푸시하면 연결된 Netlify 프로젝트가 자동으로 빌드·배포합니다. 빌드 설정, SPA fallback, 응답 헤더는 `netlify.toml`에서 관리합니다.

## 배포 전 점검

1. 테스트와 프로덕션 빌드가 통과하는지 확인합니다.
2. Google Maps API 키의 HTTP referrer에 운영 도메인을 등록합니다.
3. Firebase Authentication의 익명 로그인을 활성화하고 운영 도메인을 허용합니다.
4. Firestore Security Rules가 사용자 UID별 데이터만 허용하는지 확인합니다.
5. Netlify Deploy Preview를 확인한 뒤 `main`에 병합합니다.

Firebase 웹 구성값은 클라이언트 식별 정보입니다. 실제 데이터 접근 통제는 Firestore Security Rules와 Firebase App Check로 관리해야 합니다. Google Maps 키는 Firebase 키와 분리하고 Maps/Places API 및 허용 도메인으로 제한합니다.

## 모바일 앱

현재 저장소에는 Capacitor 또는 Android 네이티브 프로젝트가 포함되어 있지 않습니다. APK/AAB 배포는 Capacitor 도입과 권한·서명·업데이트 정책을 별도 설계한 뒤 진행합니다.
