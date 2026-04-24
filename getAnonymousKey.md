---
url: >-
  https://developers-apps-in-toss.toss.im/bedrock/reference/framework/비게임/getAnonymousKey.md
---

# 유저 식별키 발급 (`getAnonymousKey`) - 비게임

`getAnonymousKey`는 비게임 미니앱에서 유저를 식별하기 위한 API예요.\
토스 로그인처럼 별도의 인증 화면이나 서버 연동 없이, 미니앱 내부에서 고유한 유저 식별자를 바로 얻을 수 있어요.

이 함수는 **비게임 카테고리 미니앱에서만 사용 가능**하며, 반환되는 유저 식별자(`hash`)는 **미니앱별로 고유**해요.

::: tip 주의하세요

* 이 함수는 **비게임 카테고리 미니앱에서만 사용 가능**해요. 게임 미니앱에서 호출하면 `'INVALID_CATEGORY'`를 반환해요.
* **SDK 2.4.5 이상**에서 지원돼요. 그 이하 버전에서는 `undefined`를 반환해요.
* 반환되는 유저 키는 **토스 서버 API 호출용 키가 아니에요.**
  * 내부 유저 식별, 데이터 관리 용도로만 사용해 주세요.
* 샌드박스 환경에서는 **mock 데이터**가 내려와요. 실제 동작은 QR 코드로 토스앱에서 테스트해 주세요.
  :::

## 시그니처

```typescript
function getAnonymousKey(): Promise<GetAnonymousKeySuccessResponse | 'INVALID_CATEGORY' | 'ERROR' | undefined>;
```

### 반환 값

사용자 키 조회 결과를 반환해요.

* `GetAnonymousKeySuccessResponse`: 사용자 키 조회에 성공했어요. `{ type: 'HASH', hash: string }` 형태로 반환돼요.
  * `hash` 값은 해당 미니앱에서만 유효한 유저 식별자예요.
* `'INVALID_CATEGORY'`: 비게임 카테고리가 아닌 미니앱에서 호출했어요.
* `'ERROR'`: 알 수 없는 오류가 발생했어요.
* `undefined`: SDK 버전이 최소 지원 버전보다 낮아요.

## 예제 : 유저 식별자 가져오기

아래 예제는 비게임 미니앱에서 `getAnonymousKey`를 호출해 유저 식별자를 받아 처리하는 기본적인 흐름을 보여줘요.

::: code-group

```js [js]
import { getAnonymousKey } from '@apps-in-toss/web-framework';

async function handleGetUserKey() {
  const result = await getAnonymousKey();

  if (!result) {
    console.warn('지원하지 않는 SDK 버전이에요.');
  } else if (result === 'INVALID_CATEGORY') {
    console.error('비게임 카테고리가 아닌 미니앱이에요.');
  } else if (result === 'ERROR') {
    console.error('사용자 키 조회 중 오류가 발생했어요.');
  } else if (result.type === 'HASH') {
    console.log('사용자 키:', result.hash);
    // 여기에서 사용자 키를 사용해 데이터를 관리할 수 있어요.
  }
}
```

```tsx [React]
// webview
import { getAnonymousKey } from '@apps-in-toss/web-framework';

function UserKeyButton() {
  async function handleClick() {
    const result = await getAnonymousKey();

    if (!result) {
      console.warn('지원하지 않는 SDK 버전이에요.');
      return;
    }

    if (result === 'INVALID_CATEGORY') {
      console.error('비게임 카테고리가 아닌 미니앱이에요.');
      return;
    }

    if (result === 'ERROR') {
      console.error('사용자 키 조회 중 오류가 발생했어요.');
      return;
    }

    if (result.type === 'HASH') {
      console.log('사용자 키:', result.hash);
      // 여기에서 사용자 키를 사용해 데이터를 관리할 수 있어요.
    }
  }

  return <button onClick={handleClick}>유저 키 가져오기</button>;
}
```

```tsx [React Native]
// react-native
import { Button } from 'react-native';
import { getAnonymousKey } from '@apps-in-toss/framework';

function UserKeyButton() {
  async function handlePress() {
    const result = await getAnonymousKey();

    if (!result) {
      console.warn('지원하지 않는 SDK 버전이에요.');
      return;
    }

    if (result === 'INVALID_CATEGORY') {
      console.error('비게임 카테고리가 아닌 미니앱이에요.');
      return;
    }

    if (result === 'ERROR') {
      console.error('사용자 키 조회 중 오류가 발생했어요.');
      return;
    }

    if (result.type === 'HASH') {
      console.log('사용자 키:', result.hash);
      // 여기에서 사용자 키를 사용해 데이터를 관리할 수 있어요.
    }
  }

  return <Button onPress={handlePress} title="유저 키 가져오기" />;
}
```

:::

## 참고사항

* `getAnonymousKey`는 비게임 미니앱 전용 유저 식별 수단이에요.
* 토스 로그인(`appLogin`)과 달리 서버 API 연동 없이도 사용할 수 있어요.
* 유저 데이터는 이 유저 키를 기준으로 관리하는 것을 권장해요.
