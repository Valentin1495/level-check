## 레벨 체크(Level Check) Toss 미니앱 MVP 이식

### Summary
- 타깃은 `level-check` 단독으로 진행하고, 1차는 **MVP 코어(과목 선택 → 단계별 풀이 → 결과)**만 구현합니다.
- 데이터는 기존 QuizRoom Supabase `swipe-feed`를 재사용합니다.
- 토스 비게임 앱 기준으로 `getAnonymousKey()`를 **즉시 식별키로 반영**합니다.
- 광고 로직은 제거하고, 엘리트 라운드는 이번 범위에서 제외합니다.
- 완료 기준은 `granite dev`에서 실데이터로 1회 완주 검증입니다.

### Implementation Changes
- 도메인 로직 이식:
  - QuizRoom의 실력 측정 단계 규칙(학년 단계, 문제 수, 허용 오답 수)과 결과 계산 로직을 `level-check` 도메인 모듈로 분리 이식.
  - `calculateAssessmentResult` 중심으로 결과 산출을 동일하게 유지.
- 데이터/피드 클라이언트 추가:
  - `swipe-feed` 호출 전용 클라이언트 추가(직접 HTTP 호출).
  - 요청 파라미터는 `category/tags/deckSlug/subject/eduLevel/excludeIds/limit/cursor`를 지원.
  - 응답은 화면에서 필요한 필드만 정규화(문항, 보기, 정답 인덱스, 해설, 난이도).
- 토스 식별키 어댑터 추가:
  - `getAnonymousKey()` 호출 결과를 앱 내부 `userHash`로 저장 후 피드/기록 요청에 포함.
  - `undefined`/`ERROR` 시에는 로컬 세션 ID로 폴백하여 플레이는 항상 가능하게 유지.
- 화면 구성/상태 전환:
  - 기존 홈 화면을 실력 측정 엔트리로 교체하고, 단계 진행형 퀴즈 UI로 재구성.
  - 스와이프 카드 전체 이식 대신 MVP용 문제 카드(보기 선택 + 제출 + 다음 문제)로 구현.
  - 단계 실패/성공 분기, 다음 단계 이동, 최종 결과 화면까지 포함.
- 설정 방식:
  - Supabase URL/Anon Key는 1차에서 `runtime config` 상수 모듈로 주입(환경변수는 후속).

대표 편집 대상:
- [index.tsx](src/pages/index.tsx)
- [assessment.ts](src/domain/assessment.ts)
- [feed-client.ts](src/lib/feed-client.ts)

### Public APIs / Interfaces
- `AssessmentStageResult`, `EducationLevelKey`, `AssessmentResult` 타입을 level-check 도메인에 신규 정의.
- `fetchAssessmentQuestions(params)` 인터페이스 추가:
  - 입력: `subject`, `eduLevel`, `excludeIds`, `cursor`, `limit` 등
  - 출력: `{ items, nextCursor, hasMore }`
- `resolveUserKey()` 인터페이스 추가:
  - 출력: `{ type: 'hash' | 'fallback'; value: string }`

### Test Plan
- 단위 테스트:
  - 단계별 정답/오답 조합별 결과 점수 및 top% 계산 검증.
  - 단계 실패 시 상한(percentile floor) 반영 여부 검증.
  - `resolveUserKey()`의 성공/오류/미지원 버전 폴백 분기 검증.
- 통합 시나리오(수동):
  - 과목 선택 후 1단계~최종단계까지 정상 완주.
  - 단계 실패 후 종료/재시작 동작.
  - 네트워크 오류 시 재시도 및 사용자 메시지.
  - 토스 샌드박스/실기기에서 `getAnonymousKey()` 수집 및 실제 피드 요청 성공 확인.

### Assumptions & Defaults
- 앱 분류는 **비게임**으로 고정.
- 광고/보상/라이프라인/엘리트 라운드는 1차 범위 제외.
- QuizRoom의 `swipe-feed` 계약(요청/응답 스키마)은 현재 기준 그대로 사용 가능하다고 가정.
- 한글 텍스트는 레벨 체크에서 UTF-8 기준으로 신규 정리해 깨짐 없이 재작성.
