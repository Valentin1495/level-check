---
url: >-
  https://developers-apps-in-toss.toss.im/bedrock/reference/framework/인터렉션/requestReview.md
---

# 미니앱 리뷰 요청 (`requestReview`)

`requestReview`는 미니앱에서 사용자에게 리뷰 작성을 요청할 수 있는 API예요.

Android의 `In-App Review` API, iOS의 `SKStoreReviewController`와 비슷한 방향으로 동작하며,\
사용자가 서비스의 가치를 충분히 체감한 시점에 자연스럽게 리뷰를 남길 수 있도록 도와줘요.

## 시그니처

```typescript
function requestReview(): Promise<void>;
```

## 언제 호출하면 좋나요?

`requestReview`는 사용자가 앱의 가치를 충분히 느낀 시점에 호출하는 것을 권장해요.

예를 들면 아래와 같은 순간이 적절해요.

* 핵심 태스크를 성공적으로 완료한 직후
* 목표를 달성하거나 보상을 획득한 직후
* 반복 사용 후 만족도가 높을 것으로 예상되는 순간

이 시점에 호출하면 사용자가 긍정적인 경험을 한 상태에서 리뷰를 남기게 되어, 더 좋은 리뷰 품질을 기대할 수 있어요.

## 동작 방식

`requestReview`를 호출하면 사용자에게 아래 순서로 리뷰 플로우가 노출될 수 있어요.

1. 별점 입력 화면이 먼저 노출돼요.
2. 사용자가 **4점 이상**을 선택한 경우에만 텍스트 리뷰 작성 화면이 추가로 노출돼요.
3. 사용자가 **3점 이하**를 선택한 경우에는 텍스트 리뷰 작성 없이 별점만 수집돼요.

![](/assets/app_review.CeGr8qgY.webp)

## 사용 가이드

::: tip 호출해도 항상 노출되지는 않아요
`requestReview`를 호출하더라도 리뷰 입력 화면이 항상 표시되지는 않아요.

앱인토스 내부 정책에 따라 사용자의 피로도를 고려해 노출 여부가 결정돼요.\
따라서 리뷰 화면이 반드시 뜬다는 전제로 UX 흐름을 설계하면 안 돼요.
:::

* 사용자가 만족감을 느끼는 시점에만 호출해 주세요.
* 같은 세션 안에서 반복적으로 호출하지 마세요.
* 리뷰 요청이 노출되지 않더라도 사용 흐름이 자연스럽게 이어지도록 설계해 주세요.
* 리뷰 요청 노출 여부에 의존해 다음 화면으로 넘어가거나, 보상을 지급하는 흐름은 만들지 마세요.
* 호출 이후 아무 일도 일어나지 않는 것처럼 보일 수 있으므로, 기능적으로 필수인 흐름과 분리해 주세요.

## 예제

### 핵심 행동 완료 후 리뷰 요청하기

::: code-group

```js [js]
import { requestReview } from '@apps-in-toss/web-framework';

async function handleTaskCompleted() {
  await saveMissionResult();

  try {
    await requestReview();
  } catch (error) {
    console.error('리뷰 요청 실패:', error);
  }
}
```

```tsx [React]
import { requestReview } from '@apps-in-toss/web-framework';

function CompleteButton() {
  const handleComplete = async () => {
    await completeGoal();

    try {
      await requestReview();
    } catch (error) {
      console.error('리뷰 요청 실패:', error);
    }
  };

  return <button onClick={handleComplete}>완료하기</button>;
}
```

```tsx [React Native]
import { Button, Alert } from 'react-native';
import { requestReview } from '@apps-in-toss/framework';

function CompleteButton() {
  const handleComplete = async () => {
    await completeGoal();

    try {
      await requestReview();
    } catch (error) {
      Alert.alert('리뷰 요청 실패', String(error));
    }
  };

  return <Button title="완료하기" onPress={handleComplete} />;
}
```

:::

## 리뷰 확인

콘솔의 '평점 및 리뷰' 메뉴에서는 `requestReview`를 통해 수집된 리뷰와\
내비게이션 바의 '이용 후기 남기기'를 통해 작성된 리뷰를 모두 확인할 수 있어요.

![](/assets/console_review.BLNfqi3r.webp)

## 자주 묻는 질문
